import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as ffmpeg from 'fluent-ffmpeg';

/**
 * YouTube Shorts 전용 비디오 렌더링 서비스
 *
 * 핵심 기능:
 * - 세로 영상 렌더링 (9:16 비율, 1080x1920)
 * - TTS 음성 + 배경 이미지 합성
 * - 모바일 최적화 (자막, 폰트 크기)
 * - FFmpeg 기반 고품질 인코딩
 *
 * Shorts 최적화 전략:
 * - 60초 이하 길이 제한
 * - 세로 화면 최적화 (모바일 중심)
 * - 첫 3초 시각적 Hook (썸네일 효과)
 * - 고대비 자막 (가독성 극대화)
 */
@Injectable()
export class ShortsVideoService {
  private readonly logger = new Logger(ShortsVideoService.name);
  private readonly outputDir: string;

  // Shorts 표준 해상도
  private readonly SHORTS_WIDTH = 1080;
  private readonly SHORTS_HEIGHT = 1920;
  private readonly SHORTS_ASPECT_RATIO = '9:16';

  // Shorts 길이 제한
  private readonly MAX_DURATION_SECONDS = 60;

  constructor(private readonly configService: ConfigService) {
    this.outputDir = path.join(process.cwd(), 'output', 'shorts');
    this.ensureOutputDirectory();
  }

  /**
   * 출력 디렉토리 생성
   */
  private async ensureOutputDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      this.logger.log(`Shorts output directory ensured: ${this.outputDir}`);
    } catch (error) {
      this.logger.error('Failed to create shorts output directory:', error.message);
    }
  }

  /**
   * Shorts 비디오 생성
   *
   * @param audioPath TTS 음성 파일 경로
   * @param imagePath 배경 이미지 경로
   * @param title 뉴스 제목 (자막용)
   * @param script Shorts 스크립트 (자막용)
   * @returns 생성된 비디오 파일 경로
   */
  async createShortsVideo(
    audioPath: string,
    imagePath: string,
    title: string,
    script: string,
  ): Promise<string> {
    const timestamp = Date.now();
    const outputPath = path.join(this.outputDir, `shorts_${timestamp}.mp4`);

    try {
      this.logger.log('Starting Shorts video creation');
      this.logger.debug(`Audio: ${audioPath}`);
      this.logger.debug(`Image: ${imagePath}`);
      this.logger.debug(`Output: ${outputPath}`);

      // 오디오 길이 확인 (60초 제한)
      const audioDuration = await this.getAudioDuration(audioPath);
      if (audioDuration > this.MAX_DURATION_SECONDS) {
        this.logger.warn(
          `Audio duration ${audioDuration}s exceeds Shorts limit ${this.MAX_DURATION_SECONDS}s`,
        );
      }

      // 세로 영상 생성 (9:16 비율)
      await this.renderVerticalVideo(
        audioPath,
        imagePath,
        title,
        script,
        outputPath,
        audioDuration,
      );

      this.logger.log(`Shorts video created successfully: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to create Shorts video:', error.message);
      throw error;
    }
  }

  /**
   * 오디오 파일 길이 가져오기
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          const duration = metadata.format.duration || 0;
          resolve(duration);
        }
      });
    });
  }

  /**
   * 세로 영상 렌더링 (9:16 비율)
   *
   * FFmpeg 필터 체인:
   * 1. 이미지 스케일 및 크롭 (1080x1920 세로 중심)
   * 2. 제목 자막 추가 (상단, 대형 폰트)
   * 3. 본문 스크립트 자막 추가 (하단, 고대비)
   * 4. 오디오 합성
   */
  private async renderVerticalVideo(
    audioPath: string,
    imagePath: string,
    title: string,
    script: string,
    outputPath: string,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // 자막 텍스트 준비 (특수문자 이스케이프)
      const escapedTitle = this.escapeFFmpegText(title);
      const escapedScript = this.escapeFFmpegText(script);

      // FFmpeg 필터 체인 구성
      const videoFilters = [
        // 이미지를 세로 화면에 맞게 스케일 및 크롭
        `scale=1080:1920:force_original_aspect_ratio=increase`,
        `crop=1080:1920`,

        // 제목 자막 (상단 중앙, 대형 폰트, 고대비)
        `drawtext=fontfile=/System/Library/Fonts/AppleSDGothicNeo.ttc:text='${escapedTitle}':` +
        `fontcolor=white:fontsize=64:box=1:boxcolor=black@0.7:boxborderw=10:` +
        `x=(w-text_w)/2:y=100`,

        // 본문 스크립트 자막 (하단, 중형 폰트, 여러 줄 지원)
        `drawtext=fontfile=/System/Library/Fonts/AppleSDGothicNeo.ttc:text='${escapedScript}':` +
        `fontcolor=white:fontsize=48:box=1:boxcolor=black@0.7:boxborderw=8:` +
        `x=(w-text_w)/2:y=h-th-150`,
      ];

      ffmpeg()
        .input(imagePath)
        .inputOptions([
          '-loop 1', // 이미지 루프
          '-t ' + duration, // 오디오 길이만큼
        ])
        .input(audioPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('128k')
        .outputOptions([
          '-vf', videoFilters.join(','),
          '-pix_fmt yuv420p', // 호환성 최대화
          '-preset fast', // 빠른 인코딩
          '-crf 23', // 고품질
          '-shortest', // 오디오 길이에 맞춤
        ])
        .output(outputPath)
        .on('start', (commandLine) => {
          this.logger.debug('FFmpeg command: ' + commandLine);
        })
        .on('progress', (progress) => {
          this.logger.debug(
            `Processing: ${progress.percent?.toFixed(2)}% done`,
          );
        })
        .on('end', () => {
          this.logger.log('Shorts video rendering completed');
          resolve();
        })
        .on('error', (err) => {
          this.logger.error('FFmpeg error:', err.message);
          reject(err);
        })
        .run();
    });
  }

  /**
   * FFmpeg 텍스트 이스케이프
   * 특수문자를 FFmpeg drawtext 필터에 맞게 변환
   */
  private escapeFFmpegText(text: string): string {
    return text
      .replace(/\\/g, '\\\\') // 백슬래시
      .replace(/'/g, "\\'") // 작은따옴표
      .replace(/:/g, '\\:') // 콜론
      .replace(/\n/g, ' ') // 줄바꿈 제거 (공백으로 대체)
      .replace(/\[/g, '\\[') // 대괄호
      .replace(/\]/g, '\\]');
  }

  /**
   * 생성된 Shorts 비디오 삭제
   */
  async deleteShortsVideo(videoPath: string): Promise<void> {
    try {
      await fs.unlink(videoPath);
      this.logger.log(`Deleted Shorts video: ${videoPath}`);
    } catch (error) {
      this.logger.error('Failed to delete Shorts video:', error.message);
    }
  }

  /**
   * Shorts 출력 디렉토리 정리 (오래된 파일 삭제)
   * @param daysOld 삭제할 파일의 최소 나이 (일 단위)
   */
  async cleanupOldShorts(daysOld: number = 7): Promise<void> {
    try {
      const files = await fs.readdir(this.outputDir);
      const now = Date.now();
      const maxAge = daysOld * 24 * 60 * 60 * 1000; // 밀리초 단위

      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(this.outputDir, file);
        const stats = await fs.stat(filePath);

        if (now - stats.mtimeMs > maxAge) {
          await fs.unlink(filePath);
          deletedCount++;
        }
      }

      this.logger.log(`Cleaned up ${deletedCount} old Shorts videos`);
    } catch (error) {
      this.logger.error('Failed to cleanup old Shorts:', error.message);
    }
  }
}
