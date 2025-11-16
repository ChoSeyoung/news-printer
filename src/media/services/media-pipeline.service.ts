import { Injectable, Logger } from '@nestjs/common';
import { TtsService } from './tts.service';
import { VideoService } from './video.service';
import { YoutubeService, YoutubeUploadResult } from './youtube.service';
import { SeoOptimizerService } from './seo-optimizer.service';
import { ThumbnailService } from './thumbnail.service';

export interface PublishNewsOptions {
  title: string;
  newsContent: string;
  anchorScript: string;
  reporterScript: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
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

    try {
      this.logger.log(`Starting media pipeline for: ${options.title}`);

      // Step 1: Generate TTS audio files
      this.logger.log('Step 1/5: Generating TTS audio');
      const { anchorPath, reporterPath } = await this.ttsService.generateNewsScripts(
        options.anchorScript,
        options.reporterScript,
      );
      anchorAudioPath = anchorPath;
      reporterAudioPath = reporterPath;

      // Step 2: Create video from audio
      this.logger.log('Step 2/5: Creating video');
      videoPath = await this.videoService.createVideo({
        audioFiles: [anchorPath, reporterPath],
      });

      // Step 3: Generate SEO-optimized metadata
      this.logger.log('Step 3/5: Generating SEO metadata');
      const seoMetadata = await this.seoOptimizerService.generateSeoMetadata({
        originalTitle: options.title,
        newsContent: options.newsContent,
        anchorScript: options.anchorScript,
        reporterScript: options.reporterScript,
      });

      this.logger.debug(`SEO optimized title: ${seoMetadata.optimizedTitle}`);
      this.logger.debug(`SEO tags count: ${seoMetadata.tags.length}`);
      this.logger.debug(`Category ID: ${seoMetadata.categoryId}`);

      // Step 4: Generate thumbnail
      this.logger.log('Step 4/5: Generating thumbnail');

      // SEO 메타데이터의 category 한글로 변환
      const categoryMap: Record<string, string> = {
        '25': '정치',
        '28': '과학기술',
        '24': '문화',
        '17': '스포츠',
      };
      const category = categoryMap[seoMetadata.categoryId] || '사회';

      thumbnailPath = await this.thumbnailService.generateThumbnail({
        title: options.title,
        category: category,
        date: new Date(),
      });

      this.logger.debug(`Thumbnail created: ${thumbnailPath}`);

      // Step 5: Upload to YouTube with SEO metadata and thumbnail
      this.logger.log('Step 5/5: Uploading to YouTube');
      const uploadResult: YoutubeUploadResult = await this.youtubeService.uploadVideo({
        videoPath,
        title: seoMetadata.optimizedTitle,
        description: seoMetadata.optimizedDescription,
        tags: seoMetadata.tags,
        categoryId: seoMetadata.categoryId,
        privacyStatus: options.privacyStatus || 'unlisted',
        thumbnailPath,
      });

      // Clean up temporary files
      await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath, thumbnailPath);

      if (uploadResult.success) {
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
      await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath, thumbnailPath);

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
            await this.thumbnailService.deleteThumbnail(filepath);
          }
        } catch (error) {
          this.logger.warn(`Cleanup error for ${filepath}:`, error.message);
        }
      }
    }
  }
}
