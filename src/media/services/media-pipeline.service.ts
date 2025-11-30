import { Injectable, Logger } from '@nestjs/common';
import { TtsService, SubtitleTiming } from './tts.service';
import { VideoService } from './video.service';
import { YoutubeService, YoutubeUploadResult } from './youtube.service';
import { SeoOptimizerService } from './seo-optimizer.service';
import { ThumbnailService } from './thumbnail.service';
import { ImageSearchService } from './image-search.service';
import { PublishedNewsTrackingService } from './published-news-tracking.service';
import { FailedUploadStorageService } from './failed-upload-storage.service';
import { GeminiService } from '../../news/services/gemini.service';
import { TelegramNotificationService } from './telegram-notification.service';
import { YoutubeBrowserUploadService } from './youtube-browser-upload.service';
import { YoutubeQuotaManagerService } from './youtube-quota-manager.service';
import { KeywordAnalysisService } from '../../news/services/keyword-analysis.service';

export interface PublishNewsOptions {
  title: string;
  newsContent: string;
  anchorScript: string;
  reporterScript: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
  newsUrl?: string;
  imageUrls?: string[]; // RSS feed image URLs
}

export interface PublishNewsResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  videoPath?: string;
  error?: string;
}

export interface PreviewNewsOptions {
  title: string;
  newsContent: string;
  anchorScript: string;
  reporterScript: string;
}

export interface PreviewNewsResult {
  optimizedTitle: string;
  optimizedDescription: string;
  tags: string[];
  categoryId: string;
  categoryName: string;
  estimatedDurationSeconds: number;
}

@Injectable()
export class MediaPipelineService {
  private readonly logger = new Logger(MediaPipelineService.name);

  constructor(
    private readonly ttsService: TtsService,
    private readonly videoService: VideoService,
    private readonly youtubeService: YoutubeService,
    private readonly seoOptimizerService: SeoOptimizerService,
    private readonly thumbnailService: ThumbnailService,
    private readonly imageSearchService: ImageSearchService,
    private readonly publishedNewsTrackingService: PublishedNewsTrackingService,
    private readonly failedUploadStorageService: FailedUploadStorageService,
    private readonly geminiService: GeminiService,
    private readonly telegramNotificationService: TelegramNotificationService,
    private readonly browserUploadService: YoutubeBrowserUploadService,
    private readonly quotaManager: YoutubeQuotaManagerService,
    private readonly keywordAnalysisService: KeywordAnalysisService,
  ) {}

  /**
   * Process news item through complete pipeline:
   * 1. Generate TTS audio for anchor and reporter
   * 2. Create video from audio files
   * 3. Upload video to YouTube
   * 4. Clean up temporary files
   *
   * @param options - Publishing options
   * @returns Publishing result with video URL
   */
  async publishNews(options: PublishNewsOptions): Promise<PublishNewsResult> {
    let anchorAudioPath: string | null = null;
    let reporterAudioPath: string | null = null;
    let videoPath: string | null = null;
    let thumbnailPath: string | null = null;
    let backgroundImagePaths: string[] = [];

    try {
      this.logger.log(`Starting media pipeline for: ${options.title}`);

      // Step 0: Check if already published (duplicate prevention)
      if (options.newsUrl) {
        if (this.publishedNewsTrackingService.isAlreadyPublished(options.newsUrl)) {
          const existingRecord = this.publishedNewsTrackingService.getPublishedRecord(options.newsUrl);
          this.logger.warn(`News already published: ${options.title}`);

          // 롱폼 업로드 정보 표시
          if (existingRecord?.longform) {
            this.logger.warn(`Previous longform upload: ${existingRecord.longform.videoUrl}`);
          }
          if (existingRecord?.shortform) {
            this.logger.warn(`Previous shortform upload: ${existingRecord.shortform.videoUrl}`);
          }

          return {
            success: false,
            error: 'This news article has already been published',
            videoUrl: existingRecord?.longform?.videoUrl || existingRecord?.shortform?.videoUrl,
            videoId: existingRecord?.longform?.videoId || existingRecord?.shortform?.videoId,
          };
        }
      }

      // Step 1: Generate TTS audio files with subtitles
      this.logger.log('Step 1/6: Generating TTS audio with subtitles');
      const { anchorPath, reporterPath, anchorSubtitles, reporterSubtitles } =
        await this.ttsService.generateNewsScriptsWithSubtitles(
          options.anchorScript,
          options.reporterScript,
        );
      anchorAudioPath = anchorPath;
      reporterAudioPath = reporterPath;

      // Step 2: Download background images from RSS feed
      this.logger.log('Step 2/6: Downloading background images');
      try {
        // Download images from RSS feed if available
        if (options.imageUrls && options.imageUrls.length > 0) {
          this.logger.log(`Found ${options.imageUrls.length} images from RSS feed`);
          backgroundImagePaths = await this.imageSearchService.downloadImagesFromUrls(options.imageUrls);
          this.logger.log(`Downloaded ${backgroundImagePaths.length} images from RSS feed`);
        }

        this.logger.log(`Total ${backgroundImagePaths.length} background images ready`);
      } catch (error) {
        this.logger.warn('Failed to get background images, using default:', error.message);
        backgroundImagePaths = [];
      }

      // 롱폼 영상 여부 판단: 60초 이상이면 롱폼으로 간주
      // (쇼츠는 일반적으로 60초 미만)
      const totalCharacters = options.anchorScript.length + options.reporterScript.length;
      const estimatedDuration = Math.ceil(totalCharacters / 4); // 한국어 TTS: ~4자/초
      const isLongForm = estimatedDuration >= 60;

      if (isLongForm) {
        this.logger.log(`Long-form video detected (estimated ${estimatedDuration}s) - will use thumbnail as background`);
      }

      // Step 3: Generate SEO-optimized metadata (롱폼 영상은 썸네일을 먼저 생성하기 위해 순서 변경)
      this.logger.log('Step 3/6: Generating SEO metadata');
      const seoMetadata = await this.seoOptimizerService.generateSeoMetadata({
        originalTitle: options.title,
        newsContent: options.newsContent,
        anchorScript: options.anchorScript,
        reporterScript: options.reporterScript,
      });

      this.logger.debug(`SEO optimized title: ${seoMetadata.optimizedTitle}`);
      this.logger.debug(`SEO tags count: ${seoMetadata.tags.length}`);
      this.logger.debug(`Category ID: ${seoMetadata.categoryId}`);

      // Step 4: Generate thumbnail with AI-selected background image (비디오 생성 전에 썸네일 생성)
      this.logger.log('Step 4/6: Generating thumbnail');

      // SEO 메타데이터의 category 한글로 변환
      const categoryMap: Record<string, string> = {
        '25': '정치',
        '28': '과학기술',
        '24': '문화',
        '17': '스포츠',
      };
      const category = categoryMap[seoMetadata.categoryId] || '사회';

      // 썸네일 이미지 선택 (첫 번째 이미지 사용)
      let selectedImagePath: string | undefined;
      if (backgroundImagePaths.length > 0) {
        selectedImagePath = backgroundImagePaths[0];
        this.logger.debug(`Using first image for thumbnail: ${selectedImagePath}`);
      }

      thumbnailPath = await this.thumbnailService.generateThumbnail({
        title: options.title,
        category: category,
        date: new Date(),
        backgroundImagePath: selectedImagePath,
      });

      // Step 5: Create video from audio (롱폼 영상은 썸네일 사용, 쇼츠는 기존 이미지 사용)
      this.logger.log('Step 5/6: Creating video with subtitles');

      // 롱폼 영상은 썸네일을 배경으로 사용
      const videoBackgroundImages = isLongForm
        ? (thumbnailPath ? [thumbnailPath] : undefined)
        : (backgroundImagePaths.length > 0 ? backgroundImagePaths : undefined);

      if (isLongForm && thumbnailPath) {
        this.logger.log('Using generated thumbnail as background for long-form video');
      }

      // 앵커와 리포터 자막 병합
      const mergedSubtitles = await this.mergeSubtitles(
        anchorSubtitles,
        reporterSubtitles,
        anchorPath,
        reporterPath,
      );

      if (mergedSubtitles.length > 0) {
        this.logger.log(`Adding ${mergedSubtitles.length} subtitle segments to video`);
      }

      videoPath = await this.videoService.createVideo({
        audioFiles: [anchorPath, reporterPath],
        backgroundImagePaths: videoBackgroundImages,
        addEndScreen: isLongForm, // 롱폼 영상에만 엔딩 화면 추가
        endScreenDuration: 10, // 10초 엔딩 화면
        title: seoMetadata.optimizedTitle, // 한자 치환된 SEO 최적화 제목 사용
        subtitles: mergedSubtitles.length > 0 ? mergedSubtitles : undefined, // 자막 전달
      });

      this.logger.debug(`Thumbnail created: ${thumbnailPath}`);

      // Step 6: Upload to YouTube with SEO metadata and thumbnail
      this.logger.log('Step 6/6: Uploading to YouTube');

      let uploadResult: YoutubeUploadResult;

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
          videoPath,
          title: seoMetadata.optimizedTitle,
          description: seoMetadata.optimizedDescription,
          tags: seoMetadata.tags,
          categoryId: seoMetadata.categoryId,
          privacyStatus: options.privacyStatus || 'unlisted',
          thumbnailPath,
        });
      }

      // YouTube API 할당량 초과 또는 업로드 실패 시 브라우저 업로드 시도
      if (!uploadResult.success) {
        this.logger.error(`API upload failed: ${uploadResult.error}`);
        this.logger.log('Attempting browser upload as fallback...');

        try {
          // 브라우저 자동화로 업로드 시도
          const browserResult = await this.browserUploadService.uploadVideo({
            videoPath,
            title: seoMetadata.optimizedTitle,
            description: seoMetadata.optimizedDescription,
            thumbnailPath,
            privacyStatus: options.privacyStatus || 'unlisted',
          });

          if (browserResult.success) {
            this.logger.log('✅ Browser upload succeeded!');

            // Clean up temporary files
            await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath, thumbnailPath, ...backgroundImagePaths);

            // 롱폼 영상의 경우 엔딩 화면 설정 시도 (videoId가 있는 경우)
            if (isLongForm && browserResult.videoId) {
              this.logger.log(`Setting end screen for long-form video: ${browserResult.videoId}`);
              try {
                await this.youtubeService.setEndScreen(browserResult.videoId);
                this.logger.log('End screen set successfully');
              } catch (error) {
                this.logger.warn(`Failed to set end screen: ${error.message}`);
              }
            }

            // Track published news
            if (options.newsUrl && browserResult.videoUrl && browserResult.videoId) {
              await this.publishedNewsTrackingService.markAsPublished(
                options.newsUrl,
                options.title,
                'longform',
                browserResult.videoId,
                browserResult.videoUrl,
              );
            }

            // 키워드 분석 (브라우저 업로드 성공 시에만 실행)
            if (options.newsUrl && options.newsContent) {
              this.keywordAnalysisService
                .updateKeywordStats(options.newsUrl, options.newsContent)
                .catch((err) =>
                  this.logger.warn(`Keyword analysis failed for ${options.newsUrl}:`, err.message),
                );
            }

            // Send Telegram notification
            await this.telegramNotificationService.sendUploadSuccess({
              title: options.title,
              videoUrl: browserResult.videoUrl!,
              videoType: 'longform',
              uploadMethod: 'Browser',
            });

            return {
              success: true,
              videoId: browserResult.videoId,
              videoUrl: browserResult.videoUrl,
            };
          }
        } catch (browserError) {
          this.logger.error(`Browser upload also failed: ${browserError.message}`);
        }

        // 두 방법 모두 실패 시 파일 저장
        this.logger.warn('Both API and browser upload failed, saving for later retry...');
        const saved = await this.failedUploadStorageService.saveFailedUpload(
          videoPath,
          thumbnailPath || undefined,
          {
            title: seoMetadata.optimizedTitle,
            description: seoMetadata.optimizedDescription,
            tags: seoMetadata.tags,
            categoryId: seoMetadata.categoryId,
            privacyStatus: options.privacyStatus || 'unlisted',
            videoType: 'longform',
            failureReason: uploadResult.error || 'Unknown error',
            newsUrl: options.newsUrl,
          },
        );

        if (saved) {
          this.logger.log('Failed longform upload saved to pending-uploads/longform/');
          // 원본 파일은 복사되었으므로 임시 파일만 정리
          await this.cleanup(anchorAudioPath, reporterAudioPath, null, null, ...backgroundImagePaths);
        } else {
          // 저장 실패 시에만 영상 파일 유지
          await this.cleanup(anchorAudioPath, reporterAudioPath, null, thumbnailPath, ...backgroundImagePaths);
        }

        return {
          success: false,
          error: `Both API and browser upload failed. Saved for retry: ${uploadResult.error}`,
          videoPath: saved ? undefined : videoPath,
        };
      }

      // Clean up temporary files (including background images)
      await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath, thumbnailPath, ...backgroundImagePaths);

      if (uploadResult.success) {
        // 롱폼 영상의 경우 엔딩 화면 설정 시도
        if (isLongForm && uploadResult.videoId) {
          this.logger.log(`Setting end screen for long-form video: ${uploadResult.videoId}`);
          try {
            await this.youtubeService.setEndScreen(uploadResult.videoId, 10);
          } catch (error) {
            this.logger.warn(`Failed to set end screen (will be available for manual setup): ${error.message}`);
            // 엔딩 화면 설정 실패는 전체 업로드 실패로 처리하지 않음
          }
        }

        // Mark news as published to prevent duplicates
        if (options.newsUrl && uploadResult.videoId && uploadResult.videoUrl) {
          await this.publishedNewsTrackingService.markAsPublished(
            options.newsUrl,
            options.title,
            'longform',
            uploadResult.videoId,
            uploadResult.videoUrl,
          );
        }

        // 키워드 분석 (업로드 성공 시에만 실행)
        if (options.newsUrl && options.newsContent) {
          this.keywordAnalysisService
            .updateKeywordStats(options.newsUrl, options.newsContent)
            .catch((err) =>
              this.logger.warn(`Keyword analysis failed for ${options.newsUrl}:`, err.message),
            );
        }

        // Send Telegram notification
        await this.telegramNotificationService.sendUploadSuccess({
          title: options.title,
          videoUrl: uploadResult.videoUrl!,
          videoType: 'longform',
          uploadMethod: 'API',
        });

        this.logger.log(`Media pipeline completed successfully: ${uploadResult.videoUrl}`);
        return {
          success: true,
          videoId: uploadResult.videoId,
          videoUrl: uploadResult.videoUrl,
        };
      } else {
        this.logger.error(`Media pipeline failed: ${uploadResult.error}`);
        return {
          success: false,
          error: uploadResult.error,
          videoPath, // Keep video file for debugging
        };
      }
    } catch (error) {
      this.logger.error('Media pipeline error:', error.message);

      // Attempt cleanup on error
      await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath, thumbnailPath, ...backgroundImagePaths);

      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Preview news video metadata without creating actual files
   * Generates SEO metadata and estimates video duration
   *
   * @param options - Preview options
   * @returns Preview result with metadata and duration estimate
   */
  async previewNews(options: PreviewNewsOptions): Promise<PreviewNewsResult> {
    try {
      this.logger.log(`Generating preview for: ${options.title}`);

      // Generate SEO-optimized metadata
      const seoMetadata = await this.seoOptimizerService.generateSeoMetadata({
        originalTitle: options.title,
        newsContent: options.newsContent,
        anchorScript: options.anchorScript,
        reporterScript: options.reporterScript,
      });

      // Category mapping
      const categoryMap: Record<string, string> = {
        '25': '정치',
        '28': '과학기술',
        '24': '문화',
        '17': '스포츠',
      };
      const categoryName = categoryMap[seoMetadata.categoryId] || '사회';

      // Estimate duration based on text length
      // Average Korean TTS: ~4 characters per second
      const totalCharacters = options.anchorScript.length + options.reporterScript.length;
      const estimatedDurationSeconds = Math.ceil(totalCharacters / 4);

      return {
        optimizedTitle: seoMetadata.optimizedTitle,
        optimizedDescription: seoMetadata.optimizedDescription,
        tags: seoMetadata.tags,
        categoryId: seoMetadata.categoryId,
        categoryName,
        estimatedDurationSeconds,
      };
    } catch (error) {
      this.logger.error('Preview generation error:', error.message);
      throw error;
    }
  }

  /**
   * Build video description from news content
   * @param options - Publishing options
   * @returns Formatted description
   */
  private buildVideoDescription(options: PublishNewsOptions): string {
    return `${options.title}

앵커 대본:
${options.anchorScript}

리포터 대본:
${options.reporterScript}

---
자동 생성된 뉴스 영상입니다.`;
  }

  /**
   * Clean up temporary files
   * @param paths - File paths to delete
   */
  private async cleanup(...paths: (string | null)[]): Promise<void> {
    this.logger.debug('Cleaning up temporary files');

    for (const filepath of paths) {
      if (filepath) {
        try {
          if (filepath.endsWith('.wav') || filepath.endsWith('.mp3')) {
            await this.ttsService.deleteAudioFile(filepath);
          } else if (filepath.endsWith('.mp4')) {
            await this.videoService.deleteVideoFile(filepath);
          } else if (filepath.endsWith('.jpg') || filepath.endsWith('.png') || filepath.endsWith('.jpeg')) {
            // Check if it's a thumbnail or background image
            if (filepath.includes('thumbnail_') || filepath.includes('thumb_')) {
              await this.thumbnailService.deleteThumbnail(filepath);
            } else {
              await this.imageSearchService.deleteImageFile(filepath);
            }
          }
        } catch (error) {
          this.logger.warn(`Cleanup error for ${filepath}:`, error.message);
        }
      }
    }
  }

  /**
   * 앵커와 리포터 자막을 시간 순서대로 병합
   *
   * 리포터 자막의 시작 시간을 앵커 음성 길이만큼 조정하여 병합합니다.
   *
   * @param anchorSubtitles - 앵커 자막 타이밍 배열
   * @param reporterSubtitles - 리포터 자막 타이밍 배열
   * @param anchorAudioPath - 앵커 음성 파일 경로
   * @param reporterAudioPath - 리포터 음성 파일 경로
   * @returns 병합 및 정렬된 자막 타이밍 배열
   */
  private async mergeSubtitles(
    anchorSubtitles: SubtitleTiming[],
    reporterSubtitles: SubtitleTiming[],
    anchorAudioPath: string,
    reporterAudioPath: string,
  ): Promise<SubtitleTiming[]> {
    try {
      // 앵커 음성 길이 가져오기
      const anchorDuration = await this.getAudioDuration(anchorAudioPath);
      this.logger.debug(`Anchor audio duration: ${anchorDuration}s`);

      // 리포터 자막 시작 시간 조정 (앵커 음성 길이만큼 offset)
      const adjustedReporterSubtitles = reporterSubtitles.map(sub => ({
        text: sub.text,
        startTime: sub.startTime + anchorDuration,
        endTime: sub.endTime + anchorDuration,
      }));

      // 병합 및 시간 순서대로 정렬
      const mergedSubtitles = [...anchorSubtitles, ...adjustedReporterSubtitles].sort(
        (a, b) => a.startTime - b.startTime
      );

      this.logger.debug(`Merged ${mergedSubtitles.length} subtitles (${anchorSubtitles.length} anchor + ${reporterSubtitles.length} reporter)`);
      return mergedSubtitles;
    } catch (error) {
      this.logger.error('Failed to merge subtitles:', error.message);
      // 병합 실패 시 빈 배열 반환 (자막 없이 영상 생성)
      return [];
    }
  }

  /**
   * 음성 파일 길이 가져오기
   *
   * FFprobe를 사용하여 음성 파일의 길이를 초 단위로 반환합니다.
   *
   * @param audioPath - 음성 파일 경로
   * @returns 음성 길이 (초)
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffmpeg = require('fluent-ffmpeg');
      ffmpeg.ffprobe(audioPath, (err: any, metadata: any) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          resolve(duration);
        }
      });
    });
  }
}
