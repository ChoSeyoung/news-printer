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
    // Create black background image if it doesn't exist
    this.createBlackBackground();
  }

  /**
   * Create a 10-second black background video file
   * This template will be reused and trimmed to match audio duration
   */
  private async createBlackBackground(): Promise<void> {
    const blackVideoPath = path.join(this.tempDir, 'black_template.mp4');

    if (await fs.pathExists(blackVideoPath)) {
      return;
    }

    this.logger.debug('Creating black video template');

    // Create a 10-second black video using shell command
    // This avoids all the lavfi/fluent-ffmpeg issues
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process');
      const cmd = `ffmpeg -f lavfi -i color=c=black:s=1920x1080:r=25 -t 10 -pix_fmt yuv420p -y "${blackVideoPath}"`;

      exec(cmd, (error: any) => {
        if (error) {
          this.logger.warn('Could not create black video template, will use alternative method');
          resolve(); // Don't fail, just continue without template
        } else {
          this.logger.debug('Black video template created');
          resolve();
        }
      });
    });
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

      const blackVideoPath = path.join(this.tempDir, 'black_template.mp4');

      // Use the black video template and combine with audio
      // The -shortest option will trim the video to match audio duration
      ffmpeg()
        .input(blackVideoPath)
        .input(audioPath)
        .outputOptions([
          '-map 0:v', // video from black template
          '-map 1:a', // audio from audio file
          '-shortest', // trim to shortest input (audio)
        ])
        .videoCodec('libx264')
        .outputOptions([
          '-pix_fmt yuv420p',
          '-preset ultrafast',
          '-crf 23',
        ])
        .audioCodec('aac')
        .audioBitrate('192k')
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
