import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DaumNewsScraperService, DaumArticleData } from './daum-news-scraper.service';
import { GeminiService } from './gemini.service';
import { MediaPipelineService } from '../../media/services/media-pipeline.service';
import { ShortsPipelineService } from '../../media/services/shorts-pipeline.service';
import { PublishedNewsTrackingService } from '../../media/services/published-news-tracking.service';

/**
 * 다음 뉴스 스케줄 서비스
 *
 * 1시간마다 다음 뉴스(대통령실/국회)를 크롤링하여 영상을 생성하고 업로드합니다.
 *
 * 주요 기능:
 * - 1시간 간격 자동 크롤링
 * - Gemini AI를 통한 앵커/리포터 스크립트 생성
 * - Shorts 영상 자동 업로드
 * - 중복 업로드 방지
 */
@Injectable()
export class DaumNewsScheduleService {
  private readonly logger = new Logger(DaumNewsScheduleService.name);

  /** 각 카테고리별 처리할 기사 수 */
  private readonly articlesPerCategory = 5;

  /** 업로드 시 공개 상태 */
  private readonly privacyStatus: 'public' | 'private' | 'unlisted' = 'public';

  constructor(
    private readonly daumScraper: DaumNewsScraperService,
    private readonly geminiService: GeminiService,
    private readonly mediaPipeline: MediaPipelineService,
    private readonly shortsPipeline: ShortsPipelineService,
    private readonly publishedTracking: PublishedNewsTrackingService,
  ) {}

  /**
   * 서비스 시작 시 로그 출력
   */
  onModuleInit() {
    this.logger.log('DaumNewsScheduleService initialized');
    this.logger.log('Schedule: Daum News every hour at :00');
  }

  /**
   * 1시간마다 실행되는 크론 작업
   * 매 시간 정각에 실행 (예: 1:00, 2:00, 3:00...)
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleDaumNewsCron() {
    this.logger.log('=== Starting Daum News Hourly Job ===');

    try {
      // 1. 대통령실/국회 뉴스 크롤링
      const articles = await this.daumScraper.fetchAllNews(this.articlesPerCategory);
      this.logger.log(`Fetched ${articles.length} articles from Daum News`);

      if (articles.length === 0) {
        this.logger.warn('No articles found, skipping...');
        return;
      }

      // 2. 중복 제거 (이미 업로드된 기사 제외)
      const newArticles = articles.filter(
        (article) => !this.publishedTracking.isAlreadyPublished(article.url),
      );
      this.logger.log(`${newArticles.length} new articles after duplicate check`);

      if (newArticles.length === 0) {
        this.logger.log('All articles already published, skipping...');
        return;
      }

      // 3. 각 기사 처리
      let successful = 0;
      let failed = 0;

      for (const article of newArticles) {
        try {
          await this.processArticle(article);
          successful++;
        } catch (error) {
          failed++;
          this.logger.error(`Failed to process article "${article.title}":`, error.message);
        }
      }

      this.logger.log(`=== Daum News Job Completed: ${successful} success, ${failed} failed ===`);

      // 4. 임시 이미지 정리
      await this.daumScraper.cleanupAllImages();
    } catch (error) {
      this.logger.error('Daum News cron job failed:', error.message);
    }
  }

  /**
   * 개별 기사 처리 (스크립트 생성 → 롱폼 + 숏츠 영상 제작 → 업로드)
   *
   * @param article - 기사 데이터
   */
  private async processArticle(article: DaumArticleData): Promise<void> {
    this.logger.log(`Processing: ${article.title}`);

    // 1. Gemini로 앵커/리포터 스크립트 생성
    const fullContent = `${article.title}\n\n${article.content}`;
    const scripts = await this.geminiService.generateScripts(fullContent);

    if (!scripts || !scripts.anchor || !scripts.reporter) {
      throw new Error('Failed to generate scripts');
    }

    // 2. Long-form 영상 생성 및 업로드
    const longformResult = await this.mediaPipeline.publishNews({
      title: article.title,
      newsContent: article.content,
      anchorScript: scripts.anchor,
      reporterScript: scripts.reporter,
      newsUrl: article.url,
      imageUrls: article.croppedImagePaths,
      privacyStatus: this.privacyStatus,
    });

    if (longformResult.success) {
      this.logger.log(`✅ Long-form Uploaded: ${article.title} - ${longformResult.videoUrl}`);
    } else {
      this.logger.warn(`❌ Long-form Failed: ${article.title} - ${longformResult.error}`);
    }

    // 3. Shorts 영상 생성 및 업로드 (Reporter 스크립트 재사용)
    const shortsResult = await this.shortsPipeline.createAndUploadShorts({
      title: article.title,
      reporterScript: scripts.reporter, // Reporter 대본 재사용 (Gemini API 절약)
      newsUrl: article.url,
      imageUrls: article.croppedImagePaths,
      privacyStatus: this.privacyStatus,
    });

    if (shortsResult.success) {
      this.logger.log(`✅ Shorts Uploaded: ${article.title} - ${shortsResult.videoUrl}`);

      // 중복 방지를 위해 기록 (Shorts 기준)
      await this.publishedTracking.markAsPublished(
        article.url,
        article.title,
        shortsResult.videoId,
        shortsResult.videoUrl,
      );
    } else {
      this.logger.warn(`❌ Shorts Failed: ${article.title} - ${shortsResult.error}`);
    }

    // 롱폼과 숏츠 둘 다 실패하면 에러
    if (!longformResult.success && !shortsResult.success) {
      throw new Error(`Both uploads failed: Long-form: ${longformResult.error}, Shorts: ${shortsResult.error}`);
    }
  }

  /**
   * 수동 실행 메서드 (테스트/디버깅용)
   * @param limit - 각 카테고리별 기사 수 (기본: articlesPerCategory)
   */
  async triggerManually(limit?: number): Promise<{ success: number; failed: number }> {
    const articleLimit = limit || this.articlesPerCategory;
    this.logger.log(`Manual trigger started with limit=${articleLimit}`);

    try {
      const articles = await this.daumScraper.fetchAllNews(articleLimit);
      const newArticles = articles.filter(
        (article) => !this.publishedTracking.isAlreadyPublished(article.url),
      );

      let successful = 0;
      let failed = 0;

      for (const article of newArticles) {
        try {
          await this.processArticle(article);
          successful++;
        } catch (error) {
          failed++;
          this.logger.error(`Failed: ${article.title}`, error.message);
        }
      }

      await this.daumScraper.cleanupAllImages();
      return { success: successful, failed };
    } catch (error) {
      this.logger.error('Manual trigger failed:', error.message);
      return { success: 0, failed: 0 };
    }
  }
}
