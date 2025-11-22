import { Injectable, Logger } from '@nestjs/common';
import { TtsService } from './tts.service';
import { VideoService } from './video.service';
import { YoutubeService, YoutubeUploadResult } from './youtube.service';
import { SeoOptimizerService } from './seo-optimizer.service';
import { ThumbnailService } from './thumbnail.service';
import { ImageSearchService } from './image-search.service';
import { PublishedNewsTrackingService } from './published-news-tracking.service';
import { GeminiService } from '../../news/services/gemini.service';

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
    private readonly geminiService: GeminiService,
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
          this.logger.warn(`Previous upload: ${existingRecord?.videoUrl || 'URL not available'}`);

          return {
            success: false,
            error: 'This news article has already been published',
            videoUrl: existingRecord?.videoUrl,
            videoId: existingRecord?.videoId,
          };
        }
      }

      // Step 1: Generate TTS audio files
      this.logger.log('Step 1/6: Generating TTS audio');
      const { anchorPath, reporterPath } = await this.ttsService.generateNewsScripts(
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

      // Gemini로 썸네일에 가장 적합한 이미지 선택
      let selectedImagePath: string | undefined;
      if (backgroundImagePaths.length > 0) {
        try {
          const selectedIndex = await this.geminiService.selectBestThumbnailImage(
            options.title,
            options.newsContent,
            backgroundImagePaths.length,
          );
          selectedImagePath = backgroundImagePaths[selectedIndex];
          this.logger.debug(`Gemini selected image ${selectedIndex} for thumbnail: ${selectedImagePath}`);
        } catch (error) {
          this.logger.warn('Failed to select image with Gemini, using first image:', error.message);
          selectedImagePath = backgroundImagePaths[0];
        }
      }

      thumbnailPath = await this.thumbnailService.generateThumbnail({
        title: options.title,
        category: category,
        date: new Date(),
        backgroundImagePath: selectedImagePath,
      });

      // Step 5: Create video from audio (롱폼 영상은 썸네일 사용, 쇼츠는 기존 이미지 사용)
      this.logger.log('Step 5/6: Creating video');

      // 롱폼 영상은 썸네일을 배경으로 사용
      const videoBackgroundImages = isLongForm
        ? (thumbnailPath ? [thumbnailPath] : undefined)
        : (backgroundImagePaths.length > 0 ? backgroundImagePaths : undefined);

      if (isLongForm && thumbnailPath) {
        this.logger.log('Using generated thumbnail as background for long-form video');
      }

      videoPath = await this.videoService.createVideo({
        audioFiles: [anchorPath, reporterPath],
        backgroundImagePaths: videoBackgroundImages,
        addEndScreen: isLongForm, // 롱폼 영상에만 엔딩 화면 추가
        endScreenDuration: 10, // 10초 엔딩 화면
      });

      this.logger.debug(`Thumbnail created: ${thumbnailPath}`);

      // Step 6: Upload to YouTube with SEO metadata and thumbnail
      this.logger.log('Step 6/6: Uploading to YouTube');
      const uploadResult: YoutubeUploadResult = await this.youtubeService.uploadVideo({
        videoPath,
        title: seoMetadata.optimizedTitle,
        description: seoMetadata.optimizedDescription,
        tags: seoMetadata.tags,
        categoryId: seoMetadata.categoryId,
        privacyStatus: options.privacyStatus || 'unlisted',
        thumbnailPath,
      });

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
        if (options.newsUrl) {
          await this.publishedNewsTrackingService.markAsPublished(
            options.newsUrl,
            options.title,
            uploadResult.videoId,
            uploadResult.videoUrl,
          );
        }

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
}
