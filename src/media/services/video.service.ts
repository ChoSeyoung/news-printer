import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface VideoOptions {
  audioFiles: string[];
  outputPath?: string;
  width?: number;
  height?: number;
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly tempDir = './temp';

  constructor() {
    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Combine multiple audio files into one
   * @param audioFiles - Array of audio file paths
   * @returns Path to combined audio file
   */
  private async combineAudioFiles(audioFiles: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(
        this.tempDir,
        `combined_${Date.now()}.wav`,
      );

      this.logger.debug(`Combining ${audioFiles.length} audio files`);

      const command = ffmpeg();

      // Add all input files
      audioFiles.forEach((file) => {
        command.input(file);
      });

      // Concatenate audio files
      command
        .on('error', (err) => {
          this.logger.error('Error combining audio files:', err.message);
          reject(err);
        })
        .on('end', () => {
          this.logger.debug(`Audio files combined: ${outputPath}`);
          resolve(outputPath);
        })
        .mergeToFile(outputPath, this.tempDir);
    });
  }

  /**
   * Create video from audio files
   * @param options - Video generation options
   * @returns Path to generated video file
   */
  async createVideo(options: VideoOptions): Promise<string> {
    try {
      this.logger.log('Creating video from audio files');

      // Combine audio files first
      const combinedAudioPath = await this.combineAudioFiles(options.audioFiles);

      // Generate output path
      const outputPath =
        options.outputPath ||
        path.join(this.tempDir, `video_${Date.now()}.mp4`);

      await this.generateVideo(combinedAudioPath, outputPath, {
        width: options.width || 1920,
        height: options.height || 1080,
      });

      // Clean up combined audio file
      await fs.remove(combinedAudioPath);

      this.logger.log(`Video created successfully: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to create video:', error.message);
      throw error;
    }
  }

  /**
   * Generate video with static background and audio
   * @param audioPath - Path to audio file
   * @param outputPath - Path for output video
   * @param dimensions - Video dimensions
   */
  private async generateVideo(
    audioPath: string,
    outputPath: string,
    dimensions: { width: number; height: number },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.logger.debug('Generating video with FFmpeg');

      ffmpeg()
        // Create a black background using color filter
        .input(`color=c=black:s=${dimensions.width}x${dimensions.height}:d=1`)
        .inputFormat('lavfi')
        // Add audio file
        .input(audioPath)
        // Video codec
        .videoCodec('libx264')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-preset medium',
          '-crf 23',
        ])
        // Audio codec
        .audioCodec('aac')
        .audioBitrate('192k')
        // Match video duration to audio duration
        .outputOptions(['-shortest'])
        // Output file
        .output(outputPath)
        .on('start', (commandLine) => {
          this.logger.debug('FFmpeg command:', commandLine);
        })
        .on('progress', (progress) => {
          this.logger.debug(`Processing: ${progress.percent?.toFixed(2)}% done`);
        })
        .on('error', (err) => {
          this.logger.error('FFmpeg error:', err.message);
          reject(err);
        })
        .on('end', () => {
          this.logger.debug('FFmpeg processing finished');
          resolve();
        })
        .run();
    });
  }

  /**
   * Delete temporary video file
   * @param filepath - Path to file to delete
   */
  async deleteVideoFile(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted video file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete video file ${filepath}:`, error.message);
    }
  }
}
