import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NewsService } from '../news.service';
import { MediaPipelineService } from '../../media/services/media-pipeline.service';
import { PublishedNewsTrackingService } from '../../media/services/published-news-tracking.service';
import { ShortsPipelineService } from '../../media/services/shorts-pipeline.service';
import { TrendsService } from './trends.service';
import { UrgentNewsService } from './urgent-news.service';
import { ConfigService } from '@nestjs/config';

/**
 * 자동 업로드 스케줄 서비스
 *
 * 수익화 전략에 따른 다중 Cron 스케줄로 하루 15-20개 영상 자동 업로드
 *
 * 스케줄 전략:
 * - 3시간 간격으로 8회 실행 (00:00, 03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00)
 * - 각 스케줄당 2-3개 영상 생성 → 하루 16-24개 영상
 * - 카테고리 순환 배분으로 다양한 시청자층 확보
 * - YouTube API 할당량 고려 (일일 10,000 쿼터)
 *
 * Phase 3 강화 전략:
 * - Google Trends 실시간 트렌딩 키워드 매칭
 * - 긴급 뉴스 자동 감지 및 우선 업로드
 * - 트렌드 기반 콘텐츠 선정으로 조회수 극대화
 *
 * 수익화 목표:
 * - 1-3개월 내 구독자 1,000명 + 시청시간 4,000시간 달성
 * - 일일 조회수 3,000-5,000회 → 10,000-15,000회 증가
 */
@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);
  private isProcessing = false; // 중복 실행 방지
  private categoryIndex = 0; // 카테고리 순환 인덱스

  private readonly categories = [
    'politics',    // 정치
    'economy',     // 경제
    'technology',  // 기술
    'entertainment', // 연예
    'sports',      // 스포츠
    'society',     // 사회
    'health',      // 건강
    'international', // 국제
  ];

  constructor(
    private readonly newsService: NewsService,
    private readonly mediaPipelineService: MediaPipelineService,
    private readonly publishedNewsTracking: PublishedNewsTrackingService,
    private readonly shortsPipelineService: ShortsPipelineService,
    private readonly trendsService: TrendsService,
    private readonly urgentNewsService: UrgentNewsService,
    private readonly configService: ConfigService,
  ) {
    this.logger.log('ScheduleService initialized - Multi-schedule strategy activated');
    this.logger.log('Target: 15-20 videos per day for rapid monetization (1-3 months)');
    this.logger.log('Shorts strategy: 3 Shorts per day (12:00, 18:00, 21:00)');
    this.logger.log('Phase 3: Google Trends integration + Urgent news detection enabled');
  }

  /**
   * 00:00 - 자정 업로드 (3개 영상)
   * 전날 주요 뉴스 요약
   */
  @Cron('0 0 * * *', { name: 'midnight-upload' })
  async midnightUpload() {
    await this.executeScheduledUpload('midnight', 3, ['politics', 'international', 'economy']);
  }

  /**
   * 03:00 - 새벽 업로드 (2개 영상)
   * 해외 뉴스 및 경제 이슈
   */
  @Cron('0 3 * * *', { name: 'dawn-upload' })
  async dawnUpload() {
    await this.executeScheduledUpload('dawn', 2, ['international', 'economy']);
  }

  /**
   * 06:00 - 아침 업로드 (3개 영상)
   * 출근 시간대, 속보성 뉴스
   */
  @Cron('0 6 * * *', { name: 'morning-upload' })
  async morningUpload() {
    await this.executeScheduledUpload('morning', 3, ['politics', 'economy', 'society']);
  }

  /**
   * 09:00 - 오전 업로드 (2개 영상)
   * 업무 시간, 경제/기술 뉴스
   */
  @Cron('0 9 * * *', { name: 'forenoon-upload' })
  async forenoonUpload() {
    await this.executeScheduledUpload('forenoon', 2, ['technology', 'economy']);
  }

  /**
   * 12:00 - 점심 업로드 (3개 영상)
   * 점심 시간, 다양한 카테고리
   */
  @Cron('0 12 * * *', { name: 'noon-upload' })
  async noonUpload() {
    await this.executeScheduledUpload('noon', 3, ['entertainment', 'sports', 'health']);
  }

  /**
   * 15:00 - 오후 업로드 (2개 영상)
   * 오후 시간대, 엔터/스포츠
   */
  @Cron('0 15 * * *', { name: 'afternoon-upload' })
  async afternoonUpload() {
    await this.executeScheduledUpload('afternoon', 2, ['entertainment', 'sports']);
  }

  /**
   * 18:00 - 저녁 업로드 (3개 영상)
   * 퇴근 시간대, 인기 카테고리
   */
  @Cron('0 18 * * *', { name: 'evening-upload' })
  async eveningUpload() {
    await this.executeScheduledUpload('evening', 3, ['politics', 'society', 'entertainment']);
  }

  /**
   * 21:00 - 밤 업로드 (2개 영상)
   * 저녁 시간대, 종합 뉴스
   */
  @Cron('0 21 * * *', { name: 'night-upload' })
  async nightUpload() {
    await this.executeScheduledUpload('night', 2, ['society', 'technology']);
  }

  /**
   * 스케줄 기반 자동 업로드 실행
   *
   * @param scheduleName 스케줄 이름 (로깅용)
   * @param videoCount 생성할 영상 개수
   * @param preferredCategories 우선 카테고리 목록
   */
  private async executeScheduledUpload(
    scheduleName: string,
    videoCount: number,
    preferredCategories: string[],
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
      this.logger.log(`[${scheduleName}] Preferred categories: ${preferredCategories.join(', ')}`);

      // RSS 뉴스 수집 (첫 번째 우선 카테고리 사용, 전체 콘텐츠 포함)
      const allNews = await this.newsService.fetchNews(
        preferredCategories[0], // 첫 번째 카테고리 사용
        videoCount * 3, // 여유분 확보 (중복 제거 고려)
        true, // 전체 콘텐츠 및 AI 스크립트 포함
      );

      if (!allNews || allNews.length === 0) {
        this.logger.warn(`[${scheduleName}] No news found, skipping upload`);
        return;
      }

      this.logger.log(`[${scheduleName}] Fetched ${allNews.length} news items`);

      // 이미 업로드된 뉴스 필터링
      const unpublishedNews = allNews.filter(
        (news) => !this.publishedNewsTracking.isAlreadyPublished(news.link),
      );

      if (unpublishedNews.length === 0) {
        this.logger.warn(`[${scheduleName}] All news already published, skipping upload`);
        return;
      }

      this.logger.log(
        `[${scheduleName}] ${unpublishedNews.length} unpublished news items available`,
      );

      // Phase 3: 긴급 뉴스 감지 및 우선순위 정렬
      this.logger.log(`[${scheduleName}] Phase 3: Detecting urgent news and trending keywords`);

      // 긴급 뉴스 필터링 및 점수 계산
      const urgentNews = await this.urgentNewsService.filterUrgentNews(
        unpublishedNews,
        70, // 70점 이상만 긴급 뉴스로 분류
      );

      // 뉴스 선택 로직: 긴급 뉴스 우선, 부족하면 일반 뉴스로 채우기
      let newsToPublish = [];

      if (urgentNews.length > 0) {
        const avgScore = Math.round(
          urgentNews.reduce((sum, n) => sum + n.urgencyScore, 0) / urgentNews.length,
        );
        this.logger.log(
          `[${scheduleName}] 🚨 Found ${urgentNews.length} urgent news items (avg score: ${avgScore})`,
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
            privacyStatus: 'public', // 수익화를 위해 공개 설정
          });

          if (result.success) {
            successCount++;
            this.logger.log(
              `[${scheduleName}] ✅ Successfully uploaded: ${result.videoUrl}`,
            );
          } else {
            failCount++;
            this.logger.error(
              `[${scheduleName}] ❌ Failed to upload: ${news.title}`,
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
   * 카테고리 순환 전략
   *
   * 8개 카테고리를 순환하며 골고루 콘텐츠 생성
   * 다양한 시청자층 확보 및 알고리즘 노출 극대화
   */
  private getNextCategory(): string {
    const category = this.categories[this.categoryIndex];
    this.categoryIndex = (this.categoryIndex + 1) % this.categories.length;
    return category;
  }

  /**
   * ==================== YouTube Shorts 자동 업로드 스케줄 ====================
   * 하루 3회 Shorts 업로드로 알고리즘 노출 극대화
   * - 점심 시간대 (12:00): 직장인 타겟
   * - 저녁 시간대 (18:00): 퇴근 후 모바일 사용 피크
   * - 밤 시간대 (21:00): 취침 전 콘텐츠 소비 피크
   */

  /**
   * 12:00 - 점심 Shorts (1개)
   * 직장인 점심 시간 타겟
   */
  @Cron('0 12 * * *', { name: 'shorts-lunch' })
  async lunchShortsUpload() {
    await this.executeScheduledShortsUpload('lunch', 1, ['politics', 'economy']);
  }

  /**
   * 18:00 - 저녁 Shorts (1개)
   * 퇴근 후 모바일 사용 피크
   */
  @Cron('0 18 * * *', { name: 'shorts-evening' })
  async eveningShortsUpload() {
    await this.executeScheduledShortsUpload('evening', 1, ['society', 'entertainment']);
  }

  /**
   * 21:00 - 밤 Shorts (1개)
   * 취침 전 콘텐츠 소비 피크
   */
  @Cron('0 21 * * *', { name: 'shorts-night' })
  async nightShortsUpload() {
    await this.executeScheduledShortsUpload('night', 1, ['technology', 'international']);
  }

  /**
   * Shorts 스케줄 기반 자동 업로드 실행
   *
   * @param scheduleName 스케줄 이름 (로깅용)
   * @param shortsCount 생성할 Shorts 개수
   * @param preferredCategories 우선 카테고리 목록
   */
  private async executeScheduledShortsUpload(
    scheduleName: string,
    shortsCount: number,
    preferredCategories: string[],
  ): Promise<void> {
    // 중복 실행 방지
    if (this.isProcessing) {
      this.logger.warn(`[${scheduleName}-shorts] Already processing, skipping...`);
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.log(`[${scheduleName}-shorts] Starting Shorts upload - Target: ${shortsCount}`);
      this.logger.log(`[${scheduleName}-shorts] Preferred categories: ${preferredCategories.join(', ')}`);

      // RSS 뉴스 수집 (Shorts용)
      const allNews = await this.newsService.fetchNews(
        preferredCategories[0],
        shortsCount * 2, // 여유분 확보
        true, // 전체 콘텐츠 포함
      );

      if (!allNews || allNews.length === 0) {
        this.logger.warn(`[${scheduleName}-shorts] No news found, skipping upload`);
        return;
      }

      this.logger.log(`[${scheduleName}-shorts] Fetched ${allNews.length} news items`);

      // 이미 업로드된 뉴스 필터링
      const unpublishedNews = allNews.filter(
        (news) => !this.publishedNewsTracking.isAlreadyPublished(news.link),
      );

      if (unpublishedNews.length === 0) {
        this.logger.warn(`[${scheduleName}-shorts] All news already published, skipping upload`);
        return;
      }

      this.logger.log(
        `[${scheduleName}-shorts] ${unpublishedNews.length} unpublished news items available`,
      );

      // Shorts 생성 및 업로드 (최대 shortsCount개)
      const newsToPublish = unpublishedNews.slice(0, shortsCount);
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < newsToPublish.length; i++) {
        const news = newsToPublish[i];
        try {
          this.logger.log(`[${scheduleName}-shorts] Processing ${i + 1}/${newsToPublish.length}: ${news.title}`);

          // Shorts 생성 및 업로드
          const result = await this.shortsPipelineService.createAndUploadShorts({
            title: news.title,
            newsContent: news.fullContent || news.description,
            newsUrl: news.link,
            privacyStatus: 'public', // 수익화를 위해 공개 설정
          });

          if (result.success) {
            successCount++;
            this.logger.log(
              `[${scheduleName}-shorts] ✅ Successfully uploaded Shorts: ${result.videoUrl}`,
            );
          } else {
            failCount++;
            this.logger.error(
              `[${scheduleName}-shorts] ❌ Failed to upload Shorts: ${news.title}`,
            );
          }

          // API 할당량 보호를 위한 딜레이 (Shorts 업로드 후 5초 대기)
          if (i < newsToPublish.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } catch (error) {
          failCount++;
          this.logger.error(
            `[${scheduleName}-shorts] Error processing Shorts: ${news.title}`,
            error.message,
          );
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `[${scheduleName}-shorts] Completed in ${duration}s - Success: ${successCount}, Failed: ${failCount}`,
      );
    } catch (error) {
      this.logger.error(`[${scheduleName}-shorts] Schedule execution failed:`, error.message);
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
    await this.executeScheduledUpload(
      'manual',
      videoCount,
      ['politics', 'economy', 'technology'],
    );
  }

  /**
   * 수동 테스트용 즉시 Shorts 업로드 메서드
   *
   * @param shortsCount 생성할 Shorts 개수 (기본 1개)
   */
  async manualShortsUpload(shortsCount: number = 1): Promise<void> {
    this.logger.log(`Manual Shorts upload triggered - Target: ${shortsCount} Shorts`);
    await this.executeScheduledShortsUpload(
      'manual',
      shortsCount,
      ['politics', 'economy', 'technology'],
    );
  }
}
