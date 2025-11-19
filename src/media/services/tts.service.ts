import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { google } from '@google-cloud/text-to-speech/build/protos/protos';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * TTS(Text-to-Speech) 옵션 인터페이스
 */
export interface TtsOptions {
  /** 음성으로 변환할 텍스트 */
  text: string;
  /** 음성 타입: 남성 또는 여성 (기본값: FEMALE) */
  voice?: 'MALE' | 'FEMALE';
  /** 말하기 속도 (1.0이 기본, 0.25~4.0 범위, 기본값: 1.15) */
  speakingRate?: number;
  /** 타임포인트 추출 여부 (기본값: false) */
  enableTimepoints?: boolean;
}

/**
 * 자막 타이밍 정보
 */
export interface SubtitleTiming {
  /** 자막 텍스트 */
  text: string;
  /** 시작 시간 (초) */
  startTime: number;
  /** 종료 시간 (초) */
  endTime: number;
}

/**
 * TTS 결과 (타임포인트 포함)
 */
export interface TtsResult {
  /** 생성된 오디오 파일 경로 */
  audioPath: string;
  /** 자막 타이밍 정보 배열 */
  subtitles?: SubtitleTiming[];
}

/**
 * TTS(Text-to-Speech) 서비스
 *
 * Google Cloud Text-to-Speech API를 사용하여 텍스트를 음성 파일로 변환하는 서비스입니다.
 * 한국어 음성 합성을 지원하며, 남성/여성 음성과 말하기 속도를 조절할 수 있습니다.
 *
 * 주요 기능:
 * - 텍스트를 고품질 한국어 음성(WAV 형식)으로 변환
 * - 앵커와 리포터 대본을 각각 다른 음색으로 생성
 * - 임시 파일 관리 및 정리
 *
 * @example
 * ```typescript
 * const audioPath = await ttsService.generateSpeech({
 *   text: '안녕하세요. 뉴스입니다.',
 *   voice: 'FEMALE',
 *   speakingRate: 1.15
 * });
 * ```
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  /** Google Cloud TTS 클라이언트 */
  private readonly client: TextToSpeechClient;
  /** 임시 파일 저장 디렉토리 */
  private readonly tempDir = './temp';

  /**
   * TtsService 생성자
   *
   * Google Cloud TTS 클라이언트를 초기화하고 임시 디렉토리를 생성합니다.
   *
   * @param configService - NestJS 환경 설정 서비스
   * @throws {Error} GOOGLE_APPLICATION_CREDENTIALS 환경 변수가 설정되지 않은 경우
   */
  constructor(private configService: ConfigService) {
    // Google Cloud 인증 정보 경로 가져오기
    const credentialsPath = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');

    if (!credentialsPath) {
      this.logger.error('GOOGLE_APPLICATION_CREDENTIALS is not configured');
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
    }

    // TTS 클라이언트 초기화
    this.client = new TextToSpeechClient({
      keyFilename: credentialsPath,
    });

    // 임시 디렉토리 생성 (이미 존재하면 무시)
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * 텍스트를 음성 파일로 변환
   *
   * Google Cloud TTS API를 사용하여 한국어 텍스트를 WAV 형식의 음성 파일로 생성합니다.
   * 생성된 파일은 임시 디렉토리에 저장되며, 고유한 파일명이 자동으로 할당됩니다.
   *
   * 음성 설정:
   * - 언어: 한국어 (ko-KR)
   * - 샘플레이트: 44,100 Hz (고품질)
   * - 오디오 포맷: LINEAR16 (WAV)
   * - 볼륨: 0 dB (기본값)
   *
   * @param options - TTS 옵션 (텍스트, 음성 타입, 말하기 속도)
   * @returns 생성된 음성 파일의 경로
   * @throws {Error} TTS API 호출 실패 또는 파일 저장 실패 시
   *
   * @example
   * ```typescript
   * const audioPath = await ttsService.generateSpeech({
   *   text: '오늘의 주요 뉴스를 전해드립니다.',
   *   voice: 'FEMALE',
   *   speakingRate: 1.15
   * });
   * // 반환값: './temp/tts_1234567890_abc123.wav'
   * ```
   */
  async generateSpeech(options: TtsOptions): Promise<string> {
    const result = await this.generateSpeechWithTimings(options);
    return result.audioPath;
  }

  /**
   * 텍스트를 음성 파일로 변환 (타임포인트 포함)
   *
   * Google Cloud TTS API를 사용하여 한국어 텍스트를 WAV 형식의 음성 파일로 생성합니다.
   * enableTimepoints가 true인 경우, 문장별 타이밍 정보도 함께 반환합니다.
   *
   * @param options - TTS 옵션 (텍스트, 음성 타입, 말하기 속도, 타임포인트 활성화)
   * @returns 생성된 음성 파일 경로와 자막 타이밍 정보
   */
  async generateSpeechWithTimings(options: TtsOptions): Promise<TtsResult> {
    try {
      this.logger.debug(`Generating speech for text: ${options.text.substring(0, 50)}...`);

      // 문장 단위로 분할
      const sentences = this.splitIntoSentences(options.text);

      // Google Cloud TTS API 요청 구성
      const request: google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
        input: { text: options.text },
        voice: {
          languageCode: 'ko-KR',
          // 남성: ko-KR-Chirp3-HD-Alnilam, 여성: ko-KR-Chirp3-HD-Aoede
          name: options.voice === 'MALE' ? 'ko-KR-Chirp3-HD-Alnilam' : 'ko-KR-Chirp3-HD-Aoede',
        },
        audioConfig: {
          audioEncoding: 'LINEAR16', // WAV 형식
          sampleRateHertz: 44100, // 고품질 샘플레이트
          speakingRate: options.speakingRate || 1.15, // 약간 빠른 속도 (자연스러움)
          volumeGainDb: 0.0, // 볼륨 조절 (dB)
        },
      };

      // TTS API 호출
      const [response] = await this.client.synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new Error('No audio content received from TTS service');
      }

      // 고유한 파일명 생성 (타임스탬프 + 랜덤 문자열)
      const filename = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.wav`;
      const filepath = path.join(this.tempDir, filename);

      // 음성 데이터를 파일로 저장
      await fs.writeFile(filepath, response.audioContent, 'binary');

      this.logger.debug(`Speech generated successfully: ${filepath}`);

      // 자막 타이밍 계산 (문장 기반 추정)
      let subtitles: SubtitleTiming[] | undefined;
      if (options.enableTimepoints && sentences.length > 0) {
        subtitles = await this.estimateSubtitleTimings(
          sentences,
          filepath,
          options.speakingRate || 1.15
        );
      }

      return {
        audioPath: filepath,
        subtitles,
      };
    } catch (error) {
      this.logger.error('Failed to generate speech:', error.message);
      throw error;
    }
  }

  /**
   * 텍스트를 문장 단위로 분할
   */
  private splitIntoSentences(text: string): string[] {
    // 한국어 문장 구분 (마침표, 물음표, 느낌표 기준)
    const sentences = text
      .split(/(?<=[.!?。])\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    return sentences;
  }

  /**
   * 문장별 자막 타이밍 추정
   *
   * 각 문장의 글자 수를 기반으로 시간을 추정합니다.
   * 한국어 평균 발화 속도: 약 4-5음절/초
   */
  private async estimateSubtitleTimings(
    sentences: string[],
    audioPath: string,
    speakingRate: number
  ): Promise<SubtitleTiming[]> {
    // 오디오 길이 가져오기
    const totalDuration = await this.getAudioDuration(audioPath);

    // 전체 글자 수 계산
    const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);

    // 초당 글자 수 (발화 속도에 따라 조정)
    const charsPerSecond = (totalChars / totalDuration);

    const subtitles: SubtitleTiming[] = [];
    let currentTime = 0;

    for (const sentence of sentences) {
      const duration = sentence.length / charsPerSecond;

      subtitles.push({
        text: sentence,
        startTime: currentTime,
        endTime: currentTime + duration,
      });

      currentTime += duration;
    }

    return subtitles;
  }

  /**
   * 오디오 파일 길이 가져오기 (초 단위)
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = require('fluent-ffmpeg').ffprobe;
      ffprobe(audioPath, (err: any, metadata: any) => {
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
   * 뉴스 대본(앵커 + 리포터)을 음성 파일로 변환
   *
   * 앵커와 리포터 대본을 각각 다른 음색(여성/남성)으로 생성합니다.
   * 뉴스 영상 제작 시 사용되며, 두 음성 파일을 순차적으로 생성합니다.
   *
   * 음성 설정:
   * - 앵커: 여성 음성 (FEMALE), 말하기 속도 1.15
   * - 리포터: 남성 음성 (MALE), 말하기 속도 1.15
   *
   * @param anchorText - 앵커 대본 텍스트
   * @param reporterText - 리포터 대본 텍스트
   * @returns 앵커와 리포터 음성 파일 경로 객체
   * @throws {Error} 음성 생성 실패 시
   *
   * @example
   * ```typescript
   * const { anchorPath, reporterPath } = await ttsService.generateNewsScripts(
   *   '안녕하세요. 9시 뉴스입니다.',
   *   '김철수 기자가 현장에서 전합니다.'
   * );
   * // 반환값:
   * // {
   * //   anchorPath: './temp/tts_1234567890_abc123.wav',
   * //   reporterPath: './temp/tts_1234567891_def456.wav'
   * // }
   * ```
   */
  async generateNewsScripts(
    anchorText: string,
    reporterText: string,
  ): Promise<{ anchorPath: string; reporterPath: string }> {
    try {
      this.logger.log('Generating news scripts audio files');

      // 앵커 음성 생성 (여성 음성)
      const anchorPath = await this.generateSpeech({
        text: anchorText,
        voice: 'FEMALE',
        speakingRate: 1.15,
      });

      // 리포터 음성 생성 (남성 음성)
      const reporterPath = await this.generateSpeech({
        text: reporterText,
        voice: 'MALE',
        speakingRate: 1.15,
      });

      this.logger.log('News scripts audio files generated successfully');
      return { anchorPath, reporterPath };
    } catch (error) {
      this.logger.error('Failed to generate news scripts:', error.message);
      throw error;
    }
  }

  /**
   * 임시 음성 파일 삭제
   *
   * 생성된 음성 파일을 임시 디렉토리에서 삭제합니다.
   * 영상 생성 완료 후 불필요한 파일을 정리하는 데 사용됩니다.
   *
   * @param filepath - 삭제할 음성 파일 경로
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * await ttsService.deleteAudioFile('./temp/tts_1234567890_abc123.wav');
   * ```
   */
  async deleteAudioFile(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted audio file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete audio file ${filepath}:`, error.message);
    }
  }
}
