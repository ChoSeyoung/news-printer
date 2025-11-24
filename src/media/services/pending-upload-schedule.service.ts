import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PendingUploadRetryService } from './pending-upload-retry.service';

/**
 * Pending 영상 업로드 스케줄 서비스
 *
 * 1시간마다 pending-uploads 디렉토리의 영상들을 브라우저 자동화로 업로드합니다.
 *
 * 주요 기능:
 * - 1시간 간격 자동 업로드 배치 처리
 * - Shorts와 Longform 영상 모두 처리
 * - 브라우저 자동화(Playwright)로 YouTube API 할당량 절약
 * - Telegram 알림 전송
 */
@Injectable()
export class PendingUploadScheduleService {
  private readonly logger = new Logger(PendingUploadScheduleService.name);
  private isProcessing = false;

  constructor(
    private readonly pendingUploadRetryService: PendingUploadRetryService,
  ) {}

  /**
   * 서비스 시작 시 로그 출력
   */
  onModuleInit() {
    this.logger.log('PendingUploadScheduleService initialized');
    this.logger.log('Schedule: Pending uploads retry every hour at :30');
  }

  /**
   * 1시간마다 실행되는 크론 작업
   * 매 시간 30분에 실행 (예: 1:30, 2:30, 3:30...)
   * (다음 뉴스 크롤링은 정각에 실행되므로 30분에 실행하여 겹치지 않도록 함)
   *
   * 모든 pending 영상을 처리하며, 이전 배치가 아직 실행 중이면 자동으로 스킵합니다.
   * 처리 시간이 1시간을 초과하더라도 안전하게 다음 스케줄은 대기합니다.
   */
  @Cron('30 * * * *') // 매 시간 30분
  async handlePendingUploadsCron() {
    // 이미 처리 중이면 스킵 (중복 실행 방지)
    if (this.isProcessing) {
      this.logger.warn('⏳ Previous pending upload batch is still processing, skipping this schedule...');
      return;
    }

    this.logger.log('=== Starting Pending Uploads Batch ===');
    this.isProcessing = true;

    try {
      // Shorts 전체 처리
      const result = await this.pendingUploadRetryService.retryByType('shorts');

      this.logger.log(
        `=== Pending Shorts Completed: ${result.successCount} success, ${result.failedCount} failed out of ${result.totalAttempted} ===`,
      );

      // Longform 전체 처리
      const longformResult = await this.pendingUploadRetryService.retryByType('longform');

      this.logger.log(
        `=== Pending Longform Completed: ${longformResult.successCount} success, ${longformResult.failedCount} failed out of ${longformResult.totalAttempted} ===`,
      );

    } catch (error) {
      this.logger.error('Pending uploads cron job failed:', error.message);
    } finally {
      this.isProcessing = false;
      this.logger.log('=== Pending Uploads Batch Finished ===');
    }
  }
}
