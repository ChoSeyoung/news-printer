import { Injectable, Logger } from '@nestjs/common';
import { TtsService } from './tts.service';
import { VideoService } from './video.service';
import { YoutubeService, YoutubeUploadResult } from './youtube.service';

export interface PublishNewsOptions {
  title: string;
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

@Injectable()
export class MediaPipelineService {
  private readonly logger = new Logger(MediaPipelineService.name);

  constructor(
    private readonly ttsService: TtsService,
    private readonly videoService: VideoService,
    private readonly youtubeService: YoutubeService,
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

    try {
      this.logger.log(`Starting media pipeline for: ${options.title}`);

      // Step 1: Generate TTS audio files
      this.logger.log('Step 1/3: Generating TTS audio');
      const { anchorPath, reporterPath } = await this.ttsService.generateNewsScripts(
        options.anchorScript,
        options.reporterScript,
      );
      anchorAudioPath = anchorPath;
      reporterAudioPath = reporterPath;

      // Step 2: Create video from audio
      this.logger.log('Step 2/3: Creating video');
      videoPath = await this.videoService.createVideo({
        audioFiles: [anchorPath, reporterPath],
      });

      // Step 3: Upload to YouTube
      this.logger.log('Step 3/3: Uploading to YouTube');
      const uploadResult: YoutubeUploadResult = await this.youtubeService.uploadVideo({
        videoPath,
        title: options.title,
        description: this.buildVideoDescription(options),
        tags: ['news', 'automated', 'korean'],
        categoryId: '25', // News & Politics
        privacyStatus: options.privacyStatus || 'unlisted',
      });

      // Clean up temporary files
      await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath);

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
      await this.cleanup(anchorAudioPath, reporterAudioPath, videoPath);

      return {
        success: false,
        error: error.message,
      };
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
          }
        } catch (error) {
          this.logger.warn(`Cleanup error for ${filepath}:`, error.message);
        }
      }
    }
  }
}
