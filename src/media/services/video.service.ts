import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface VideoOptions {
  audioFiles: string[];
  outputPath?: string;
  width?: number;
  height?: number;
  backgroundImagePaths?: string[];
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
   * Get audio duration using ffprobe
   * @param audioPath - Path to audio file
   * @returns Duration in seconds
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          this.logger.error('Failed to get audio duration:', err.message);
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          this.logger.debug(`Audio duration: ${duration} seconds`);
          resolve(duration);
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
        backgroundImagePaths: options.backgroundImagePaths,
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
   * Generate video with background images and audio
   * @param audioPath - Path to audio file
   * @param outputPath - Path for output video
   * @param dimensions - Video dimensions and optional background images
   */
  private async generateVideo(
    audioPath: string,
    outputPath: string,
    dimensions: { width: number; height: number; backgroundImagePaths?: string[] },
  ): Promise<void> {
    try {
      this.logger.debug('Generating video with FFmpeg');

      // Get audio duration first
      const audioDuration = await this.getAudioDuration(audioPath);
      const tempVideoPath = path.join(this.tempDir, `temp_video_${Date.now()}.mp4`);

      // Check if we have valid background images
      const validImages = dimensions.backgroundImagePaths?.filter(
        async (imgPath) => await fs.pathExists(imgPath)
      ) || [];

      if (validImages.length > 0) {
        // Use multiple background images
        this.logger.debug(`Creating video with ${validImages.length} background images`);
        this.logger.debug(`Video duration: ${audioDuration} seconds`);

        // Calculate duration per image
        const durationPerImage = audioDuration / validImages.length;
        this.logger.debug(`Duration per image: ${durationPerImage} seconds`);

        // Create video segments for each image
        const segmentPaths: string[] = [];
        for (let i = 0; i < validImages.length; i++) {
          const segmentPath = await this.createImageSegment(
            validImages[i],
            durationPerImage,
            i,
            dimensions.width,
            dimensions.height,
          );
          segmentPaths.push(segmentPath);
        }

        // Concatenate all segments
        await this.concatenateSegments(segmentPaths, tempVideoPath);

        // Clean up segment files
        for (const segmentPath of segmentPaths) {
          await fs.remove(segmentPath).catch(() => {});
        }
      } else {
        // Fallback to black background
        this.logger.debug(`Creating black video of ${audioDuration} seconds`);

        const createBlackCmd = `ffmpeg -f lavfi -i color=c=black:s=${dimensions.width}x${dimensions.height}:r=25 -t ${audioDuration} -pix_fmt yuv420p -y "${tempVideoPath}"`;
        this.logger.debug(`Creating black video: ${createBlackCmd}`);

        try {
          await execAsync(createBlackCmd);
          this.logger.debug('Black video created successfully');
        } catch (error) {
          this.logger.error('Failed to create black video:', error.message);
          throw error;
        }
      }

      // Combine video with audio using raw FFmpeg command
      const combineCmd = `ffmpeg -i "${tempVideoPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -y "${outputPath}"`;
      this.logger.debug(`Combining video and audio: ${combineCmd}`);

      try {
        await execAsync(combineCmd);
        this.logger.debug('FFmpeg processing finished');
      } catch (error) {
        this.logger.error('FFmpeg error:', error.message);
        throw error;
      } finally {
        // Clean up temporary video
        await fs.remove(tempVideoPath).catch(() => {});
      }
    } catch (error) {
      this.logger.error('Failed to generate video:', error.message);
      throw error;
    }
  }

  /**
   * Create a video segment from a single background image
   * @param imagePath - Path to background image
   * @param duration - Duration of this segment in seconds
   * @param index - Index of this segment
   * @param width - Video width
   * @param height - Video height
   * @returns Path to segment video file
   */
  private async createImageSegment(
    imagePath: string,
    duration: number,
    index: number,
    width: number,
    height: number,
  ): Promise<string> {
    const segmentPath = path.join(this.tempDir, `segment_${Date.now()}_${index}.mp4`);

    const createSegmentCmd = `ffmpeg -loop 1 -i "${imagePath}" -t ${duration} -vf "scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}" -r 25 -pix_fmt yuv420p -y "${segmentPath}"`;
    this.logger.debug(`Creating segment ${index}: ${createSegmentCmd}`);

    try {
      await execAsync(createSegmentCmd);
      this.logger.debug(`Segment ${index} created successfully: ${segmentPath}`);
      return segmentPath;
    } catch (error) {
      this.logger.error(`Failed to create segment ${index}:`, error.message);
      throw error;
    }
  }

  /**
   * Concatenate multiple video segments into one
   * @param segmentPaths - Array of paths to segment videos
   * @param outputPath - Path for concatenated output
   */
  private async concatenateSegments(segmentPaths: string[], outputPath: string): Promise<void> {
    // Create a file list for FFmpeg concat
    const fileListPath = path.join(this.tempDir, `filelist_${Date.now()}.txt`);
    const fileListContent = segmentPaths.map(p => `file '${path.resolve(p)}'`).join('\n');

    await fs.writeFile(fileListPath, fileListContent);
    this.logger.debug(`Created file list: ${fileListPath}`);

    const concatCmd = `ffmpeg -f concat -safe 0 -i "${fileListPath}" -c copy -y "${outputPath}"`;
    this.logger.debug(`Concatenating segments: ${concatCmd}`);

    try {
      await execAsync(concatCmd);
      this.logger.debug('Segments concatenated successfully');
    } catch (error) {
      this.logger.error('Failed to concatenate segments:', error.message);
      throw error;
    } finally {
      // Clean up file list
      await fs.remove(fileListPath).catch(() => {});
    }
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
