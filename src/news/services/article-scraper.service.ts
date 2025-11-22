import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * 기사 데이터 인터페이스
 */
export interface ArticleData {
  /** 기사 전체 내용 */
  content: string;
  /** 기사 이미지 URL 배열 */
  imageUrls: string[];
}

/**
 * 기사 스크래핑 서비스
 *
 * 조선일보 기사 페이지에서 전체 내용과 이미지를 추출합니다.
 *
 * 주요 기능:
 * - Fusion.globalContent JSON에서 기사 내용 및 이미지 추출 (주 방법)
 * - HTML 파싱을 통한 기사 내용 추출 (대체 방법)
 * - GIF 이미지 자동 필터링 (FFmpeg 호환성)
 * - 병렬 처리를 통한 다중 기사 스크래핑
 */
@Injectable()
export class ArticleScraperService {
  private readonly logger = new Logger(ArticleScraperService.name);

  /** HTTP 요청 타임아웃 (밀리초) */
  private readonly timeout = 10000;

  /** 최대 동시 요청 수 (병렬 처리 제한) */
  private readonly maxConcurrent = 5;

  /**
   * 조선일보 기사 URL에서 전체 내용 및 이미지를 가져옵니다
   *
   * @param url - 기사 URL
   * @returns 기사 데이터 (내용, 이미지 URL)
   *
   * 추출 방법:
   * 1. 방법 1 (주): Fusion.globalContent JavaScript 객체에서 추출
   *    - JSON 형식으로 구조화된 데이터
   *    - 이미지 URL 포함
   *    - GIF 이미지 자동 필터링
   * 2. 방법 2 (대체): HTML 파싱으로 <p class="article-body__content-text"> 추출
   *    - Fusion.globalContent를 찾을 수 없을 때 사용
   *    - 이미지는 추출하지 않음
   */
  async fetchArticleContent(url: string): Promise<ArticleData> {
    try {
      this.logger.debug(`Fetching article content from: ${url}`);

      // HTML 다운로드
      const html = await this.fetchHtml(url);

      // 기사 내용 파싱
      const articleData = this.parseArticleContent(html, url);

      // 내용이 비어있으면 경고
      if (!articleData.content || articleData.content.length === 0) {
        this.logger.warn(`No content found for URL: ${url}`);
        return { content: '', imageUrls: [] };
      }

      this.logger.debug(`Successfully fetched ${articleData.content.length} characters and ${articleData.imageUrls.length} images from ${url}`);
      return articleData;
    } catch (error) {
      this.logger.error(`Failed to fetch article content from ${url}:`, error.message);
      return { content: '', imageUrls: [] };
    }
  }

  /**
   * 여러 기사를 병렬로 가져옵니다 (동시 요청 수 제한)
   *
   * @param urls - 기사 URL 배열
   * @returns 기사 데이터 배열 (입력 순서와 동일)
   *
   * 병렬 처리 방식:
   * - maxConcurrent 개씩 배치로 나눠서 처리
   * - 각 배치는 Promise.all로 병렬 실행
   * - 순서는 입력 URL 배열과 동일하게 유지
   */
  async fetchMultipleArticles(urls: string[]): Promise<ArticleData[]> {
    // 결과 배열 초기화 (순서 유지를 위해 미리 생성)
    const results: ArticleData[] = new Array(urls.length).fill(null).map(() => ({ content: '', imageUrls: [] }));

    // 배치 단위로 처리 (동시 요청 수 제한)
    for (let i = 0; i < urls.length; i += this.maxConcurrent) {
      const batch = urls.slice(i, i + this.maxConcurrent);

      // 현재 배치 병렬 실행
      const batchResults = await Promise.all(
        batch.map((url) => this.fetchArticleContent(url)),
      );

      // 결과를 올바른 위치에 저장
      batchResults.forEach((articleData, index) => {
        results[i + index] = articleData;
      });
    }

    return results;
  }

  /**
   * URL에서 HTML을 가져옵니다
   *
   * @param url - 가져올 URL
   * @returns HTML 문자열
   *
   * 요청 헤더:
   * - User-Agent: 봇 차단 방지
   * - Accept: HTML 문서 요청
   * - Accept-Language: 한국어 우선
   */
  private async fetchHtml(url: string): Promise<string> {
    const response = await axios.get(url, {
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    return response.data;
  }

  /**
   * HTML에서 기사 내용을 파싱합니다
   *
   * @param html - HTML 문자열
   * @param url - 기사 URL (언론사 판별용)
   * @returns 기사 데이터 (내용, 이미지 URL)
   *
   * 추출 우선순위:
   * 1. Fusion.globalContent (주 방법) - JavaScript 객체에서 구조화된 데이터 추출
   * 2. HTML 파싱 (대체 방법) - Cheerio로 HTML 태그에서 텍스트 추출
   */
  private parseArticleContent(html: string, url: string): ArticleData {
    // 방법 1: Fusion.globalContent에서 추출 시도
    const fusionData = this.extractFusionGlobalContent(html, url);
    if (fusionData.content) {
      this.logger.debug('Successfully extracted content from Fusion.globalContent');
      return fusionData;
    }

    // 방법 2: HTML 파싱으로 대체
    this.logger.debug('Fusion.globalContent not found, falling back to HTML parsing');
    return this.parseHtmlContent(html, url);
  }

  /**
   * Fusion.globalContent JavaScript 객체에서 기사 내용 및 이미지를 추출합니다
   *
   * @param html - HTML 문자열
   * @param url - 기사 URL (언론사 판별용)
   * @returns 기사 데이터 (내용, 이미지 URL)
   *
   * 추출 프로세스:
   * 1. 정규식으로 `Fusion.globalContent = {...};` 패턴 찾기
   * 2. JSON 파싱
   * 3. content_elements 배열에서 텍스트 및 이미지 추출
   * 4. GIF 이미지 필터링 (FFmpeg와 호환되지 않음)
   * 5. 연합뉴스의 경우 첫 번째 이미지 제외 (기자 얼굴 사진)
   *
   * content_elements 구조:
   * - type: 'text' -> content 필드에 텍스트
   * - type: 'image' -> url 필드에 이미지 URL
   */
  private extractFusionGlobalContent(html: string, url: string): ArticleData {
    try {
      // 정규식: Fusion.globalContent = {...};
      const regex = /Fusion\.globalContent\s*=\s*(\{[\s\S]*?\});/;
      const match = html.match(regex);

      if (!match || !match[1]) {
        return { content: '', imageUrls: [] };
      }

      // JSON 파싱
      const globalContent = JSON.parse(match[1]);

      // content_elements 배열 확인
      if (!Array.isArray(globalContent.content_elements)) {
        return { content: '', imageUrls: [] };
      }

      const contentParts: string[] = [];
      let imageUrls: string[] = [];

      // content_elements 순회
      globalContent.content_elements.forEach((item: any) => {
        // 텍스트 추출
        if (item.type === 'text' && item.content) {
          const cleanContent = this.removeEscapeCharacters(item.content.trim());
          if (cleanContent) {
            contentParts.push(cleanContent);
          }
        }

        // 이미지 URL 추출 (GIF 제외 - FFmpeg의 -loop 옵션과 호환되지 않음)
        if (item.type === 'image' && item.url) {
          const urlLower = item.url.toLowerCase();
          if (!urlLower.endsWith('.gif')) {
            imageUrls.push(item.url);
            this.logger.debug(`Extracted image URL: ${item.url}`);
          } else {
            this.logger.debug(`Skipped GIF image: ${item.url}`);
          }
        }
      });

      // 연합뉴스의 경우 첫 번째 이미지 제외 (기자 얼굴 사진)
      if (url.includes('yna.co.kr') && imageUrls.length > 0) {
        this.logger.debug(`Skipping first image for Yonhap News (reporter photo): ${imageUrls[0]}`);
        imageUrls = imageUrls.slice(1);
      }

      this.logger.debug(`Extracted ${contentParts.length} text parts and ${imageUrls.length} images from Fusion.globalContent`);

      return {
        content: contentParts.join('\n\n'),
        imageUrls,
      };
    } catch (error) {
      this.logger.warn('Failed to parse Fusion.globalContent:', error.message);
      return { content: '', imageUrls: [] };
    }
  }

  /**
   * Cheerio를 사용하여 HTML에서 기사 내용을 파싱합니다 (대체 방법)
   *
   * @param html - HTML 문자열
   * @param url - 기사 URL (언론사 판별용)
   * @returns 기사 데이터 (내용, 이미지 URL)
   *
   * 추출 방법:
   * - 다중 언론사 셀렉터 지원
   * - 조선일보, 한겨레, 연합뉴스 등 각 언론사별 HTML 구조 대응
   * - 연합뉴스의 경우 첫 번째 이미지 제외 (기자 얼굴 사진)
   */
  private parseHtmlContent(html: string, url: string): ArticleData {
    const $ = cheerio.load(html);

    // 다중 언론사 셀렉터 (우선순위 순서)
    const contentSelectors = [
      // 조선일보
      '.article-body__content-text',
      // SBS 뉴스 - text_area 내부의 텍스트를 직접 추출 (p 태그 없이 br로 구분)
      '.text_area[itemprop="articleBody"]',
      '.text_area',
      '.main_text',
      '.article_cont_area',
      '.w_article_cont',
      // 한겨레
      '.article-text p',
      '.text p',
      '#a-left-scroll p',
      'article p',
      // 연합뉴스
      '.article-txt p',
      '.story-news article p',
      // 일반적인 기사 셀렉터
      '.article-content p',
      '.news-content p',
      '.content p',
      'article.content p',
      // 최후의 수단: 본문 영역 p 태그
      '#article-body p',
      '.article_body p',
    ];

    const paragraphs: string[] = [];
    let imageUrls: string[] = [];

    // 각 셀렉터를 순차적으로 시도
    for (const selector of contentSelectors) {
      $(selector).each((_, element) => {
        const text = this.removeEscapeCharacters($(element).text().trim());
        if (text && text.length > 20) { // 너무 짧은 텍스트 제외
          paragraphs.push(text);
        }
      });

      if (paragraphs.length > 0) {
        this.logger.debug(`Found ${paragraphs.length} paragraphs using selector: ${selector}`);
        break; // 첫 번째로 성공한 셀렉터로 중단
      }
    }

    // 이미지 추출 시도
    // 뉴시스의 경우 article_photo 클래스 내부의 이미지만 추출
    const imageSelectors = url.includes('newsis.com')
      ? ['.article_photo img']
      : [
          '.article-text img',
          '.text img',
          'article img',
          '.article-content img',
          '#article-body img',
        ];

    for (const selector of imageSelectors) {
      $(selector).each((_, element) => {
        const src = $(element).attr('src') || $(element).attr('data-src');
        if (src && !src.toLowerCase().endsWith('.gif')) {
          // 상대 경로를 절대 경로로 변환
          const absoluteUrl = src.startsWith('http') ? src : `https:${src.startsWith('//') ? src : `//${src}`}`;
          if (!imageUrls.includes(absoluteUrl)) {
            imageUrls.push(absoluteUrl);
          }
        }
      });

      if (imageUrls.length > 0) {
        break;
      }
    }

    // 연합뉴스의 경우 첫 번째 이미지 제외 (기자 얼굴 사진)
    if (url.includes('yna.co.kr') && imageUrls.length > 0) {
      this.logger.debug(`Skipping first image for Yonhap News (reporter photo): ${imageUrls[0]}`);
      imageUrls = imageUrls.slice(1);
    }

    if (paragraphs.length === 0) {
      this.logger.debug('No paragraphs found with any selector');
      return { content: '', imageUrls: [] };
    }

    // 단락들을 이중 개행으로 연결
    return {
      content: paragraphs.join('\n\n'),
      imageUrls,
    };
  }

  /**
   * 문자열에서 이스케이프 문자를 실제 문자로 변환합니다
   *
   * @param content - 이스케이프 문자가 포함된 문자열
   * @returns 변환된 문자열
   *
   * 변환 항목:
   * - \\n -> 개행
   * - \\r -> 캐리지 리턴
   * - \\t -> 탭
   * - \\" -> 큰따옴표
   * - \\' -> 작은따옴표
   * - \\\\ -> 백슬래시
   */
  private removeEscapeCharacters(content: string): string {
    return content
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
}
