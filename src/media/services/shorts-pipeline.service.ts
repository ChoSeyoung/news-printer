import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../news/services/gemini.service';
import { TtsService } from './tts.service';
import { ShortsVideoService } from './shorts-video.service';
import { YoutubeService } from './youtube.service';
import { SeoOptimizerService } from './seo-optimizer.service';
import { promises as fs } from 'fs';

/**
 * YouTube Shorts 제작 요청 옵션
 */
export interface CreateShortsOptions {
  /** 뉴스 제목 */
  title: string;

  /** 뉴스 본문 (60초 요약용) */
  newsContent: string;

  /** 뉴스 원문 URL */
  newsUrl?: string;

  /** 공개 설정 (기본: public) */
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

/**
 * Shorts 제작 결과
 */
export interface CreateShortsResult {
  /** 성공 여부 */
  success: boolean;

  /** YouTube Shorts URL */
  videoUrl?: string;

  /** 생성된 비디오 ID */
  videoId?: string;

  /** 에러 메시지 */
  error?: string;
}

/**
 * YouTube Shorts 자동 제작 파이프라인
 *
 * 전체 프로세스:
 * 1. Gemini AI로 60초 요약 스크립트 생성
 * 2. Google TTS로 음성 생성
 * 3. 세로 영상 렌더링 (9:16 비율, 1080x1920)
 * 4. SEO 최적화 (제목, 설명, 해시태그)
 * 5. YouTube Shorts 자동 업로드
 * 6. 임시 파일 정리
 *
 * Shorts 최적화 전략:
 * - 60초 이하 길이 (Shorts 규정 준수)
 * - 첫 3초 Hook으로 시청자 유지율 극대화
 * - 세로 화면 최적화 (모바일 중심)
 * - 자동 SEO 최적화로 검색 노출 증대
 */
@Injectable()
export class ShortsPipelineService {
  private readonly logger = new Logger(ShortsPipelineService.name);

  constructor(
    private readonly geminiService: GeminiService,
    private readonly ttsService: TtsService,
    private readonly shortsVideoService: ShortsVideoService,
    private readonly youtubeService: YoutubeService,
    private readonly seoOptimizerService: SeoOptimizerService,
  ) {}

  /**
   * YouTube Shorts 전체 제작 및 업로드
   *
   * @param options Shorts 제작 옵션
   * @returns Shorts 제작 결과
   */
  async createAndUploadShorts(
    options: CreateShortsOptions,
  ): Promise<CreateShortsResult> {
    const startTime = Date.now();
    let audioPath: string | undefined;
    let videoPath: string | undefined;

    try {
      this.logger.log(`Starting Shorts creation: ${options.title}`);

      // 1️⃣ Gemini AI로 60초 요약 스크립트 생성
      this.logger.log('Step 1: Generating 60-second Shorts script with Gemini');
      const shortsScript = await this.geminiService.generateShortsScript(
        options.newsContent,
      );

      if (!shortsScript) {
        throw new Error('Failed to generate Shorts script');
      }

      this.logger.debug(`Generated Shorts script: ${shortsScript}`);

      // 2️⃣ Google TTS로 음성 생성
      this.logger.log('Step 2: Generating TTS audio');
      audioPath = await this.ttsService.generateTTS(shortsScript, 'anchor');

      // 3️⃣ 세로 영상 렌더링 (9:16 비율)
      this.logger.log('Step 3: Rendering vertical video (9:16 aspect ratio)');

      // 기본 이미지 사용 (나중에 뉴스 관련 이미지로 대체 가능)
      const imagePath = await this.getDefaultShortsImage();

      videoPath = await this.shortsVideoService.createShortsVideo(
        audioPath,
        imagePath,
        options.title,
        shortsScript,
      );

      // 4️⃣ SEO 최적화 (제목, 설명, 해시태그)
      this.logger.log('Step 4: Optimizing SEO metadata');
      const seoMetadata = await this.seoOptimizerService.optimizeMetadata({
        title: options.title,
        description: shortsScript,
        keywords: this.extractKeywords(options.title, shortsScript),
      });

      // Shorts 전용 제목 추가 (#Shorts 해시태그)
      const shortsTitle = this.optimizeShortsTitle(seoMetadata.title);
      const shortsDescription = this.buildShortsDescription(
        shortsScript,
        seoMetadata.tags,
        options.newsUrl,
      );

      // 5️⃣ YouTube Shorts 업로드
      this.logger.log('Step 5: Uploading to YouTube Shorts');
      const uploadResult = await this.youtubeService.uploadVideo({
        title: shortsTitle,
        description: shortsDescription,
        videoPath: videoPath,
        privacyStatus: options.privacyStatus || 'public',
        tags: [...seoMetadata.tags, 'Shorts', '60초뉴스', '숏폼'],
        categoryId: '25', // News & Politics 카테고리
      });

      if (!uploadResult.success) {
        throw new Error(`YouTube upload failed: ${uploadResult.error}`);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `✅ Shorts creation completed in ${duration}s: ${uploadResult.videoUrl}`,
      );

      return {
        success: true,
        videoUrl: uploadResult.videoUrl,
        videoId: uploadResult.videoId,
      };
    } catch (error) {
      this.logger.error('❌ Shorts creation failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      // 6️⃣ 임시 파일 정리
      await this.cleanupTempFiles(audioPath, videoPath);
    }
  }

  /**
   * Shorts 전용 제목 최적화
   * #Shorts 해시태그 추가 및 길이 제한 (100자)
   */
  private optimizeShortsTitle(title: string): string {
    // #Shorts 해시태그가 없으면 추가
    let optimizedTitle = title.includes('#Shorts') ? title : `${title} #Shorts`;

    // YouTube 제목 길이 제한 (100자)
    if (optimizedTitle.length > 100) {
      optimizedTitle = optimizedTitle.substring(0, 97) + '...';
    }

    return optimizedTitle;
  }

  /**
   * Shorts 설명 구성
   * - 60초 요약 스크립트
   * - 해시태그
   * - 원문 링크
   */
  private buildShortsDescription(
    script: string,
    tags: string[],
    newsUrl?: string,
  ): string {
    const lines: string[] = [];

    // 스크립트
    lines.push(script);
    lines.push('');

    // 해시태그 (상위 10개)
    const hashtags = tags.slice(0, 10).map((tag) => `#${tag}`);
    lines.push(hashtags.join(' '));
    lines.push('');

    // 원문 링크
    if (newsUrl) {
      lines.push('📰 원문 보기:');
      lines.push(newsUrl);
    }

    return lines.join('\n');
  }

  /**
   * 제목과 스크립트에서 키워드 추출
   */
  private extractKeywords(title: string, script: string): string[] {
    const text = `${title} ${script}`;
    const words = text.split(/\s+/);

    // 3글자 이상 단어만 추출 (한글 기준)
    const keywords = words.filter((word) => word.length >= 3);

    // 중복 제거 및 상위 10개 반환
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * 기본 Shorts 배경 이미지 가져오기
   * TODO: 나중에 뉴스 관련 이미지로 대체
   */
  private async getDefaultShortsImage(): string {
    // 임시로 단색 이미지 생성 또는 기본 이미지 경로 반환
    // 실제 구현에서는 뉴스 관련 이미지를 동적으로 생성하거나
    // 이미지 검색 API를 통해 가져올 수 있음

    // 기본 이미지 경로 (프로젝트에 포함된 기본 이미지)
    const defaultImagePath = './assets/default-shorts-bg.jpg';

    try {
      await fs.access(defaultImagePath);
      return defaultImagePath;
    } catch {
      // 기본 이미지가 없으면 에러 발생
      throw new Error('Default Shorts background image not found');
    }
  }

  /**
   * 임시 파일 정리
   */
  private async cleanupTempFiles(
    audioPath?: string,
    videoPath?: string,
  ): Promise<void> {
    const filesToDelete = [audioPath, videoPath].filter(Boolean) as string[];

    for (const filePath of filesToDelete) {
      try {
        await fs.unlink(filePath);
        this.logger.debug(`Deleted temp file: ${filePath}`);
      } catch (error) {
        this.logger.warn(`Failed to delete temp file ${filePath}:`, error.message);
      }
    }
  }

  /**
   * 다중 Shorts 생성 (배치 처리)
   * @param options Shorts 생성 옵션 배열
   * @returns 생성 결과 배열
   */
  async createMultipleShorts(
    options: CreateShortsOptions[],
  ): Promise<CreateShortsResult[]> {
    this.logger.log(`Creating ${options.length} Shorts videos in batch`);
    const results: CreateShortsResult[] = [];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      this.logger.log(`Processing ${i + 1}/${options.length}: ${option.title}`);

      const result = await this.createAndUploadShorts(option);
      results.push(result);

      // API 할당량 보호를 위한 딜레이 (Shorts 업로드 후 5초 대기)
      if (i < options.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    this.logger.log(
      `Batch Shorts creation completed - Success: ${successCount}, Failed: ${failCount}`,
    );

    return results;
  }
}
