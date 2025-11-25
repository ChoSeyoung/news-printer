import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../news/services/gemini.service';
import { TtsService, SubtitleTiming } from './tts.service';
import { ShortsVideoService } from './shorts-video.service';
import { YoutubeService } from './youtube.service';
import { SeoOptimizerService } from './seo-optimizer.service';
import { ImageSearchService } from './image-search.service';
import { FailedUploadStorageService } from './failed-upload-storage.service';
import { TelegramNotificationService } from './telegram-notification.service';
import { YoutubeBrowserUploadService } from './youtube-browser-upload.service';
import { PublishedNewsTrackingService } from './published-news-tracking.service';
import { YoutubeQuotaManagerService } from './youtube-quota-manager.service';
import { VideoDurationUtil } from '../../common/utils/video-duration.util';
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';
import { promises as fs } from 'fs';

/**
 * YouTube Shorts 제작 요청 옵션
 */
export interface CreateShortsOptions {
  /** 뉴스 제목 */
  title: string;

  /** Reporter 대본 (Shorts 스크립트로 재사용) */
  reporterScript: string;

  /** 뉴스 원문 URL */
  newsUrl?: string;

  /** 기사 이미지 URLs */
  imageUrls?: string[];

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
    private readonly imageSearchService: ImageSearchService,
    private readonly failedUploadStorageService: FailedUploadStorageService,
    private readonly telegramNotificationService: TelegramNotificationService,
    private readonly browserUploadService: YoutubeBrowserUploadService,
    private readonly publishedNewsTrackingService: PublishedNewsTrackingService,
    private readonly quotaManager: YoutubeQuotaManagerService,
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
    let downloadedImagePaths: string[] = [];

    try {
      this.logger.log(`Starting Shorts creation: ${options.title}`);

      // 1️⃣ Reporter 대본을 Shorts 스크립트로 재사용 (Gemini API 절약)
      this.logger.log('Step 1: Using reporter script as Shorts script (no API call needed)');
      const shortsScript = options.reporterScript;

      if (!shortsScript) {
        throw new Error('Failed to generate Shorts script');
      }

      this.logger.debug(`Generated Shorts script: ${shortsScript}`);

      // 2️⃣ Google TTS로 음성 생성 (타임포인트 포함)
      this.logger.log('Step 2: Generating TTS audio with timepoints');
      const ttsResult = await this.ttsService.generateSpeechWithTimings({
        text: shortsScript,
        voice: 'FEMALE',
        speakingRate: 1.0,
        enableTimepoints: true,
      });
      audioPath = ttsResult.audioPath;
      const subtitles = ttsResult.subtitles;

      // 3️⃣ 세로 영상 렌더링 (9:16 비율)
      this.logger.log('Step 3: Rendering vertical video (9:16 aspect ratio)');

      // 기사 이미지 사용, 없으면 기본 이미지
      let imagePath: string;
      this.logger.debug(`Image URLs received: ${JSON.stringify(options.imageUrls)}`);

      if (options.imageUrls && options.imageUrls.length > 0) {
        // 로고/플레이스홀더 이미지 필터링 (logo, bg_, icon 등 제외)
        const validImageUrls = options.imageUrls.filter(url => {
          const lowerUrl = url.toLowerCase();
          return !lowerUrl.includes('logo') &&
                 !lowerUrl.includes('bg_') &&
                 !lowerUrl.includes('icon') &&
                 !lowerUrl.includes('placeholder') &&
                 (lowerUrl.endsWith('.jpg') || lowerUrl.endsWith('.jpeg') || lowerUrl.endsWith('.png') || lowerUrl.endsWith('.webp'));
        });

        this.logger.debug(`Filtered image URLs: ${JSON.stringify(validImageUrls)}`);

        // 필터링된 이미지 중 첫 번째 시도, 없으면 원본 중 두 번째 시도
        let imageUrlToDownload: string | undefined;
        if (validImageUrls.length > 0) {
          imageUrlToDownload = validImageUrls[0];
        } else if (options.imageUrls.length > 1) {
          imageUrlToDownload = options.imageUrls[1]; // 첫 번째가 로고일 수 있으므로 두 번째 시도
        } else {
          imageUrlToDownload = options.imageUrls[0];
        }

        this.logger.log(`Downloading article image: ${imageUrlToDownload}`);
        downloadedImagePaths = await this.imageSearchService.downloadImagesFromUrls([imageUrlToDownload]);
        this.logger.debug(`Downloaded images: ${JSON.stringify(downloadedImagePaths)}`);

        if (downloadedImagePaths.length > 0) {
          imagePath = downloadedImagePaths[0];
          this.logger.log(`Using article image: ${imagePath}`);
        } else {
          this.logger.warn('Image download failed, using default image');
          imagePath = await this.getDefaultShortsImage();
        }
      } else {
        this.logger.warn('No article images available, using default image');
        imagePath = await this.getDefaultShortsImage();
      }

      videoPath = await this.shortsVideoService.createShortsVideo(
        audioPath,
        imagePath,
        options.title,
        shortsScript,
        subtitles,
      );

      // 3-1️⃣ 영상 길이 확인 (59초 이하만 Shorts로 업로드 가능)
      this.logger.log('Step 3-1: Checking video duration for Shorts compliance');
      const videoDuration = await VideoDurationUtil.getVideoDuration(videoPath);
      this.logger.log(`Video duration: ${videoDuration.toFixed(2)}s`);

      if (videoDuration > 59) {
        this.logger.error(`Video too long for Shorts: ${videoDuration.toFixed(2)}s (max: 59s)`);

        // 임시 파일 정리
        await this.cleanupTempFiles(audioPath, videoPath, ...downloadedImagePaths);

        return {
          success: false,
          error: `Video duration (${videoDuration.toFixed(2)}s) exceeds Shorts limit (59s). Please shorten the script.`,
        };
      }

      this.logger.log(`✅ Video duration is valid for Shorts: ${videoDuration.toFixed(2)}s`);

      // 4️⃣ Shorts 메타데이터 준비 (제목, 설명, 해시태그)
      this.logger.log('Step 4: Preparing Shorts metadata');

      // Shorts는 간단한 태그 사용 (SEO 최적화 생략)
      const basicTags = this.extractKeywords(options.title, shortsScript).slice(0, 5);

      // Shorts 전용 제목 추가 (#Shorts 해시태그)
      const shortsTitle = this.optimizeShortsTitle(options.title);
      const shortsDescription = this.buildShortsDescription(
        shortsScript,
        basicTags,
        options.newsUrl,
      );

      // 5️⃣ YouTube Shorts 업로드
      this.logger.log('Step 5: Uploading to YouTube Shorts');

      let uploadResult;

      // YouTube API 할당량 확인 - 초과된 경우 바로 브라우저 업로드로 전환
      if (this.quotaManager.isApiQuotaExceeded()) {
        this.logger.warn('YouTube API quota exceeded - skipping API upload, using browser upload directly');
        uploadResult = {
          success: false,
          error: 'YouTube API quota exceeded',
        };
      } else {
        // 할당량이 남아있으면 API 업로드 시도
        uploadResult = await this.youtubeService.uploadVideo({
          title: shortsTitle,
          description: shortsDescription,
          videoPath: videoPath,
          privacyStatus: options.privacyStatus || 'public',
          tags: basicTags,
          categoryId: '25', // News & Politics 카테고리
        });
      }

      // YouTube API 할당량 초과 또는 업로드 실패 시 브라우저 업로드 시도
      if (!uploadResult.success) {
        this.logger.error(`API upload failed: ${uploadResult.error}`);
        this.logger.log('Attempting browser upload as fallback...');

        try {
          // 브라우저 자동화로 업로드 시도
          const browserResult = await this.browserUploadService.uploadVideo({
            videoPath: videoPath,
            title: shortsTitle,
            description: shortsDescription,
            thumbnailPath: undefined, // Shorts는 썸네일 없음
            privacyStatus: options.privacyStatus || 'public',
          });

          if (browserResult.success) {
            this.logger.log('✅ Browser upload succeeded!');

            // Clean up temporary files
            await this.cleanupTempFiles(audioPath, videoPath, ...downloadedImagePaths);

            // Track published news
            if (options.newsUrl && browserResult.videoUrl) {
              await this.publishedNewsTrackingService.markAsPublished(
                options.newsUrl,
                options.title,
                browserResult.videoId,
                browserResult.videoUrl,
              );
            }

            // Send Telegram notification
            await this.telegramNotificationService.sendUploadSuccess({
              title: options.title,
              videoUrl: browserResult.videoUrl!,
              videoType: 'shortform',
              uploadMethod: 'Browser',
            });

            return {
              success: true,
              videoUrl: browserResult.videoUrl,
              videoId: browserResult.videoId,
            };
          }
        } catch (browserError) {
          this.logger.error(`Browser upload also failed: ${browserError.message}`);
        }

        // 두 방법 모두 실패 시 파일 저장
        this.logger.warn('Both API and browser upload failed, saving for later retry...');
        const saved = await this.failedUploadStorageService.saveFailedUpload(
          videoPath!,
          undefined, // Shorts는 썸네일 없음
          {
            title: shortsTitle,
            description: shortsDescription,
            tags: basicTags,
            categoryId: '25',
            privacyStatus: options.privacyStatus || 'public',
            videoType: 'shortform',
            failureReason: uploadResult.error || 'Unknown error',
            newsUrl: options.newsUrl,
          },
        );

        if (saved) {
          this.logger.log('Failed Shorts upload saved to pending-uploads/shortform/');
          // 원본 파일은 복사되었으므로 임시 파일만 정리
          await this.cleanupTempFiles(audioPath, undefined, ...downloadedImagePaths);
        } else {
          // 저장 실패 시에만 영상 파일 유지
          await this.cleanupTempFiles(audioPath, undefined, ...downloadedImagePaths);
        }

        return {
          success: false,
          error: `Both API and browser upload failed. Saved for retry: ${uploadResult.error}`,
        };
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `✅ Shorts creation completed in ${duration}s: ${uploadResult.videoUrl}`,
      );

      // Send Telegram notification
      await this.telegramNotificationService.sendUploadSuccess({
        title: options.title,
        videoUrl: uploadResult.videoUrl!,
        videoType: 'shortform',
        uploadMethod: 'API',
      });

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
      await this.cleanupTempFiles(audioPath, videoPath, ...downloadedImagePaths);
    }
  }

  /**
   * Shorts 전용 제목 최적화
   * 길이 제한 (100자)
   */
  private optimizeShortsTitle(title: string): string {
    // 한자 및 이니셜을 한글로 치환
    let optimizedTitle = TextPreprocessor.preprocessText(title);

    // #Shorts 해시태그 제거
    optimizedTitle = optimizedTitle.replace(/#Shorts/gi, '').trim();

    // YouTube 제목 길이 제한 (100자)
    if (optimizedTitle.length > 100) {
      optimizedTitle = optimizedTitle.substring(0, 97) + '...';
    }

    return optimizedTitle;
  }

  /**
   * Shorts 설명 구성
   * - 해시태그만 포함
   */
  private buildShortsDescription(
    script: string,
    tags: string[],
    newsUrl?: string,
  ): string {
    // 해시태그만 (상위 15개)
    const hashtags = tags.slice(0, 15).map((tag) => `#${tag}`);
    return hashtags.join(' ');
  }

  /**
   * 제목과 스크립트에서 키워드 추출
   */
  private extractKeywords(title: string, script: string): string[] {
    const text = `${title} ${script}`;
    const words = text.split(/\s+/);

    // 특수문자 제거 및 3글자 이상 단어만 추출
    const keywords = words
      .map(word => word.replace(/[^가-힣a-zA-Z0-9]/g, '')) // 특수문자 제거
      .filter(word => word.length >= 3); // 3글자 이상

    // 중복 제거 및 상위 10개 반환
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * 기본 Shorts 배경 이미지 가져오기
   * TODO: 나중에 뉴스 관련 이미지로 대체
   */
  private async getDefaultShortsImage(): Promise<string> {
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
    ...additionalFiles: string[]
  ): Promise<void> {
    const filesToDelete = [audioPath, videoPath, ...additionalFiles].filter(Boolean) as string[];

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
