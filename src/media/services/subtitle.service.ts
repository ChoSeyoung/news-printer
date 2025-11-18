import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * SRT 자막 항목 인터페이스
 */
export interface SubtitleEntry {
  /** 자막 번호 (1부터 시작) */
  index: number;
  /** 시작 시간 (초) */
  startTime: number;
  /** 종료 시간 (초) */
  endTime: number;
  /** 자막 텍스트 */
  text: string;
}

/**
 * 자막 생성 옵션 인터페이스
 */
export interface SubtitleOptions {
  /** 앵커 스크립트 */
  anchorScript: string;
  /** 리포터 스크립트 */
  reporterScript: string;
  /** 앵커 오디오 길이 (초) */
  anchorDuration: number;
  /** 리포터 오디오 길이 (초) */
  reporterDuration: number;
  /** 출력 파일 경로 (선택사항, 자동 생성됨) */
  outputPath?: string;
}

/**
 * 자막 생성 및 관리 서비스
 *
 * TTS 음성과 동기화된 SRT 자막 파일을 생성하고 관리합니다.
 * 앵커와 리포터 스크립트를 문장 단위로 분할하여 타이밍을 계산하고,
 * FFmpeg 번인 자막 및 YouTube 자막 업로드를 위한 SRT 파일을 생성합니다.
 *
 * 주요 기능:
 * - 스크립트 → 문장 분할 → 타이밍 계산
 * - SRT 형식 자막 파일 생성
 * - FFmpeg drawtext 필터 지원
 * - YouTube Captions API 호환
 *
 * 타이밍 계산 방식:
 * - 각 스크립트(앵커, 리포터)의 총 길이와 오디오 길이 기반
 * - 문장별 글자 수 비율로 시간 배분
 * - 0.5초 간격으로 자막 전환
 *
 * SRT 형식:
 * ```
 * 1
 * 00:00:00,000 --> 00:00:03,500
 * 오늘의 핵심 뉴스는...
 *
 * 2
 * 00:00:03,500 --> 00:00:07,000
 * 자세한 내용 전해드리겠습니다.
 * ```
 *
 * @example
 * ```typescript
 * const srtPath = await subtitleService.generateSubtitle({
 *   anchorScript: '안녕하세요. 뉴스입니다.',
 *   reporterScript: '현장의 김철수 기자입니다.',
 *   anchorDuration: 5.0,
 *   reporterDuration: 3.5
 * });
 *
 * // FFmpeg 번인 자막
 * ffmpeg -i video.mp4 -vf "subtitles=subtitle.srt" output.mp4
 *
 * // YouTube 자막 업로드
 * youtube.captions.insert({ videoId, part: 'snippet', resource: { srtPath } });
 * ```
 */
@Injectable()
export class SubtitleService {
  private readonly logger = new Logger(SubtitleService.name);
  /** 임시 파일 저장 디렉토리 */
  private readonly tempDir = './temp';

  /**
   * SubtitleService 생성자
   *
   * 임시 디렉토리를 생성합니다.
   */
  constructor() {
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * 앵커 및 리포터 스크립트로부터 SRT 자막 파일 생성
   *
   * 처리 단계:
   * 1. 스크립트를 문장 단위로 분할
   * 2. 각 문장의 표시 시간 계산
   * 3. SRT 형식으로 변환
   * 4. 파일로 저장
   *
   * @param options - 자막 생성 옵션
   * @returns 생성된 SRT 파일 경로
   *
   * @example
   * ```typescript
   * const srtPath = await subtitleService.generateSubtitle({
   *   anchorScript: '안녕하세요. 뉴스입니다. 오늘의 핵심 뉴스는...',
   *   reporterScript: '현장의 김철수 기자입니다. 상세한 내용은...',
   *   anchorDuration: 8.5,
   *   reporterDuration: 6.2
   * });
   * // 반환: './temp/subtitle_1234567890.srt'
   * ```
   */
  async generateSubtitle(options: SubtitleOptions): Promise<string> {
    try {
      this.logger.log('Generating SRT subtitle file');

      // 1단계: 앵커 스크립트 문장 분할 및 타이밍 계산
      const anchorEntries = this.createSubtitleEntries(
        options.anchorScript,
        0, // 시작 시간 0초
        options.anchorDuration,
        1, // 인덱스 1부터 시작
      );

      // 2단계: 리포터 스크립트 문장 분할 및 타이밍 계산
      const reporterEntries = this.createSubtitleEntries(
        options.reporterScript,
        options.anchorDuration, // 앵커 종료 시점부터 시작
        options.reporterDuration,
        anchorEntries.length + 1, // 앵커 다음 인덱스
      );

      // 3단계: 자막 항목 병합
      const allEntries = [...anchorEntries, ...reporterEntries];

      // 4단계: SRT 형식으로 변환
      const srtContent = this.convertToSrtFormat(allEntries);

      // 5단계: 파일 저장
      const outputPath =
        options.outputPath ||
        path.join(this.tempDir, `subtitle_${Date.now()}.srt`);

      await fs.writeFile(outputPath, srtContent, 'utf-8');

      this.logger.log(`Subtitle file created: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to generate subtitle:', error.message);
      throw error;
    }
  }

  /**
   * 스크립트를 문장 단위로 분할하고 자막 항목 생성
   *
   * 처리 과정:
   * 1. 스크립트를 문장 단위로 분할 (마침표, 물음표, 느낌표 기준)
   * 2. 각 문장의 글자 수 계산
   * 3. 전체 오디오 길이에 맞춰 시간 배분
   * 4. 각 문장에 시작/종료 시간 할당
   *
   * 시간 배분 로직:
   * - 각 문장의 글자 수 비율로 오디오 길이 분배
   * - 최소 표시 시간: 1초
   * - 문장 간 간격: 0.1초
   *
   * @param script - 전체 스크립트 (앵커 또는 리포터)
   * @param startTime - 스크립트 시작 시간 (초)
   * @param duration - 스크립트 총 길이 (초)
   * @param startIndex - 시작 인덱스 (SRT 번호)
   * @returns 자막 항목 배열
   *
   * @private
   */
  private createSubtitleEntries(
    script: string,
    startTime: number,
    duration: number,
    startIndex: number,
  ): SubtitleEntry[] {
    // 빈 스크립트 처리
    if (!script || script.trim().length === 0) {
      return [];
    }

    // 문장 분할 (마침표, 물음표, 느낌표 기준)
    const sentences = script
      .split(/[.?!]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (sentences.length === 0) {
      return [];
    }

    // 전체 글자 수 계산
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);

    // 각 문장에 시간 배분
    const entries: SubtitleEntry[] = [];
    let currentTime = startTime;

    sentences.forEach((sentence, index) => {
      // 문장 글자 수 비율로 시간 계산
      const charRatio = sentence.length / totalChars;
      const sentenceDuration = Math.max(1.0, duration * charRatio); // 최소 1초

      // 자막 항목 생성
      entries.push({
        index: startIndex + index,
        startTime: currentTime,
        endTime: currentTime + sentenceDuration,
        text: sentence,
      });

      // 다음 문장 시작 시간 (0.1초 간격)
      currentTime += sentenceDuration + 0.1;
    });

    return entries;
  }

  /**
   * 자막 항목 배열을 SRT 형식으로 변환
   *
   * SRT 형식:
   * ```
   * 1
   * 00:00:00,000 --> 00:00:03,500
   * 자막 텍스트
   *
   * 2
   * 00:00:03,500 --> 00:00:07,000
   * 다음 자막 텍스트
   * ```
   *
   * @param entries - 자막 항목 배열
   * @returns SRT 형식 문자열
   *
   * @private
   */
  private convertToSrtFormat(entries: SubtitleEntry[]): string {
    return entries
      .map((entry) => {
        const startTimeStr = this.formatSrtTime(entry.startTime);
        const endTimeStr = this.formatSrtTime(entry.endTime);

        return `${entry.index}\n${startTimeStr} --> ${endTimeStr}\n${entry.text}\n`;
      })
      .join('\n');
  }

  /**
   * 초 단위 시간을 SRT 시간 형식으로 변환
   *
   * SRT 시간 형식: HH:MM:SS,mmm
   * - HH: 시간 (00-99)
   * - MM: 분 (00-59)
   * - SS: 초 (00-59)
   * - mmm: 밀리초 (000-999)
   *
   * @param seconds - 초 단위 시간
   * @returns SRT 형식 시간 문자열
   *
   * @private
   *
   * @example
   * ```typescript
   * formatSrtTime(0) → '00:00:00,000'
   * formatSrtTime(3.5) → '00:00:03,500'
   * formatSrtTime(65.250) → '00:01:05,250'
   * ```
   */
  private formatSrtTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const millis = Math.floor((seconds % 1) * 1000);

    // HH:MM:SS,mmm 형식으로 패딩
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
  }

  /**
   * SRT 파일 삭제
   *
   * 생성된 SRT 파일을 임시 디렉토리에서 삭제합니다.
   * YouTube 업로드 및 FFmpeg 처리 완료 후 정리에 사용됩니다.
   *
   * @param filepath - 삭제할 SRT 파일 경로
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * await subtitleService.deleteSubtitle('./temp/subtitle_1234567890.srt');
   * ```
   */
  async deleteSubtitle(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted subtitle file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete subtitle file ${filepath}:`, error.message);
    }
  }

  /**
   * SRT 파일을 VTT 형식으로 변환
   *
   * 일부 플랫폼에서 VTT 형식을 요구하는 경우 사용합니다.
   * (현재는 미사용이지만 확장성을 위해 제공)
   *
   * VTT 형식:
   * ```
   * WEBVTT
   *
   * 1
   * 00:00:00.000 --> 00:00:03.500
   * 자막 텍스트
   * ```
   *
   * @param srtPath - SRT 파일 경로
   * @returns VTT 파일 경로
   *
   * @example
   * ```typescript
   * const vttPath = await subtitleService.convertSrtToVtt('./temp/subtitle.srt');
   * // 반환: './temp/subtitle.vtt'
   * ```
   */
  async convertSrtToVtt(srtPath: string): Promise<string> {
    try {
      // SRT 파일 읽기
      const srtContent = await fs.readFile(srtPath, 'utf-8');

      // SRT → VTT 변환 (시간 구분자 ',' → '.')
      const vttContent = `WEBVTT\n\n${srtContent.replace(/,/g, '.')}`;

      // VTT 파일 저장
      const vttPath = srtPath.replace(/\.srt$/, '.vtt');
      await fs.writeFile(vttPath, vttContent, 'utf-8');

      this.logger.log(`Converted SRT to VTT: ${vttPath}`);
      return vttPath;
    } catch (error) {
      this.logger.error('Failed to convert SRT to VTT:', error.message);
      throw error;
    }
  }
}
