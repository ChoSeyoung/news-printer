import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { SubtitleTiming } from './tts.service';
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

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
   * @param imagePaths 배경 이미지 경로 (단일 또는 여러 이미지)
   * @param title 뉴스 제목 (자막용)
   * @param script Shorts 스크립트 (자막용)
   * @param subtitles 자막 타이밍 정보 (옵션)
   * @returns 생성된 비디오 파일 경로
   */
  async createShortsVideo(
    audioPath: string,
    imagePaths: string | string[],
    title: string,
    script: string,
    subtitles?: SubtitleTiming[],
  ): Promise<string> {
    const timestamp = Date.now();
    const outputPath = path.join(this.outputDir, `shorts_${timestamp}.mp4`);

    try {
      // 이미지 경로 배열로 정규화
      const imagePathArray = Array.isArray(imagePaths) ? imagePaths : [imagePaths];

      this.logger.log('Starting Shorts video creation');
      this.logger.debug(`Audio: ${audioPath}`);
      this.logger.debug(`Images: ${JSON.stringify(imagePathArray)}`);
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
        imagePathArray,
        title,
        script,
        outputPath,
        audioDuration,
        subtitles,
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
   * 텍스트를 지정된 너비에 맞게 줄바꿈
   * @param text 원본 텍스트
   * @param maxCharsPerLine 한 줄당 최대 문자 수
   * @param maxLines 최대 줄 수 (기본값: 무제한)
   * @returns 줄바꿈된 텍스트
   */
  private wrapText(text: string, maxCharsPerLine: number, maxLines?: number): string {
    const lines: string[] = [];
    let currentLine = '';

    // 공백으로 단어 분리
    const words = text.split(' ');

    for (const word of words) {
      // 현재 줄에 단어를 추가할 수 있는지 확인
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      if (testLine.length <= maxCharsPerLine) {
        currentLine = testLine;
      } else {
        // 현재 줄을 저장하고 새 줄 시작
        if (currentLine) {
          lines.push(currentLine);
          currentLine = '';
        }

        // 단어가 maxCharsPerLine보다 길면 문자 단위로 분할
        if (word.length > maxCharsPerLine) {
          let remaining = word;
          while (remaining.length > 0) {
            const chunk = remaining.substring(0, maxCharsPerLine);
            lines.push(chunk);
            remaining = remaining.substring(maxCharsPerLine);
          }
        } else {
          currentLine = word;
        }
      }
    }

    // 마지막 줄 추가
    if (currentLine) {
      lines.push(currentLine);
    }

    // maxLines 제한이 있으면 해당 줄 수만 반환
    if (maxLines && lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n');
    }

    return lines.join('\n');
  }

  /**
   * 세로 영상 렌더링 (9:16 비율)
   *
   * FFmpeg 필터 체인:
   * 1. 이미지 스케일 및 크롭 (1080x1920 세로 중심)
   * 2. 자막 타이밍에 맞춰 이미지 전환 (여러 이미지 사용 시)
   * 3. 제목 자막 추가 (상단, 대형 폰트)
   * 4. 본문 스크립트 자막 추가 (하단, 시간 동기화)
   * 5. 오디오 합성
   */
  private async renderVerticalVideo(
    audioPath: string,
    imagePaths: string[],
    title: string,
    script: string,
    outputPath: string,
    duration: number,
    subtitles?: SubtitleTiming[],
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // 제목 텍스트 단일 줄로 제한 (FFmpeg 명령어 길이 문제 방지)
      // 영상 너비 1080px의 80% = 864px, fontsize=42, 한글 평균 너비 약 33px → 한 줄당 약 20자로 제한
      const MAX_TITLE_LENGTH = 20;
      const truncatedTitle = title.length > MAX_TITLE_LENGTH
        ? title.substring(0, MAX_TITLE_LENGTH) + '...'
        : title;
      const escapedTitle = this.escapeFFmpegText(truncatedTitle);

      // 하이라이트 바 높이 (단일 줄 고정)
      const highlightBarHeight = 120;

      // 이미지 개수와 자막 타이밍에 따른 이미지 전환 구간 계산
      let imageTimings: Array<{ imagePath: string; startTime: number; endTime: number }> = [];

      if (imagePaths.length > 1 && subtitles && subtitles.length > 0) {
        // 자막 타이밍에 맞춰 이미지 할당
        const imagesPerSubtitle = Math.ceil(imagePaths.length / subtitles.length);

        for (let i = 0; i < subtitles.length; i++) {
          const imageIndex = Math.min(Math.floor(i / imagesPerSubtitle), imagePaths.length - 1);
          imageTimings.push({
            imagePath: imagePaths[imageIndex],
            startTime: subtitles[i].startTime,
            endTime: subtitles[i].endTime,
          });
        }
      } else if (imagePaths.length > 1) {
        // 자막이 없으면 균등 분할
        const timePerImage = duration / imagePaths.length;
        for (let i = 0; i < imagePaths.length; i++) {
          imageTimings.push({
            imagePath: imagePaths[i],
            startTime: i * timePerImage,
            endTime: (i + 1) * timePerImage,
          });
        }
      } else {
        // 이미지가 하나면 전체 구간 사용
        imageTimings.push({
          imagePath: imagePaths[0],
          startTime: 0,
          endTime: duration,
        });
      }

      this.logger.debug(`Image transition timings: ${JSON.stringify(imageTimings.map(t => ({
        image: path.basename(t.imagePath),
        start: t.startTime.toFixed(2),
        end: t.endTime.toFixed(2)
      })))}`);

      // FFmpeg 필터 체인 구성
      const videoFilters = [
        // 이미지를 세로 화면에 맞게 스케일 (비율 유지, 검은 배경 패딩)
        `scale=1080:1920:force_original_aspect_ratio=decrease`,
        `pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black`,
      ];

      // 시간 동기화 자막 추가 (SRT 파일 사용)
      let srtPath: string | null = null;
      if (subtitles && subtitles.length > 0) {
        // SRT 파일 생성
        srtPath = path.join(this.outputDir, `subtitle_${Date.now()}.srt`);
        await this.generateSrtFile(subtitles, srtPath);

        // SRT 자막 필터 추가 (하단 배치)
        videoFilters.push(
          `subtitles=${srtPath}:force_style='FontName=AppleSDGothicNeo,FontSize=8,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BackColour=&H80000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=30'`
        );
      } else {
        // 자막 타이밍이 없으면 전체 스크립트를 고정 표시
        const wrappedScript = this.wrapText(script, 22);
        const escapedScript = this.escapeFFmpegText(wrappedScript);

        // 고정 높이 배경 박스 (fontsize 36 기준 약 140px 높이)
        videoFilters.push(
          `drawbox=x=0:y=h-640:w=w:h=140:color=black@0.7:t=fill`,
          `drawtext=fontfile=/System/Library/Fonts/AppleSDGothicNeo.ttc:text='${escapedScript}':` +
          `fontcolor=white:fontsize=36:` +
          `x=if(lt(text_w\\,920)\\,(w-text_w)/2\\,60):y=h-th-500:line_spacing=8`
        );
      }

      // FFmpeg 명령 구성
      const command = ffmpeg();

      // 여러 이미지 입력 처리
      if (imagePaths.length > 1 && subtitles && subtitles.length > 0) {
        // 복잡한 필터 그래프로 이미지 전환 구현
        const complexFilters: string[] = [];

        // 각 이미지를 입력으로 추가하고 스케일 처리
        const uniqueImages = [...new Set(imageTimings.map(t => t.imagePath))];
        uniqueImages.forEach((imgPath, idx) => {
          command.input(imgPath).inputOptions(['-loop', '1', '-t', duration.toString()]);
          complexFilters.push(
            `[${idx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black[img${idx}]`
          );
        });

        // 자막 구간별로 이미지 선택 및 블렌딩
        let previousOutput = 'img0';
        for (let i = 0; i < imageTimings.length - 1; i++) {
          const currentImageIndex = uniqueImages.indexOf(imageTimings[i].imagePath);
          const nextImageIndex = uniqueImages.indexOf(imageTimings[i + 1].imagePath);

          if (currentImageIndex !== nextImageIndex) {
            // 이미지가 바뀌는 구간에서 페이드 전환
            const fadeStart = imageTimings[i + 1].startTime;
            const fadeDuration = 0.5; // 0.5초 페이드

            complexFilters.push(
              `[${previousOutput}][img${nextImageIndex}]xfade=transition=fade:duration=${fadeDuration}:offset=${fadeStart}[v${i}]`
            );
            previousOutput = `v${i}`;
          }
        }

        // 최종 비디오 스트림에 자막 필터 적용
        const finalFilters = videoFilters.map(f =>
          f.replace('scale=1080:1920:force_original_aspect_ratio=decrease', '')
           .replace('pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black', '')
        ).filter(f => f.trim().length > 0);

        complexFilters.push(`[${previousOutput}]${finalFilters.join(',')}[outv]`);

        command
          .input(audioPath)
          .complexFilter(complexFilters, 'outv')
          .outputOptions([
            '-map', `${uniqueImages.length}:a`,
            '-vcodec', 'libx264',
            '-acodec', 'aac',
            '-b:a', '128k',
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-crf', '23',
            '-shortest',
          ])
          .output(outputPath);
      } else {
        // 단일 이미지 또는 자막 없는 경우 (기존 방식)
        command
          .input(imagePaths[0])
          .inputOptions(['-loop', '1', '-t', duration.toString()])
          .input(audioPath)
          .videoCodec('libx264')
          .audioCodec('aac')
          .audioBitrate('128k')
          .outputOptions([
            '-vf', videoFilters.join(','),
            '-pix_fmt', 'yuv420p',
            '-preset', 'fast',
            '-crf', '23',
            '-shortest',
          ])
          .output(outputPath);
      }

      command
        .on('start', (commandLine) => {
          this.logger.debug('FFmpeg command: ' + commandLine);
        })
        .on('progress', (progress) => {
          const percent = progress.percent ? progress.percent.toFixed(2) : '0.00';
          this.logger.debug(`Processing: ${percent}% done`);
        })
        .on('end', async () => {
          this.logger.log('Shorts video rendering completed');

          // SRT 파일 정리
          if (srtPath) {
            await fs.unlink(srtPath).catch(() => {});
          }

          resolve();
        })
        .on('error', async (err) => {
          this.logger.error('FFmpeg error:', err.message);

          // 에러 발생 시에도 SRT 파일 정리
          if (srtPath) {
            await fs.unlink(srtPath).catch(() => {});
          }

          reject(err);
        })
        .run();
    });
  }

  /**
   * SRT 자막 파일 생성
   * @param subtitles 자막 타이밍 정보 배열
   * @param outputPath 출력할 SRT 파일 경로
   */
  private async generateSrtFile(subtitles: SubtitleTiming[], outputPath: string): Promise<void> {
    const srtContent = subtitles.map((subtitle, index) => {
      // 시간을 SRT 형식으로 변환 (HH:MM:SS,mmm)
      const startTime = this.formatSrtTime(subtitle.startTime);
      const endTime = this.formatSrtTime(subtitle.endTime);

      // 한자를 한글로 치환한 텍스트
      const text = TextPreprocessor.preprocessText(subtitle.text);

      return `${index + 1}\n${startTime} --> ${endTime}\n${text}\n`;
    }).join('\n');

    await fs.writeFile(outputPath, srtContent, 'utf-8');
    this.logger.debug(`SRT file created: ${outputPath}`);
  }

  /**
   * 초 단위 시간을 SRT 시간 형식으로 변환
   * @param seconds 초 단위 시간
   * @returns HH:MM:SS,mmm 형식 문자열
   */
  private formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * FFmpeg 텍스트 이스케이프
   * 특수문자를 FFmpeg drawtext 필터에 맞게 변환
   */
  private escapeFFmpegText(text: string): string {
    // 먼저 한자를 한글로 치환
    const hanjaReplaced = TextPreprocessor.preprocessText(text);

    return hanjaReplaced
      .replace(/\\/g, '\\\\\\\\') // 백슬래시
      .replace(/'/g, "'\\''") // 작은따옴표 (shell escape)
      .replace(/:/g, '\\:') // 콜론
      .replace(/\[/g, '\\[') // 대괄호
      .replace(/\]/g, '\\]')
      .replace(/"/g, '\\"') // 큰따옴표
      .replace(/\n/g, '\\n'); // 줄바꿈을 FFmpeg 줄바꿈 문자로 변환
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
