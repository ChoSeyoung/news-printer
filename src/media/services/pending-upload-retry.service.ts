import { Injectable, Logger } from '@nestjs/common';
import {
  FailedUploadStorageService,
  FailedUploadMetadata,
} from './failed-upload-storage.service';
import {
  YoutubeBrowserUploadService,
  BrowserUploadResult,
} from './youtube-browser-upload.service';
import { TelegramNotificationService } from './telegram-notification.service';

/**
 * pending-uploads 디렉토리 재업로드 서비스
 *
 * YouTube API 할당량 초과로 실패한 업로드들을
 * 브라우저 자동화(Playwright)로 재시도하는 서비스
 *
 * 주요 기능:
 * - pending-uploads 디렉토리의 모든 대기 중인 업로드 조회
 * - 브라우저 자동화로 YouTube 업로드 재시도
 * - 업로드 성공 시 파일 자동 삭제
 * - Telegram 알림 전송
 */
@Injectable()
export class PendingUploadRetryService {
  private readonly logger = new Logger(PendingUploadRetryService.name);

  constructor(
    private readonly failedUploadStorageService: FailedUploadStorageService,
    private readonly browserUploadService: YoutubeBrowserUploadService,
    private readonly telegramNotificationService: TelegramNotificationService,
  ) {}

  /**
   * 모든 대기 중인 업로드를 브라우저 자동화로 재시도
   *
   * @returns 성공/실패 통계
   */
  async retryAllPendingUploads(): Promise<{
    totalAttempted: number;
    successCount: number;
    failedCount: number;
    results: Array<{
      title: string;
      videoType: 'longform' | 'shorts';
      success: boolean;
      videoUrl?: string;
      error?: string;
    }>;
  }> {
    this.logger.log('Starting pending uploads retry process...');

    // 대기 중인 모든 업로드 조회
    const pendingUploads = await this.failedUploadStorageService.getPendingUploads();
    const allUploads = [
      ...pendingUploads.longform.map((u) => ({ ...u, videoType: 'longform' as const })),
      ...pendingUploads.shorts.map((u) => ({ ...u, videoType: 'shorts' as const })),
    ];

    this.logger.log(
      `Found ${allUploads.length} pending uploads (${pendingUploads.longform.length} longform, ${pendingUploads.shorts.length} shorts)`,
    );

    if (allUploads.length === 0) {
      this.logger.log('No pending uploads to process');
      return {
        totalAttempted: 0,
        successCount: 0,
        failedCount: 0,
        results: [],
      };
    }

    const results: Array<{
      title: string;
      videoType: 'longform' | 'shorts';
      success: boolean;
      videoUrl?: string;
      error?: string;
    }> = [];

    let successCount = 0;
    let failedCount = 0;

    // 각 업로드를 순차적으로 처리
    for (const upload of allUploads) {
      try {
        this.logger.log(
          `Processing: ${upload.videoType} - "${upload.title}" (failed at: ${upload.failedAt})`,
        );

        const uploadResult = await this.retryUpload(upload);

        results.push({
          title: upload.title,
          videoType: upload.videoType,
          success: uploadResult.success,
          videoUrl: uploadResult.videoUrl,
          error: uploadResult.error,
        });

        if (uploadResult.success) {
          successCount++;

          // 업로드 성공 시 파일 삭제
          const baseName = upload.videoFileName.replace(/\.[^/.]+$/, ''); // 확장자 제거
          const deleted = await this.failedUploadStorageService.deletePendingUpload(
            upload.videoType,
            baseName,
          );

          if (deleted) {
            this.logger.log(`✅ Successfully uploaded and deleted: ${upload.title}`);
          } else {
            this.logger.warn(
              `Upload succeeded but file deletion failed: ${upload.title}`,
            );
          }

          // Telegram 알림 전송
          await this.telegramNotificationService.sendUploadSuccess({
            title: upload.title,
            videoUrl: uploadResult.videoUrl!,
            videoType: upload.videoType,
            uploadMethod: 'Browser',
          });
        } else {
          failedCount++;
          this.logger.error(`❌ Upload failed: ${upload.title} - ${uploadResult.error}`);
        }

        // 인간처럼 보이도록 각 업로드 사이에 랜덤 지연 (30초 ~ 2분)
        const delay = Math.floor(Math.random() * 90000) + 30000; // 30-120초
        this.logger.log(`Waiting ${Math.floor(delay / 1000)}s before next upload...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        failedCount++;
        this.logger.error(`Error processing ${upload.title}:`, error.message);
        results.push({
          title: upload.title,
          videoType: upload.videoType,
          success: false,
          error: error.message,
        });
      }
    }

    this.logger.log(
      `Retry process completed: ${successCount} succeeded, ${failedCount} failed out of ${allUploads.length} total`,
    );

    return {
      totalAttempted: allUploads.length,
      successCount,
      failedCount,
      results,
    };
  }

  /**
   * 단일 업로드 재시도
   *
   * @param upload - 업로드 메타데이터
   * @returns 업로드 결과
   */
  private async retryUpload(
    upload: FailedUploadMetadata & { videoType: 'longform' | 'shorts' },
  ): Promise<BrowserUploadResult> {
    try {
      // 비디오 파일 경로
      const videoPath = this.failedUploadStorageService.getVideoPath(
        upload.videoType,
        upload.videoFileName,
      );

      // 썸네일 파일 경로 (있는 경우)
      const thumbnailPath = upload.thumbnailFileName
        ? this.failedUploadStorageService.getThumbnailPath(
            upload.videoType,
            upload.thumbnailFileName,
          )
        : undefined;

      // 브라우저 자동화로 업로드
      const result = await this.browserUploadService.uploadVideo({
        videoPath,
        title: upload.title,
        description: upload.description,
        tags: upload.tags,
        privacyStatus: upload.privacyStatus,
        thumbnailPath,
        categoryId: upload.categoryId,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 특정 타입(longform 또는 shorts)만 재업로드
   *
   * @param videoType - 재업로드할 영상 타입
   * @returns 성공/실패 통계
   */
  async retryByType(videoType: 'longform' | 'shorts'): Promise<{
    totalAttempted: number;
    successCount: number;
    failedCount: number;
  }> {
    this.logger.log(`Retrying ${videoType} uploads only...`);

    const pendingUploads = await this.failedUploadStorageService.getPendingUploads();
    const uploads =
      videoType === 'longform' ? pendingUploads.longform : pendingUploads.shorts;

    this.logger.log(`Found ${uploads.length} ${videoType} uploads to retry`);

    let successCount = 0;
    let failedCount = 0;

    for (const upload of uploads) {
      const uploadResult = await this.retryUpload({ ...upload, videoType });

      if (uploadResult.success) {
        successCount++;

        // 파일 삭제
        const baseName = upload.videoFileName.replace(/\.[^/.]+$/, '');
        await this.failedUploadStorageService.deletePendingUpload(videoType, baseName);

        // Telegram 알림
        await this.telegramNotificationService.sendUploadSuccess({
          title: upload.title,
          videoUrl: uploadResult.videoUrl!,
          videoType,
          uploadMethod: 'Browser',
        });
      } else {
        failedCount++;
      }

      // 랜덤 지연
      const delay = Math.floor(Math.random() * 90000) + 30000;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    return {
      totalAttempted: uploads.length,
      successCount,
      failedCount,
    };
  }

  /**
   * 대기 중인 업로드 통계 조회
   *
   * @returns 통계 정보
   */
  async getStatistics(): Promise<{
    longformCount: number;
    shortsCount: number;
    totalCount: number;
  }> {
    return await this.failedUploadStorageService.getStatistics();
  }
}
