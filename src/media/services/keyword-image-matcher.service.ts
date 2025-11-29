import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { KoreanTextAnalyzer } from '../../common/utils/korean-text-analyzer.util';

/**
 * 키워드-이미지 매칭 서비스
 *
 * 뉴스 기사의 키워드를 분석하여 해당하는 로컬 이미지를 찾습니다.
 * assets/keywords/ 디렉토리에서 키워드에 해당하는 이미지를 검색합니다.
 *
 * 이미지 파일명 규칙:
 * - 단일 이미지: {키워드}.jpg
 * - 여러 이미지: {키워드}_1.jpg, {키워드}_2.jpg, ...
 *
 * 예시:
 * - 국회.jpg, 국회_1.jpg, 국회_2.jpg
 * - 대통령.jpg
 * - 선거_1.jpg, 선거_2.jpg, 선거_3.jpg
 */
@Injectable()
export class KeywordImageMatcherService {
  private readonly logger = new Logger(KeywordImageMatcherService.name);
  private readonly keywordImageDir: string;
  private imageCache: Map<string, string[]>; // 키워드 → 이미지 경로 배열

  constructor() {
    this.keywordImageDir = path.join(process.cwd(), 'assets', 'keywords');
    this.imageCache = new Map();
    this.initializeCache();
  }

  /**
   * 이미지 캐시 초기화
   * assets/keywords/ 디렉토리를 스캔하여 키워드-이미지 매핑 생성
   */
  private async initializeCache(): Promise<void> {
    try {
      // 디렉토리 생성
      await fs.ensureDir(this.keywordImageDir);

      // 디렉토리 내 모든 이미지 파일 스캔
      const files = await fs.readdir(this.keywordImageDir);
      const imageFiles = files.filter((file) =>
        /\.(jpg|jpeg|png|webp)$/i.test(file),
      );

      // 파일명에서 키워드 추출 및 매핑
      for (const file of imageFiles) {
        // 파일명에서 확장자 제거
        const baseName = file.replace(/\.(jpg|jpeg|png|webp)$/i, '');

        // 키워드_숫자 형식인지 확인
        const match = baseName.match(/^(.+?)(?:_(\d+))?$/);
        if (match) {
          const keyword = match[1]; // 키워드 부분
          const fullPath = path.join(this.keywordImageDir, file);

          // 캐시에 추가
          if (!this.imageCache.has(keyword)) {
            this.imageCache.set(keyword, []);
          }
          this.imageCache.get(keyword)!.push(fullPath);
        }
      }

      // 각 키워드별 이미지 경로 정렬 (숫자 순서)
      for (const [keyword, paths] of this.imageCache.entries()) {
        paths.sort((a, b) => {
          const aNum = this.extractNumber(a);
          const bNum = this.extractNumber(b);
          return aNum - bNum;
        });
      }

      this.logger.log(
        `Initialized keyword-image cache: ${this.imageCache.size} keywords, ${imageFiles.length} images`,
      );

      // 캐시 내용 로그 (디버깅용)
      if (this.imageCache.size > 0) {
        this.logger.debug('Keyword-image mappings:');
        for (const [keyword, paths] of this.imageCache.entries()) {
          this.logger.debug(`  ${keyword}: ${paths.length} image(s)`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize image cache:', error.message);
    }
  }

  /**
   * 파일명에서 숫자 추출 (정렬용)
   * @param filepath - 파일 경로
   * @returns 파일명의 숫자 (없으면 0)
   */
  private extractNumber(filepath: string): number {
    const basename = path.basename(filepath, path.extname(filepath));
    const match = basename.match(/_(\d+)$/);
    return match ? parseInt(match[1], 10) : 0;
  }

  /**
   * 기사 내용에서 키워드를 추출하고 매칭되는 이미지 찾기
   *
   * @param content - 기사 본문
   * @param maxImages - 최대 반환 이미지 수 (기본: 3)
   * @returns 매칭된 이미지 경로 배열
   */
  async findImagesForContent(
    content: string,
    maxImages: number = 3,
  ): Promise<string[]> {
    try {
      // 1. 키워드 추출
      const keywords = KoreanTextAnalyzer.extractKeywords(content);

      if (keywords.length === 0) {
        this.logger.debug('No keywords extracted from content');
        return [];
      }

      this.logger.debug(`Extracted keywords: ${keywords.join(', ')}`);

      // 2. 키워드 우선순위별로 이미지 검색
      const foundImages: string[] = [];

      for (const keyword of keywords) {
        if (foundImages.length >= maxImages) break;

        const images = this.imageCache.get(keyword);
        if (images && images.length > 0) {
          // 키워드에 해당하는 이미지 모두 추가 (maxImages까지)
          for (const img of images) {
            if (foundImages.length >= maxImages) break;
            foundImages.push(img);
            this.logger.debug(`Matched keyword "${keyword}" → ${path.basename(img)}`);
          }
        }
      }

      if (foundImages.length === 0) {
        this.logger.debug('No matching images found for keywords');
      } else {
        this.logger.log(`Found ${foundImages.length} images for keywords`);
      }

      return foundImages;
    } catch (error) {
      this.logger.error('Failed to find images for content:', error.message);
      return [];
    }
  }

  /**
   * 특정 키워드에 해당하는 이미지 찾기
   *
   * @param keyword - 검색할 키워드
   * @returns 해당 키워드의 이미지 경로 배열
   */
  getImagesForKeyword(keyword: string): string[] {
    return this.imageCache.get(keyword) || [];
  }

  /**
   * 캐시 갱신 (새 이미지 추가 시 호출)
   */
  async refreshCache(): Promise<void> {
    this.imageCache.clear();
    await this.initializeCache();
  }

  /**
   * 사용 가능한 모든 키워드 조회
   */
  getAvailableKeywords(): string[] {
    return Array.from(this.imageCache.keys()).sort();
  }

  /**
   * 통계 정보 조회
   */
  getStats(): {
    totalKeywords: number;
    totalImages: number;
    keywords: Array<{ keyword: string; imageCount: number }>;
  } {
    const keywords = Array.from(this.imageCache.entries())
      .map(([keyword, images]) => ({
        keyword,
        imageCount: images.length,
      }))
      .sort((a, b) => b.imageCount - a.imageCount);

    const totalImages = keywords.reduce((sum, k) => sum + k.imageCount, 0);

    return {
      totalKeywords: this.imageCache.size,
      totalImages,
      keywords,
    };
  }
}
