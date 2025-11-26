import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DaumNewsScraperService } from './daum-news-scraper.service';
import { GeminiService } from './gemini.service';
import { MediaPipelineService } from '../../media/services/media-pipeline.service';
import { ShortsPipelineService } from '../../media/services/shorts-pipeline.service';
import { PublishedNewsTrackingService } from '../../media/services/published-news-tracking.service';
import { CleanupService } from '../../media/services/cleanup.service';

/**
 * 1시간마다 뉴스를 스크래핑하고 브라우저로 업로드하는 통합 스케줄러
 *
 * 주요 기능:
 * - 1시간 간격 Daum 뉴스 크롤링
 * - 중복 업로드 자동 방지 (PublishedNewsTrackingService)
 * - 롱폼 + 숏폼 영상 모두 생성 및 업로드
 * - 브라우저 자동화로 YouTube 업로드
 * - Telegram 알림 전송
 */
@Injectable()
export class HourlyBrowserUploadScheduleService {
  private readonly logger = new Logger(HourlyBrowserUploadScheduleService.name);
  private isProcessing = false;

  /** 각 실행당 처리할 최대 기사 수 */
  private readonly maxArticlesPerRun = 5;

  /** 업로드 시 공개 상태 */
  private readonly privacyStatus: 'public' | 'private' | 'unlisted' = 'public';

  constructor(
    private readonly daumScraper: DaumNewsScraperService,
    private readonly geminiService: GeminiService,
    private readonly mediaPipeline: MediaPipelineService,
    private readonly shortsPipeline: ShortsPipelineService,
    private readonly publishedTracking: PublishedNewsTrackingService,
    private readonly cleanupService: CleanupService,
  ) {}

  /**
   * 서비스 시작 시 로그 출력
   */
  onModuleInit() {
    this.logger.log('HourlyBrowserUploadScheduleService initialized');
    this.logger.log('Schedule: Every hour at :00 (Scrape + Upload both longform & shortform)');
  }

  /**
   * 1시간마다 실행되는 크론 작업
   * 매 시간 정각에 실행 (예: 1:00, 2:00, 3:00...)
   *
   * 처리 순서:
   * 1. Daum 뉴스 스크래핑 (국회)
   * 2. 중복 체크 (이미 업로드된 기사 제외)
   * 3. 각 기사별 롱폼 + 숏폼 영상 생성 및 브라우저 업로드
   * 4. 업로드 완료 후 추적 기록
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyUpload() {
    // 중복 실행 방지
    if (this.isProcessing) {
      this.logger.warn('⏳ Previous job is still processing, skipping this schedule...');
      return;
    }

    this.logger.log('=== Starting Hourly Browser Upload Job ===');
    this.isProcessing = true;

    try {
      // 1. 국회 뉴스 크롤링
      const articles = await this.daumScraper.fetchAllNews(this.maxArticlesPerRun);
      this.logger.log(`📰 Fetched ${articles.length} articles from Daum News`);

      if (articles.length === 0) {
        this.logger.warn('No articles found, skipping...');
        return;
      }

      // 2. 중복 제거 (이미 업로드된 기사 제외)
      const newArticles = articles.filter(
        (article) => !this.publishedTracking.isAlreadyPublished(article.url),
      );
      this.logger.log(`✅ ${newArticles.length} new articles after duplicate check`);

      if (newArticles.length === 0) {
        this.logger.log('All articles already published, skipping...');
        return;
      }

      // 3. 각 기사 처리 (롱폼 + 숏폼)
      let totalSuccess = 0;
      let totalFailed = 0;

      for (let i = 0; i < newArticles.length; i++) {
        const article = newArticles[i];
        this.logger.log(`\n[${i + 1}/${newArticles.length}] Processing: ${article.title}`);

        try {
          // Gemini로 스크립트 생성
          const fullContent = `${article.title}\n\n${article.content}`;
          const scripts = await this.geminiService.generateScripts(fullContent);

          if (!scripts || !scripts.anchor || !scripts.reporter) {
            this.logger.error('❌ Failed to generate scripts, skipping...');
            totalFailed++;
            continue;
          }

          // 숏폼 생성 및 업로드
          this.logger.log('   🎬 Creating and uploading shortform video...');
          const shortsResult = await this.shortsPipeline.createAndUploadShorts({
            title: article.title,
            reporterScript: scripts.reporter, // 후방 호환성 유지
            content: article.content, // Shorts 전용 스크립트 생성용
            newsUrl: article.url,
            imageUrls: article.imageUrls,
          });

          if (shortsResult.success) {
            this.logger.log(`   ✅ Shortform uploaded: ${shortsResult.videoUrl}`);
            totalSuccess++;
          } else {
            this.logger.error(`   ❌ Shortform failed: ${shortsResult.error}`);
            totalFailed++;
          }

          // 대기 시간 (API 부하 분산)
          await new Promise((resolve) => setTimeout(resolve, 3000));

          // 롱폼 생성 및 업로드
          this.logger.log('   🎬 Creating and uploading longform video...');
          const longformResult = await this.mediaPipeline.publishNews({
            title: article.title,
            newsContent: article.content,
            anchorScript: scripts.anchor,
            reporterScript: scripts.reporter,
            newsUrl: article.url,
            imageUrls: article.imageUrls,
            privacyStatus: this.privacyStatus,
          });

          if (longformResult.success) {
            this.logger.log(`   ✅ Longform uploaded: ${longformResult.videoUrl}`);
            totalSuccess++;
          } else {
            this.logger.error(`   ❌ Longform failed: ${longformResult.error}`);
            totalFailed++;
          }

          // 기사 간 대기 시간
          if (i < newArticles.length - 1) {
            this.logger.log('   ⏳ Waiting 5s before next article...');
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } catch (error) {
          this.logger.error(`   ❌ Error processing article: ${error.message}`);
          totalFailed++;
        }
      }

      this.logger.log(
        `\n=== Hourly Job Completed: ${totalSuccess} success, ${totalFailed} failed ===`,
      );

      // 4. 임시 이미지 정리
      await this.daumScraper.cleanupAllImages();

      // 5. 업로드 완료 후 정리 작업 (pending-uploads + temp)
      if (totalSuccess > 0) {
        this.logger.log('🧹 Performing post-upload cleanup...');
        try {
          const cleanupResult = await this.cleanupService.cleanupAll();
          this.logger.log(
            `✅ Cleanup completed: ${cleanupResult.totalFilesDeleted} files removed ` +
            `(pending: ${cleanupResult.pendingUploads.totalDeleted}, temp: ${cleanupResult.temp.deletedCount})`,
          );
        } catch (error) {
          this.logger.error(`❌ Cleanup failed: ${error.message}`);
          // 정리 실패는 전체 프로세스를 중단하지 않음
        }
      }
    } catch (error) {
      this.logger.error('Hourly upload job failed:', error.message);
      this.logger.error(error.stack);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 수동 트리거 메서드 (테스트용)
   */
  async triggerManually() {
    this.logger.log('🔧 Manual trigger requested');
    await this.handleHourlyUpload();
  }
}
