import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NewsService } from '../news.service';
import { MediaPipelineService } from '../../media/services/media-pipeline.service';
import { PublishedNewsTrackingService } from '../../media/services/published-news-tracking.service';
import { ShortsPipelineService } from '../../media/services/shorts-pipeline.service';
import { UrgentNewsService } from './urgent-news.service';
import { ConfigService } from '@nestjs/config';
import { NewsItemDto } from '../dto/news-item.dto';

/**
 * 자동 업로드 스케줄 서비스
 *
 * 정치 뉴스 전문 채널을 위한 간소화된 스케줄
 *
 * 스케줄:
 * - 롱폼: 매일 오후 12:00 (정치 카테고리)
 * - Shorts: 매일 오후 12:30 (정치 카테고리)
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private isProcessing = false; // 중복 실행 방지

  constructor(
    private readonly newsService: NewsService,
    private readonly mediaPipelineService: MediaPipelineService,
    private readonly publishedNewsTracking: PublishedNewsTrackingService,
    private readonly shortsPipelineService: ShortsPipelineService,
    private readonly urgentNewsService: UrgentNewsService,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('ScheduleService initialized - Politics news channel');
    this.logger.log('Schedule: Longform at 12:00, Shorts at 12:30 (daily)');
  }

  /**
   * 12:00 - 롱폼 업로드 (정치 뉴스)
   */
  @Cron('0 12 * * *', { name: 'noon-longform' })
  async noonLongformUpload() {
    await this.executeScheduledUpload('noon-longform', 3);
  }

  /**
   * 12:30 - Shorts 업로드 (정치 뉴스)
   */
  @Cron('30 12 * * *', { name: 'noon-shorts' })
  async noonShortsUpload() {
    await this.executeScheduledShortsUpload('noon-shorts', 1);
  }

  /**
   * 스케줄 기반 자동 업로드 실행 (롱폼)
   *
   * @param scheduleName 스케줄 이름 (로깅용)
   * @param videoCount 생성할 영상 개수
   */
  private async executeScheduledUpload(
    scheduleName: string,
    videoCount: number,
  ): Promise<void> {
    // 중복 실행 방지
    if (this.isProcessing) {
      this.logger.warn(`[${scheduleName}] Already processing, skipping...`);
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.log(`[${scheduleName}] Starting scheduled upload - Target: ${videoCount} videos`);
      this.logger.log(`[${scheduleName}] Category: politics`);

      // RSS 뉴스 수집 (정치 카테고리)
      const allNews = await this.newsService.fetchNews(
        'politics',
        videoCount * 3, // 여유분 확보 (중복 제거 고려)
        true, // 전체 콘텐츠 및 AI 스크립트 포함
      );

      if (!allNews || allNews.length === 0) {
        this.logger.warn(`[${scheduleName}] No news found, skipping upload`);
        return;
      }

      this.logger.log(`[${scheduleName}] Fetched ${allNews.length} news items`);

      // 이미 업로드된 뉴스 필터링 (URL 및 제목 중복 체크)
      const unpublishedNews = allNews.filter(
        (news) => !this.publishedNewsTracking.isAlreadyPublished(news.link, news.title),
      );

      if (unpublishedNews.length === 0) {
        this.logger.warn(`[${scheduleName}] All news already published, skipping upload`);
        return;
      }

      this.logger.log(
        `[${scheduleName}] ${unpublishedNews.length} unpublished news items available`,
      );

      // 긴급 뉴스 감지 및 우선순위 정렬
      this.logger.log(`[${scheduleName}] Detecting urgent news`);

      // 긴급 뉴스 필터링 및 점수 계산
      const urgentNews = await this.urgentNewsService.filterUrgentNews(
        unpublishedNews,
        70, // 70점 이상만 긴급 뉴스로 분류
      );

      // 뉴스 선택 로직: 긴급 뉴스 우선, 부족하면 일반 뉴스로 채우기
      let newsToPublish: NewsItemDto[] = [];

      if (urgentNews.length > 0) {
        const avgScore = Math.round(
          urgentNews.reduce((sum, n) => sum + n.urgencyScore, 0) / urgentNews.length,
        );
        this.logger.log(
          `[${scheduleName}] Found ${urgentNews.length} urgent news items (avg score: ${avgScore})`,
        );

        // 긴급 뉴스 우선 선택
        newsToPublish = urgentNews.slice(0, videoCount);

        // 남은 자리가 있으면 일반 뉴스로 채우기
        if (newsToPublish.length < videoCount) {
          const remainingSlots = videoCount - newsToPublish.length;
          const regularNews = unpublishedNews
            .filter((news) => !urgentNews.some((u) => u.link === news.link))
            .slice(0, remainingSlots);
          newsToPublish.push(...regularNews);
          this.logger.log(
            `[${scheduleName}] Added ${regularNews.length} regular news to fill remaining slots`,
          );
        }
      } else {
        this.logger.log(`[${scheduleName}] No urgent news detected, using regular selection`);
        newsToPublish = unpublishedNews.slice(0, videoCount);
      }

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < newsToPublish.length; i++) {
        const news = newsToPublish[i];
        try {
          this.logger.log(`[${scheduleName}] Processing ${i + 1}/${newsToPublish.length}: ${news.title}`);

          // 영상 생성 및 업로드
          const result = await this.mediaPipelineService.publishNews({
            title: news.title,
            newsContent: news.fullContent || news.description,
            anchorScript: news.anchor || '',
            reporterScript: news.reporter || '',
            newsUrl: news.link,
            imageUrls: news.imageUrls,
            privacyStatus: 'public',
          });

          if (result.success) {
            successCount++;
            this.logger.log(
              `[${scheduleName}] Successfully uploaded: ${result.videoUrl}`,
            );
          } else {
            failCount++;
            this.logger.error(
              `[${scheduleName}] Failed to upload: ${news.title}`,
            );
          }

          // API 할당량 보호를 위한 딜레이 (업로드 후 10초 대기)
          if (i < newsToPublish.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
        } catch (error) {
          failCount++;
          this.logger.error(
            `[${scheduleName}] Error processing news: ${news.title}`,
            error.message,
          );
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `[${scheduleName}] Completed in ${duration}s - Success: ${successCount}, Failed: ${failCount}`,
      );
    } catch (error) {
      this.logger.error(`[${scheduleName}] Schedule execution failed:`, error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Shorts 스케줄 기반 자동 업로드 실행
   *
   * @param scheduleName 스케줄 이름 (로깅용)
   * @param shortsCount 생성할 Shorts 개수
   */
  private async executeScheduledShortsUpload(
    scheduleName: string,
    shortsCount: number,
  ): Promise<void> {
    // 중복 실행 방지
    if (this.isProcessing) {
      this.logger.warn(`[${scheduleName}] Already processing, skipping...`);
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.log(`[${scheduleName}] Starting Shorts upload - Target: ${shortsCount}`);
      this.logger.log(`[${scheduleName}] Category: politics`);

      // RSS 뉴스 수집 (정치 카테고리)
      const allNews = await this.newsService.fetchNews(
        'politics',
        shortsCount * 2, // 여유분 확보
        true, // 전체 콘텐츠 포함
      );

      if (!allNews || allNews.length === 0) {
        this.logger.warn(`[${scheduleName}] No news found, skipping upload`);
        return;
      }

      this.logger.log(`[${scheduleName}] Fetched ${allNews.length} news items`);

      // 이미 업로드된 뉴스 필터링 (URL 및 제목 중복 체크)
      const unpublishedNews = allNews.filter(
        (news) => !this.publishedNewsTracking.isAlreadyPublished(news.link, news.title),
      );

      if (unpublishedNews.length === 0) {
        this.logger.warn(`[${scheduleName}] All news already published, skipping upload`);
        return;
      }

      this.logger.log(
        `[${scheduleName}] ${unpublishedNews.length} unpublished news items available`,
      );

      // Shorts 생성 및 업로드 (최대 shortsCount개)
      const newsToPublish = unpublishedNews.slice(0, shortsCount);
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < newsToPublish.length; i++) {
        const news = newsToPublish[i];
        try {
          this.logger.log(`[${scheduleName}] Processing ${i + 1}/${newsToPublish.length}: ${news.title}`);

          // Shorts 생성 및 업로드
          const result = await this.shortsPipelineService.createAndUploadShorts({
            title: news.title,
            newsContent: news.fullContent || news.description,
            newsUrl: news.link,
            imageUrls: news.imageUrls,
            privacyStatus: 'public',
          });

          if (result.success) {
            successCount++;
            this.logger.log(
              `[${scheduleName}] Successfully uploaded Shorts: ${result.videoUrl}`,
            );
          } else {
            failCount++;
            this.logger.error(
              `[${scheduleName}] Failed to upload Shorts: ${news.title}`,
            );
          }

          // API 할당량 보호를 위한 딜레이 (Shorts 업로드 후 5초 대기)
          if (i < newsToPublish.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } catch (error) {
          failCount++;
          this.logger.error(
            `[${scheduleName}] Error processing Shorts: ${news.title}`,
            error.message,
          );
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `[${scheduleName}] Completed in ${duration}s - Success: ${successCount}, Failed: ${failCount}`,
      );
    } catch (error) {
      this.logger.error(`[${scheduleName}] Schedule execution failed:`, error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 수동 테스트용 즉시 업로드 메서드
   *
   * @param videoCount 생성할 영상 개수 (기본 2개)
   */
  async manualUpload(videoCount: number = 2): Promise<void> {
    this.logger.log(`Manual upload triggered - Target: ${videoCount} videos`);
    await this.executeScheduledUpload('manual', videoCount);
  }

  /**
   * 수동 테스트용 즉시 Shorts 업로드 메서드
   *
   * @param shortsCount 생성할 Shorts 개수 (기본 1개)
   */
  async manualShortsUpload(shortsCount: number = 1): Promise<void> {
    this.logger.log(`Manual Shorts upload triggered - Target: ${shortsCount} Shorts`);
    await this.executeScheduledShortsUpload('manual', shortsCount);
  }
}
