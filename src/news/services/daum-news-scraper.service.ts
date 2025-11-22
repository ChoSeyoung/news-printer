import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

/**
 * 다음 뉴스 기사 데이터 인터페이스
 */
export interface DaumArticleData {
  /** 기사 제목 */
  title: string;
  /** 기사 본문 내용 */
  content: string;
  /** 기사 URL */
  url: string;
  /** 이미지 URL 배열 (하단 100px 크롭 처리됨) */
  imageUrls: string[];
  /** 크롭된 이미지 로컬 경로 배열 */
  croppedImagePaths: string[];
  /** 카테고리 (president/assembly) */
  category: 'president' | 'assembly';
}

/**
 * 다음 뉴스 스크래핑 서비스
 *
 * 다음 뉴스 대통령실/국회 페이지에서 기사를 크롤링합니다.
 *
 * 주요 기능:
 * - 뉴스 목록 페이지에서 기사 링크 추출
 * - 개별 기사 페이지에서 제목, 본문, 이미지 추출
 * - 이미지 하단 100px 크롭 (워터마크 제거)
 */
@Injectable()
export class DaumNewsScraperService {
  private readonly logger = new Logger(DaumNewsScraperService.name);

  /** HTTP 요청 타임아웃 (밀리초) */
  private readonly timeout = 15000;

  /** 임시 이미지 저장 경로 */
  private readonly tempImageDir = '/tmp/daum-news-images';

  /** 다음 뉴스 목록 URL */
  private readonly listUrls = {
    president: 'https://news.daum.net/president',
    assembly: 'https://news.daum.net/assembly',
  };

  constructor() {
    this.ensureTempDir();
  }

  /**
   * 임시 디렉토리 생성
   */
  private async ensureTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempImageDir, { recursive: true });
    } catch (error) {
      this.logger.warn('Failed to create temp directory:', error.message);
    }
  }

  /**
   * 모든 카테고리에서 뉴스 기사 목록 가져오기
   *
   * @param limit - 각 카테고리별 최대 기사 수
   * @returns 기사 데이터 배열
   */
  async fetchAllNews(limit: number = 10): Promise<DaumArticleData[]> {
    const results: DaumArticleData[] = [];

    for (const category of ['president', 'assembly'] as const) {
      try {
        const articles = await this.fetchNewsByCategory(category, limit);
        results.push(...articles);
      } catch (error) {
        this.logger.error(`Failed to fetch ${category} news:`, error.message);
      }
    }

    return results;
  }

  /**
   * 특정 카테고리의 뉴스 기사 목록 가져오기
   *
   * @param category - 카테고리 (president/assembly)
   * @param limit - 최대 기사 수
   * @returns 기사 데이터 배열
   */
  async fetchNewsByCategory(
    category: 'president' | 'assembly',
    limit: number = 10,
  ): Promise<DaumArticleData[]> {
    const listUrl = this.listUrls[category];
    this.logger.log(`Fetching news list from: ${listUrl}`);

    try {
      // 1. 뉴스 목록 페이지에서 기사 URL 추출
      const articleUrls = await this.extractArticleUrls(listUrl, limit);
      this.logger.log(`Found ${articleUrls.length} articles in ${category}`);

      // 2. 각 기사 페이지에서 상세 내용 추출
      const articles: DaumArticleData[] = [];

      for (const url of articleUrls) {
        try {
          const article = await this.fetchArticleDetail(url, category);
          if (article) {
            articles.push(article);
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch article ${url}:`, error.message);
        }
      }

      return articles;
    } catch (error) {
      this.logger.error(`Failed to fetch ${category} news list:`, error.message);
      return [];
    }
  }

  /**
   * 뉴스 목록 페이지에서 기사 URL 추출
   *
   * @param listUrl - 목록 페이지 URL
   * @param limit - 최대 기사 수
   * @returns 기사 URL 배열
   */
  private async extractArticleUrls(listUrl: string, limit: number): Promise<string[]> {
    const html = await this.fetchHtml(listUrl);
    const $ = cheerio.load(html);

    const urls: string[] = [];

    // ul.list_newsheadline2 > li > a 에서 href 추출
    $('ul.list_newsheadline2 li a').each((_, element) => {
      if (urls.length >= limit) return false;

      const href = $(element).attr('href');
      if (href && href.includes('/v/')) {
        // 상대 경로인 경우 절대 경로로 변환
        const fullUrl = href.startsWith('http') ? href : `https://news.daum.net${href}`;
        if (!urls.includes(fullUrl)) {
          urls.push(fullUrl);
        }
      }
    });

    return urls;
  }

  /**
   * 개별 기사 페이지에서 상세 내용 추출
   *
   * @param url - 기사 URL
   * @param category - 카테고리
   * @returns 기사 데이터
   */
  private async fetchArticleDetail(
    url: string,
    category: 'president' | 'assembly',
  ): Promise<DaumArticleData | null> {
    this.logger.debug(`Fetching article: ${url}`);

    const html = await this.fetchHtml(url);
    const $ = cheerio.load(html);

    // 제목 추출: h3.tit_view
    const title = $('h3.tit_view').text().trim();
    if (!title) {
      this.logger.warn(`No title found for: ${url}`);
      return null;
    }

    // 본문 추출: div.article_view 내 p 태그만 추출
    const contentElement = $('div.article_view');
    const paragraphs: string[] = [];
    contentElement.find('p').each((_, element) => {
      const text = $(element).text().trim();
      if (text && text.length > 10) {
        paragraphs.push(text);
      }
    });
    const content = paragraphs.join('\n\n');
    if (!content) {
      this.logger.warn(`No content found for: ${url}`);
      return null;
    }

    // 이미지 URL 추출 - data-org-src 속성 우선 사용 (원본 고화질 이미지)
    const imageUrls: string[] = [];

    contentElement.find('img').each((_, element) => {
      // data-org-src 우선, 없으면 src 또는 data-src 사용
      const orgSrc = $(element).attr('data-org-src');
      const src = orgSrc || $(element).attr('src') || $(element).attr('data-src');

      if (src && !src.toLowerCase().endsWith('.gif')) {
        const fullSrc = src.startsWith('http') ? src : `https:${src}`;
        if (!imageUrls.includes(fullSrc)) {
          imageUrls.push(fullSrc);
          this.logger.debug(`Found image: ${fullSrc} (from ${orgSrc ? 'data-org-src' : 'src'})`);
        }
      }
    });

    // 최대 5개 이미지만 사용 (다운로드 없이 URL만 저장)
    const selectedImageUrls = imageUrls.slice(0, 5);

    this.logger.debug(
      `Extracted: "${title}" - ${content.length} chars, ${selectedImageUrls.length} images`,
    );

    return {
      title,
      content,
      url,
      imageUrls: selectedImageUrls,
      croppedImagePaths: selectedImageUrls, // URL을 직접 사용 (더 이상 로컬 파일 아님)
      category,
    };
  }

  /**
   * 이미지 다운로드 및 하단 100px 크롭
   *
   * @param imageUrl - 이미지 URL
   * @returns 크롭된 이미지의 로컬 경로
   */
  private async downloadAndCropImage(imageUrl: string): Promise<string | null> {
    try {
      // 이미지 다운로드
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        },
      });

      const imageBuffer = Buffer.from(response.data);

      // 이미지 메타데이터 확인
      const metadata = await sharp(imageBuffer).metadata();
      if (!metadata.width || !metadata.height) {
        this.logger.warn('Could not get image metadata');
        return null;
      }

      // 이미지가 100px보다 작으면 크롭하지 않음
      if (metadata.height <= 100) {
        this.logger.debug('Image too small to crop, skipping');
        return null;
      }

      // 하단 100px 제거하여 크롭
      const newHeight = metadata.height - 100;
      const croppedBuffer = await sharp(imageBuffer)
        .extract({
          left: 0,
          top: 0,
          width: metadata.width,
          height: newHeight,
        })
        .jpeg({ quality: 85 })
        .toBuffer();

      // 임시 파일로 저장
      const filename = `daum_${uuidv4()}.jpg`;
      const filepath = path.join(this.tempImageDir, filename);
      await fs.writeFile(filepath, croppedBuffer);

      this.logger.debug(`Cropped image saved: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.warn(`Failed to download/crop image:`, error.message);
      return null;
    }
  }

  /**
   * URL에서 HTML 가져오기
   *
   * @param url - 가져올 URL
   * @returns HTML 문자열
   */
  private async fetchHtml(url: string): Promise<string> {
    const response = await axios.get(url, {
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    return response.data;
  }

  /**
   * 크롭된 이미지 파일 삭제
   *
   * @param filepath - 삭제할 파일 경로
   */
  async deleteImageFile(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
      this.logger.debug(`Deleted image file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete image file ${filepath}:`, error.message);
    }
  }

  /**
   * 모든 임시 이미지 파일 정리
   */
  async cleanupAllImages(): Promise<void> {
    try {
      const files = await fs.readdir(this.tempImageDir);
      for (const file of files) {
        if (file.startsWith('daum_')) {
          await this.deleteImageFile(path.join(this.tempImageDir, file));
        }
      }
      this.logger.log('Cleaned up all temporary images');
    } catch (error) {
      this.logger.warn('Failed to cleanup images:', error.message);
    }
  }
}
