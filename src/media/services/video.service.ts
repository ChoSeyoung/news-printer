import { Injectable, Logger } from '@nestjs/common';
import ffmpeg from 'fluent-ffmpeg';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SubtitleTiming } from './tts.service';
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

const execAsync = promisify(exec);

/**
 * 영상 생성 옵션 인터페이스
 */
export interface VideoOptions {
  /** 음성 파일 경로 배열 (앵커 + 리포터 음성 파일) */
  audioFiles: string[];
  /** 출력 영상 파일 경로 (선택사항, 자동 생성됨) */
  outputPath?: string;
  /** 영상 가로 해상도 (기본값: 1920) */
  width?: number;
  /** 영상 세로 해상도 (기본값: 1080) */
  height?: number;
  /** 배경 이미지 파일 경로 배열 (선택사항) */
  backgroundImagePaths?: string[];
  /** 엔딩 화면 추가 여부 (롱폼 전용, 기본값: false) */
  addEndScreen?: boolean;
  /** 엔딩 화면 길이 (초, 기본값: 10) */
  endScreenDuration?: number;
  /** 뉴스 제목 (자막용, 선택사항) */
  title?: string;
  /** 뉴스 스크립트 (자막용, 선택사항) */
  script?: string;
  /** TTS 기반 자막 타이밍 정보 (선택사항) */
  subtitles?: SubtitleTiming[];
}

/**
 * 영상 생성 서비스
 *
 * FFmpeg를 사용하여 음성 파일과 배경 이미지로 뉴스 영상을 생성하는 서비스입니다.
 * 여러 개의 음성 파일을 병합하고, 배경 이미지를 슬라이드쇼 형태로 표시합니다.
 *
 * 주요 기능:
 * - 다중 음성 파일 병합
 * - 배경 이미지를 영상으로 변환 (슬라이드쇼 효과)
 * - 음성 길이에 맞춰 영상 자동 조정
 * - Full HD(1920x1080) 영상 생성
 * - MP4 형식 출력 (H.264 인코딩)
 *
 * @example
 * ```typescript
 * const videoPath = await videoService.createVideo({
 *   audioFiles: ['./temp/anchor.wav', './temp/reporter.wav'],
 *   backgroundImagePaths: ['./images/bg1.jpg', './images/bg2.jpg'],
 *   width: 1920,
 *   height: 1080
 * });
 * ```
 */
@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  /** 임시 파일 저장 디렉토리 */
  private readonly tempDir = './temp';

  /**
   * VideoService 생성자
   *
   * 임시 디렉토리를 생성합니다.
   */
  constructor() {
    // 임시 디렉토리 생성 (이미 존재하면 무시)
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * 음성 파일의 길이(초) 가져오기
   *
   * FFprobe를 사용하여 음성 파일의 정확한 재생 시간을 측정합니다.
   * 영상 길이를 음성에 맞추기 위해 사용됩니다.
   *
   * @param audioPath - 음성 파일 경로
   * @returns 음성 파일의 길이(초)
   * @throws {Error} FFprobe 실행 실패 시
   *
   * @private
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
   * 여러 음성 파일을 하나로 병합
   *
   * FFmpeg의 concat 기능을 사용하여 앵커와 리포터 음성을 순차적으로 이어붙입니다.
   * 병합된 파일은 임시 디렉토리에 저장되며, WAV 형식으로 출력됩니다.
   *
   * @param audioFiles - 병합할 음성 파일 경로 배열
   * @returns 병합된 음성 파일 경로
   * @throws {Error} FFmpeg 실행 실패 시
   *
   * @private
   *
   * @example
   * ```typescript
   * const combinedPath = await this.combineAudioFiles([
   *   './temp/anchor.wav',
   *   './temp/reporter.wav'
   * ]);
   * // 반환값: './temp/combined_1234567890.wav'
   * ```
   */
  private async combineAudioFiles(audioFiles: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(
        this.tempDir,
        `combined_${Date.now()}.wav`,
      );

      this.logger.debug(`Combining ${audioFiles.length} audio files`);

      const command = ffmpeg();

      // 모든 입력 파일 추가
      audioFiles.forEach((file) => {
        command.input(file);
      });

      // 음성 파일 병합 실행
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
   * 음성 파일로부터 영상 생성
   *
   * 주요 처리 단계:
   * 1. 여러 음성 파일을 하나로 병합
   * 2. 배경 이미지 또는 검정색 화면으로 영상 생성
   * 3. 음성과 영상을 결합하여 최종 MP4 파일 생성
   *
   * @param options - 영상 생성 옵션
   * @returns 생성된 영상 파일 경로
   * @throws {Error} 영상 생성 실패 시
   *
   * @example
   * ```typescript
   * const videoPath = await videoService.createVideo({
   *   audioFiles: ['./temp/anchor.wav', './temp/reporter.wav'],
   *   backgroundImagePaths: ['./images/bg1.jpg'],
   *   width: 1920,
   *   height: 1080
   * });
   * // 반환값: './temp/video_1234567890.mp4'
   * ```
   */
  async createVideo(options: VideoOptions): Promise<string> {
    try {
      this.logger.log('Creating video from audio files');

      // 1단계: 음성 파일 병합
      const combinedAudioPath = await this.combineAudioFiles(options.audioFiles);

      // 2단계: 출력 경로 생성
      const outputPath =
        options.outputPath ||
        path.join(this.tempDir, `video_${Date.now()}.mp4`);

      // 3단계: 영상 생성
      await this.generateVideo(combinedAudioPath, outputPath, {
        width: options.width || 1920,
        height: options.height || 1080,
        backgroundImagePaths: options.backgroundImagePaths,
        addEndScreen: options.addEndScreen || false,
        endScreenDuration: options.endScreenDuration || 10,
        title: options.title,
        script: options.script,
        subtitles: options.subtitles,
      });

      // 4단계: 병합된 음성 파일 삭제 (정리)
      await fs.remove(combinedAudioPath);

      this.logger.log(`Video created successfully: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to create video:', error.message);
      throw error;
    }
  }

  /**
   * 배경 이미지와 음성을 결합하여 영상 생성
   *
   * 배경 이미지가 제공된 경우:
   * - 각 이미지를 영상 세그먼트로 변환
   * - 음성 길이에 맞춰 각 이미지의 표시 시간 계산
   * - 모든 세그먼트를 순차적으로 이어붙임
   *
   * 배경 이미지가 없는 경우:
   * - 검정색 화면으로 영상 생성
   *
   * 최종적으로 생성된 영상에 음성을 결합하여 MP4 파일 생성
   *
   * @param audioPath - 음성 파일 경로
   * @param outputPath - 출력 영상 파일 경로
   * @param dimensions - 영상 해상도 및 배경 이미지 정보
   * @returns Promise<void>
   * @throws {Error} FFmpeg 실행 실패 시
   *
   * @private
   */
  private async generateVideo(
    audioPath: string,
    outputPath: string,
    dimensions: {
      width: number;
      height: number;
      backgroundImagePaths?: string[];
      addEndScreen?: boolean;
      endScreenDuration?: number;
      title?: string;
      script?: string;
      subtitles?: SubtitleTiming[];
    },
  ): Promise<void> {
    try {
      this.logger.debug('Generating video with FFmpeg');

      // 음성 길이 측정
      const audioDuration = await this.getAudioDuration(audioPath);

      // 엔딩 화면 추가 시 총 영상 길이 계산
      const endScreenDuration = dimensions.addEndScreen ? (dimensions.endScreenDuration || 10) : 0;
      const totalVideoDuration = audioDuration + endScreenDuration;

      if (dimensions.addEndScreen) {
        this.logger.debug(`Adding end screen: ${endScreenDuration} seconds (total duration: ${totalVideoDuration}s)`);
      }

      const tempVideoPath = path.join(this.tempDir, `temp_video_${Date.now()}.mp4`);

      // 유효한 배경 이미지 필터링
      const validImages = dimensions.backgroundImagePaths?.filter(
        async (imgPath) => await fs.pathExists(imgPath)
      ) || [];

      if (validImages.length > 0) {
        // 배경 이미지가 있는 경우: 슬라이드쇼 영상 생성
        this.logger.debug(`Creating video with ${validImages.length} background images`);

        const segmentPaths: string[] = [];

        // 엔딩 화면 추가 시: 본편 이미지와 엔딩 화면 이미지를 분리 처리
        if (dimensions.addEndScreen && endScreenDuration > 0) {
          // 본편: 음성 길이만큼 이미지 균등 분배
          const durationPerImage = audioDuration / validImages.length;
          this.logger.debug(`Main content - Duration per image: ${durationPerImage} seconds`);

          for (let i = 0; i < validImages.length; i++) {
            const segmentStartTime = i * durationPerImage;
            const segmentPath = await this.createImageSegment(
              validImages[i],
              durationPerImage,
              i,
              dimensions.width,
              dimensions.height,
              dimensions.title,
              dimensions.script,
              dimensions.subtitles,
              segmentStartTime,
            );
            segmentPaths.push(segmentPath);
          }

          // 엔딩 화면: 마지막 이미지를 엔딩 화면 길이만큼 표시
          const endScreenImagePath = validImages[validImages.length - 1];
          this.logger.debug(`Creating end screen segment: ${endScreenDuration} seconds`);
          const endScreenSegmentPath = await this.createImageSegment(
            endScreenImagePath,
            endScreenDuration,
            validImages.length, // 다음 인덱스
            dimensions.width,
            dimensions.height,
            dimensions.title,
            dimensions.script,
            undefined, // 엔딩 화면에는 자막 없음
            audioDuration, // 엔딩 화면 시작 시간
          );
          segmentPaths.push(endScreenSegmentPath);
        } else {
          // 엔딩 화면 없음: 기존 방식대로 전체 영상 길이에 맞춰 균등 분배
          const durationPerImage = audioDuration / validImages.length;
          this.logger.debug(`Duration per image: ${durationPerImage} seconds`);

          for (let i = 0; i < validImages.length; i++) {
            const segmentStartTime = i * durationPerImage;
            const segmentPath = await this.createImageSegment(
              validImages[i],
              durationPerImage,
              i,
              dimensions.width,
              dimensions.height,
              dimensions.title,
              dimensions.script,
              dimensions.subtitles,
              segmentStartTime,
            );
            segmentPaths.push(segmentPath);
          }
        }

        // 모든 세그먼트를 하나의 영상으로 병합
        await this.concatenateSegments(segmentPaths, tempVideoPath);

        // 세그먼트 파일 정리
        for (const segmentPath of segmentPaths) {
          await fs.remove(segmentPath).catch(() => {});
        }
      } else {
        // 배경 이미지가 없는 경우: 검정색 화면 생성
        const videoDuration = dimensions.addEndScreen ? totalVideoDuration : audioDuration;
        this.logger.debug(`Creating black video of ${videoDuration} seconds`);

        const createBlackCmd = `ffmpeg -f lavfi -i color=c=black:s=${dimensions.width}x${dimensions.height}:r=25 -t ${videoDuration} -pix_fmt yuv420p -y "${tempVideoPath}"`;
        this.logger.debug(`Creating black video: ${createBlackCmd}`);

        try {
          await execAsync(createBlackCmd);
          this.logger.debug('Black video created successfully');
        } catch (error) {
          this.logger.error('Failed to create black video:', error.message);
          throw error;
        }
      }

      // 영상과 음성을 결합하여 최종 MP4 파일 생성
      let combineCmd: string;

      if (dimensions.addEndScreen && endScreenDuration > 0) {
        // 엔딩 화면이 있는 경우: 음성에 무음 추가하여 영상 길이에 맞춤
        this.logger.debug(`Adding ${endScreenDuration}s silence to audio for end screen`);
        combineCmd = `ffmpeg -i "${tempVideoPath}" -i "${audioPath}" -filter_complex "[1:a]apad=whole_dur=${totalVideoDuration}[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -y "${outputPath}"`;
      } else {
        // 엔딩 화면이 없는 경우: 기존 방식 그대로
        combineCmd = `ffmpeg -i "${tempVideoPath}" -i "${audioPath}" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -y "${outputPath}"`;
      }

      this.logger.debug(`Combining video and audio: ${combineCmd}`);

      try {
        await execAsync(combineCmd);
        this.logger.debug('FFmpeg processing finished');
      } catch (error) {
        this.logger.error('FFmpeg error:', error.message);
        throw error;
      } finally {
        // 임시 영상 파일 정리
        await fs.remove(tempVideoPath).catch(() => {});
      }
    } catch (error) {
      this.logger.error('Failed to generate video:', error.message);
      throw error;
    }
  }

  /**
   * 단일 이미지를 영상 세그먼트로 변환
   *
   * 정지된 이미지를 지정된 시간만큼 표시하는 영상 클립을 생성합니다.
   * 이미지는 영상 해상도에 맞게 자동으로 크기 조정 및 크롭됩니다.
   *
   * FFmpeg 처리 과정:
   * 1. 이미지를 반복 재생 (loop)
   * 2. 지정된 해상도로 스케일링 (aspect ratio 유지하며 확대)
   * 3. 중앙 기준으로 크롭하여 정확한 크기 맞춤
   * 4. 25fps, YUV420p 포맷으로 MP4 생성
   *
   * @param imagePath - 배경 이미지 파일 경로
   * @param duration - 이미지 표시 시간(초)
   * @param index - 세그먼트 인덱스 (파일명 구분용)
   * @param width - 영상 가로 해상도
   * @param height - 영상 세로 해상도
   * @returns 생성된 세그먼트 영상 파일 경로
   * @throws {Error} FFmpeg 실행 실패 시
   *
   * @private
   */
  private async createImageSegment(
    imagePath: string,
    duration: number,
    index: number,
    width: number,
    height: number,
    title?: string,
    script?: string,
    subtitles?: SubtitleTiming[],
    segmentStartTime: number = 0,
  ): Promise<string> {
    const segmentPath = path.join(this.tempDir, `segment_${Date.now()}_${index}.mp4`);

    // 기본 비디오 필터 (이미지 스케일링 및 크롭)
    const videoFilters: string[] = [
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
    ];

    // 자막 추가 (SRT 파일 사용)
    let srtPath: string | null = null;
    if (subtitles && subtitles.length > 0 && title) {
      const segmentEndTime = segmentStartTime + duration;

      // 이 세그먼트에 속하는 자막만 필터링
      const segmentSubtitles = subtitles.filter(subtitle => {
        return subtitle.startTime < segmentEndTime && subtitle.endTime > segmentStartTime;
      });

      if (segmentSubtitles.length > 0) {
        // 세그먼트 시작 시간 기준으로 자막 타이밍 조정
        const adjustedSubtitles = segmentSubtitles.map(subtitle => ({
          text: subtitle.text,
          startTime: Math.max(0, subtitle.startTime - segmentStartTime),
          endTime: Math.min(duration, subtitle.endTime - segmentStartTime),
        }));

        // SRT 파일 생성
        srtPath = path.join(this.tempDir, `subtitle_${Date.now()}_${index}.srt`);
        await this.generateSrtFile(adjustedSubtitles, srtPath);

        // SRT 자막 필터 추가 (하단 배치, 작은 크기)
        videoFilters.push(
          `subtitles=${srtPath}:force_style='FontName=AppleSDGothicNeo,FontSize=12,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BackColour=&H80000000,BorderStyle=3,Outline=2,Shadow=0,Alignment=2,MarginV=30'`
        );
      }
    } else if (script) {
      // 자막 타이밍이 없으면 스크립트만 고정 표시
      const wrappedScript = this.wrapText(script, 45, 3);
      const escapedScript = this.escapeFFmpegText(wrappedScript);

      // 고정 높이 배경 박스 (3줄 기준: fontsize 36 + line_spacing 15 → 약 140px 높이)
      videoFilters.push(
        `drawbox=x=0:y=h-260:w=w:h=140:color=black@0.7:t=fill`,
        `drawtext=fontfile=/System/Library/Fonts/AppleSDGothicNeo.ttc:text='${escapedScript}':` +
        `fontcolor=white:fontsize=36:` +
        `x=if(lt(text_w\\,1640)\\,(w-text_w)/2\\,140):y=h-th-120:line_spacing=15`
      );
    }

    const videoFilterStr = videoFilters.join(',');
    const createSegmentCmd = `ffmpeg -framerate 25 -loop 1 -i "${imagePath}" -t ${duration} -vf "${videoFilterStr}" -pix_fmt yuv420p -y "${segmentPath}"`;
    this.logger.debug(`Creating segment ${index}: ${createSegmentCmd}`);

    try {
      await execAsync(createSegmentCmd);
      this.logger.debug(`Segment ${index} created successfully: ${segmentPath}`);

      // SRT 파일 정리
      if (srtPath) {
        await fs.remove(srtPath).catch(() => {});
      }

      return segmentPath;
    } catch (error) {
      this.logger.error(`Failed to create segment ${index}:`, error.message);

      // 에러 발생 시에도 SRT 파일 정리
      if (srtPath) {
        await fs.remove(srtPath).catch(() => {});
      }

      throw error;
    }
  }

  /**
   * 여러 영상 세그먼트를 하나의 영상으로 병합
   *
   * FFmpeg의 concat demuxer를 사용하여 여러 영상 클립을 순차적으로 이어붙입니다.
   * 파일 리스트를 텍스트 파일로 생성한 후, FFmpeg에 전달하여 병합합니다.
   *
   * 처리 과정:
   * 1. 세그먼트 파일 경로 리스트를 텍스트 파일로 생성
   * 2. FFmpeg concat demuxer로 모든 세그먼트 병합
   * 3. 임시 파일 리스트 삭제
   *
   * @param segmentPaths - 병합할 세그먼트 영상 경로 배열
   * @param outputPath - 병합된 출력 영상 경로
   * @returns Promise<void>
   * @throws {Error} FFmpeg 실행 실패 시
   *
   * @private
   */
  private async concatenateSegments(segmentPaths: string[], outputPath: string): Promise<void> {
    // FFmpeg concat을 위한 파일 리스트 생성
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
      // 파일 리스트 정리
      await fs.remove(fileListPath).catch(() => {});
    }
  }

  /**
   * 임시 영상 파일 삭제
   *
   * 생성된 영상 파일을 임시 디렉토리에서 삭제합니다.
   * YouTube 업로드 완료 후 불필요한 파일을 정리하는 데 사용됩니다.
   *
   * @param filepath - 삭제할 영상 파일 경로
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * await videoService.deleteVideoFile('./temp/video_1234567890.mp4');
   * ```
   */
  async deleteVideoFile(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted video file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete video file ${filepath}:`, error.message);
    }
  }

  /**
   * 텍스트를 지정된 너비에 맞게 줄바꿈
   * @param text 원본 텍스트
   * @param maxCharsPerLine 한 줄당 최대 문자 수
   * @param maxLines 최대 줄 수 (기본값: 무제한)
   * @returns 줄바꿈된 텍스트
   */
  private wrapText(text: string, maxCharsPerLine: number, maxLines?: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if (maxLines && lines.length >= maxLines) {
        break;
      }

      if (currentLine.length + word.length + 1 <= maxCharsPerLine) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          if (maxLines && lines.length >= maxLines) {
            currentLine = '';
            break;
          }
        }
        if (word.length > maxCharsPerLine) {
          let remaining = word;
          while (remaining.length > maxCharsPerLine) {
            if (maxLines && lines.length >= maxLines) break;
            lines.push(remaining.substring(0, maxCharsPerLine));
            remaining = remaining.substring(maxCharsPerLine);
          }
          currentLine = remaining;
        } else {
          currentLine = word;
        }
      }
    }

    if (currentLine && (!maxLines || lines.length < maxLines)) {
      lines.push(currentLine);
    }

    return lines.join('\\n');
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

      // 한자 변환 및 특수문자 제거
      let text = TextPreprocessor.preprocessForNews(subtitle.text);

      // 35글자 초과 문장 분리
      text = TextPreprocessor.splitLongSentences(text, 35);

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
      .replace(/\\/g, '\\\\\\\\\\\\\\\\')
      .replace(/'/g, '') // 작은따옴표는 제거 (FFmpeg enable 파라미터와 충돌 방지)
      .replace(/:/g, '\\\\:')
      .replace(/\[/g, '\\\\[')
      .replace(/\]/g, '\\\\]')
      .replace(/"/g, '\\\\"')
      .replace(/\\n/g, '\n'); // \n 문자열을 실제 줄바꿈으로 변환
  }
}
