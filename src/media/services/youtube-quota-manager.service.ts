import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * YouTube API 할당량 관리 서비스
 *
 * YouTube API 할당량 초과 시 플래그를 설정하여
 * 모든 업로드를 브라우저 자동화로 전환합니다.
 *
 * 주요 기능:
 * - API 할당량 초과 플래그 관리
 * - 매일 오후 5시 플래그 자동 초기화
 * - 플래그 상태 영구 저장 (서버 재시작 시에도 유지)
 */
@Injectable()
export class YoutubeQuotaManagerService {
  private readonly logger = new Logger(YoutubeQuotaManagerService.name);
  private readonly quotaFlagFile = './temp/youtube-quota-flag.json';

  /** YouTube API 할당량 초과 여부 */
  private isQuotaExceeded = false;

  constructor() {
    this.loadQuotaFlag();
  }

  /**
   * 서비스 초기화 시 로그 출력
   */
  onModuleInit() {
    this.logger.log('YoutubeQuotaManagerService initialized');
    this.logger.log(`Current quota status: ${this.isQuotaExceeded ? '❌ EXCEEDED (using browser upload)' : '✅ AVAILABLE (using API)'}`);
    this.logger.log('Quota reset schedule: Every day at 5:00 PM (17:00)');
  }

  /**
   * YouTube API 할당량 초과 여부 확인
   *
   * @returns true면 API 사용 불가 (브라우저 업로드 사용), false면 API 사용 가능
   */
  isApiQuotaExceeded(): boolean {
    return this.isQuotaExceeded;
  }

  /**
   * YouTube API 할당량 초과 플래그 설정
   *
   * API 호출 실패 시 호출하여 이후 모든 업로드를
   * 브라우저 자동화로 전환합니다.
   *
   * @param reason - 할당량 초과 원인 (선택)
   */
  setQuotaExceeded(reason?: string): void {
    if (!this.isQuotaExceeded) {
      this.isQuotaExceeded = true;
      this.saveQuotaFlag();
      this.logger.warn(`🚫 YouTube API quota EXCEEDED${reason ? `: ${reason}` : ''}`);
      this.logger.warn('All uploads will use browser automation until 5 PM reset');
    }
  }

  /**
   * YouTube API 할당량 플래그 초기화
   *
   * 매일 오후 5시에 자동으로 호출되거나 수동으로 호출됩니다.
   */
  resetQuotaFlag(): void {
    if (this.isQuotaExceeded) {
      this.isQuotaExceeded = false;
      this.saveQuotaFlag();
      this.logger.log('✅ YouTube API quota flag RESET - API uploads enabled');
    } else {
      this.logger.debug('Quota flag already reset, no action needed');
    }
  }

  /**
   * 매일 오후 5시(17:00)에 할당량 플래그 자동 초기화
   *
   * YouTube API 할당량은 태평양 표준시(PST) 기준 자정에 초기화되지만,
   * 한국 시간 기준으로 오후 5시경에 초기화됩니다.
   */
  @Cron('0 17 * * *', {
    name: 'youtube-quota-reset',
    timeZone: 'Asia/Seoul',
  })
  handleDailyQuotaReset() {
    this.logger.log('⏰ Daily YouTube API quota reset triggered (5 PM KST)');
    this.resetQuotaFlag();
  }

  /**
   * 현재 할당량 상태 정보 반환
   *
   * @returns 할당량 상태 정보
   */
  getQuotaStatus(): {
    isExceeded: boolean;
    status: string;
    uploadMethod: string;
    nextReset: string;
  } {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setHours(17, 0, 0, 0);

    // 현재 시간이 오후 5시 이후면 다음 날 5시로 설정
    if (now.getHours() >= 17) {
      nextReset.setDate(nextReset.getDate() + 1);
    }

    return {
      isExceeded: this.isQuotaExceeded,
      status: this.isQuotaExceeded ? 'EXCEEDED' : 'AVAILABLE',
      uploadMethod: this.isQuotaExceeded ? 'Browser Automation' : 'YouTube API',
      nextReset: nextReset.toLocaleString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    };
  }

  /**
   * 할당량 플래그를 파일에 저장
   *
   * 서버 재시작 시에도 플래그 상태가 유지되도록 합니다.
   */
  private saveQuotaFlag(): void {
    try {
      const data = {
        isQuotaExceeded: this.isQuotaExceeded,
        lastUpdated: new Date().toISOString(),
      };

      fs.ensureDirSync(path.dirname(this.quotaFlagFile));
      fs.writeFileSync(this.quotaFlagFile, JSON.stringify(data, null, 2), 'utf-8');
      this.logger.debug(`Quota flag saved: ${this.isQuotaExceeded}`);
    } catch (error) {
      this.logger.error(`Failed to save quota flag: ${error.message}`);
    }
  }

  /**
   * 할당량 플래그를 파일에서 로드
   *
   * 서버 시작 시 이전 상태를 복원합니다.
   */
  private loadQuotaFlag(): void {
    try {
      if (fs.existsSync(this.quotaFlagFile)) {
        const data = JSON.parse(fs.readFileSync(this.quotaFlagFile, 'utf-8'));
        this.isQuotaExceeded = data.isQuotaExceeded || false;
        this.logger.debug(`Quota flag loaded: ${this.isQuotaExceeded} (last updated: ${data.lastUpdated})`);
      } else {
        this.logger.debug('No quota flag file found, starting with quota available');
      }
    } catch (error) {
      this.logger.error(`Failed to load quota flag: ${error.message}`);
      this.isQuotaExceeded = false;
    }
  }

  /**
   * 수동으로 할당량 플래그 초기화 (테스트/관리 목적)
   */
  manualReset(): void {
    this.logger.log('🔧 Manual quota flag reset requested');
    this.resetQuotaFlag();
  }
}
