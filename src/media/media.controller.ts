import { Controller, Post, Get, Body, Param, Query, HttpException, HttpStatus, Logger, Delete } from '@nestjs/common';
import { MediaPipelineService } from './services/media-pipeline.service';
import { AnalyticsService } from './services/analytics.service';
import { YoutubeService } from './services/youtube.service';
import { PendingUploadRetryService } from './services/pending-upload-retry.service';
import { ShortsPipelineService } from './services/shorts-pipeline.service';
import { DaumNewsScraperService } from '../news/services/daum-news-scraper.service';
import { GeminiService } from '../news/services/gemini.service';
import { PublishNewsDto, PublishNewsResponseDto } from './dto/publish-news.dto';
import * as fs from 'fs-extra';
import * as path from 'path';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly mediaPipeline: MediaPipelineService,
    private readonly analyticsService: AnalyticsService,
    private readonly youtubeService: YoutubeService,
    private readonly pendingUploadRetryService: PendingUploadRetryService,
    private readonly shortsPipeline: ShortsPipelineService,
    private readonly daumScraper: DaumNewsScraperService,
    private readonly geminiService: GeminiService,
  ) {}

  @Post('publish')
  async publishNews(@Body() dto: PublishNewsDto): Promise<PublishNewsResponseDto> {
    try {
      this.logger.log(`Publishing news: ${dto.title}`);

      // Validate input
      if (!dto.title || !dto.newsContent || !dto.anchorScript || !dto.reporterScript) {
        throw new HttpException(
          'Missing required fields: title, newsContent, anchorScript, and reporterScript are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Process through pipeline
      const result = await this.mediaPipeline.publishNews({
        title: dto.title,
        newsContent: dto.newsContent,
        anchorScript: dto.anchorScript,
        reporterScript: dto.reporterScript,
        privacyStatus: dto.privacyStatus || 'unlisted',
      });

      if (result.success) {
        return result;
      } else {
        throw new HttpException(
          result.error || 'Failed to publish news',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      this.logger.error('Failed to publish news:', error.message);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to publish news: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 영상 메트릭 조회
   *
   * @param videoId - YouTube 영상 ID
   * @returns 영상 성과 메트릭
   */
  @Get('analytics/:videoId/metrics')
  async getVideoMetrics(@Param('videoId') videoId: string) {
    try {
      this.logger.log(`Fetching metrics for video: ${videoId}`);
      const metrics = await this.analyticsService.getVideoMetrics(videoId);
      return {
        success: true,
        data: metrics,
      };
    } catch (error) {
      this.logger.error(`Failed to get metrics for ${videoId}:`, error.message);
      throw new HttpException(
        `Failed to get video metrics: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 검색 유입 키워드 조회
   *
   * @param videoId - YouTube 영상 ID
   * @param limit - 최대 결과 개수 (기본: 25)
   * @returns 검색 키워드 배열
   */
  @Get('analytics/:videoId/keywords')
  async getSearchKeywords(
    @Param('videoId') videoId: string,
    @Query('limit') limit?: number,
  ) {
    try {
      this.logger.log(`Fetching search keywords for video: ${videoId}`);
      const keywords = await this.analyticsService.getSearchTerms(
        videoId,
        limit ? Number(limit) : 25,
      );
      return {
        success: true,
        data: keywords,
        total: keywords.length,
      };
    } catch (error) {
      this.logger.error(`Failed to get search keywords for ${videoId}:`, error.message);
      throw new HttpException(
        `Failed to get search keywords: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 종합 분석 리포트 생성
   *
   * @param videoId - YouTube 영상 ID
   * @returns 종합 분석 리포트
   */
  @Get('analytics/:videoId/report')
  async generateAnalyticsReport(@Param('videoId') videoId: string) {
    try {
      this.logger.log(`Generating analytics report for video: ${videoId}`);
      const report = await this.analyticsService.generateAnalyticsReport(videoId);
      return {
        success: true,
        data: report,
        message: `Report saved to analytics/report_${videoId}_${new Date().toISOString().split('T')[0]}.json`,
      };
    } catch (error) {
      this.logger.error(`Failed to generate report for ${videoId}:`, error.message);
      throw new HttpException(
        `Failed to generate analytics report: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 고성과 영상 조회
   *
   * @param threshold - 성과 기준 배수 (기본: 1.5)
   * @param limit - 최대 결과 개수 (기본: 10)
   * @returns 고성과 영상 배열
   */
  @Get('analytics/high-performers')
  async getHighPerformers(
    @Query('threshold') threshold?: number,
    @Query('limit') limit?: number,
  ) {
    try {
      this.logger.log('Fetching high-performing videos');
      const videos = await this.analyticsService.getHighPerformingVideos(
        threshold ? Number(threshold) : 1.5,
        limit ? Number(limit) : 10,
      );
      return {
        success: true,
        data: videos,
        total: videos.length,
      };
    } catch (error) {
      this.logger.error('Failed to get high-performing videos:', error.message);
      throw new HttpException(
        `Failed to get high-performing videos: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * YouTube 중복 영상 제거
   *
   * 제목이 동일한 중복 영상을 찾아서 가장 최근 것을 삭제합니다.
   * 오래된 영상은 유지하고, 최신 업로드만 삭제합니다.
   *
   * @returns 삭제된 영상 정보
   */
  @Delete('youtube/duplicates')
  async removeDuplicateVideos() {
    try {
      this.logger.log('Starting duplicate video removal');
      const result = await this.youtubeService.removeDuplicateVideos();

      return {
        success: true,
        message: `Removed ${result.deleted.length} duplicate videos`,
        summary: {
          totalVideos: result.totalVideos,
          duplicatesFound: result.duplicatesFound,
          deletedCount: result.deleted.length,
          errorCount: result.errors.length,
        },
        deleted: result.deleted,
        errors: result.errors,
      };
    } catch (error) {
      this.logger.error('Failed to remove duplicate videos:', error.message);
      throw new HttpException(
        `Failed to remove duplicate videos: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * pending-uploads 디렉토리의 모든 영상을 브라우저 자동화로 재업로드
   *
   * 백그라운드에서 비동기로 실행되며, 즉시 응답을 반환합니다.
   * 업로드 진행 상황은 로그 또는 Telegram 알림으로 확인하세요.
   *
   * @returns 작업 시작 확인
   */
  @Post('retry-pending-uploads')
  async retryPendingUploads() {
    try {
      this.logger.log('Starting pending uploads retry process in background');

      // Get current stats before starting
      const stats = await this.pendingUploadRetryService.getStatistics();

      // Start the retry process in background (fire-and-forget)
      this.pendingUploadRetryService.retryAllPendingUploads().then((result) => {
        this.logger.log(
          `Background retry completed: ${result.successCount} succeeded, ${result.failedCount} failed out of ${result.totalAttempted} total`
        );
      }).catch((error) => {
        this.logger.error('Background retry process failed:', error.message);
      });

      return {
        success: true,
        message: 'Retry process started in background',
        status: 'running',
        pending: {
          longformCount: stats.longformCount,
          shortformCount: stats.shortformCount,
          totalCount: stats.totalCount,
        },
        note: 'Process is running in background. Check logs or Telegram notifications for progress.',
      };
    } catch (error) {
      this.logger.error('Failed to start retry process:', error.message);
      throw new HttpException(
        `Failed to start retry process: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * pending-uploads 통계 조회
   *
   * @returns 대기 중인 업로드 통계
   */
  @Get('pending-uploads/stats')
  async getPendingUploadsStats() {
    try {
      const stats = await this.pendingUploadRetryService.getStatistics();
      return {
        success: true,
        data: stats,
      };
    } catch (error) {
      this.logger.error('Failed to get pending uploads stats:', error.message);
      throw new HttpException(
        `Failed to get pending uploads stats: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 특정 타입(longform 또는 shorts)만 재업로드
   *
   * 백그라운드에서 비동기로 실행되며, 즉시 응답을 반환합니다.
   *
   * @param videoType - 재업로드할 영상 타입
   * @returns 작업 시작 확인
   */
  @Post('retry-pending-uploads/:videoType')
  async retryPendingUploadsByType(@Param('videoType') videoType: 'longform' | 'shortform') {
    try {
      if (videoType !== 'longform' && videoType !== 'shortform') {
        throw new HttpException(
          'Invalid video type. Must be "longform" or "shortform"',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Starting ${videoType} uploads retry process in background`);

      // Get current stats
      const stats = await this.pendingUploadRetryService.getStatistics();
      const count = videoType === 'longform' ? stats.longformCount : stats.shortformCount;

      // Start background process
      this.pendingUploadRetryService.retryByType(videoType).then((result) => {
        this.logger.log(
          `Background ${videoType} retry completed: ${result.successCount} succeeded, ${result.failedCount} failed out of ${result.totalAttempted} total`
        );
      }).catch((error) => {
        this.logger.error(`Background ${videoType} retry failed:`, error.message);
      });

      return {
        success: true,
        message: `${videoType} retry process started in background`,
        status: 'running',
        videoType,
        pendingCount: count,
        note: 'Process is running in background. Check logs or Telegram notifications for progress.',
      };
    } catch (error) {
      this.logger.error(`Failed to start ${videoType} retry:`, error.message);
      throw new HttpException(
        `Failed to start ${videoType} retry: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 검토용 영상 생성 (롱폼 + 숏폼)
   *
   * 최신 뉴스 1개를 가져와서 롱폼과 숏폼 영상을 생성하여 output/review 디렉토리에 저장합니다.
   * API 실행 전 검토 디렉토리를 모두 정리합니다.
   *
   * @returns 생성된 영상 경로
   */
  @Post('review/generate')
  async generateReviewVideos() {
    try {
      this.logger.log('Starting review video generation');
      const reviewDir = path.join(process.cwd(), 'output', 'review');

      // 1. 검토 디렉토리 정리
      this.logger.log('Cleaning review directory...');
      await fs.emptyDir(reviewDir);

      // 2. 최신 뉴스 1개 가져오기
      this.logger.log('Fetching latest news article...');
      const articles = await this.daumScraper.fetchAllNews(1);

      if (articles.length === 0) {
        throw new HttpException('No news articles found', HttpStatus.NOT_FOUND);
      }

      const article = articles[0];
      this.logger.log(`Selected article: ${article.title}`);

      // 3. Gemini로 롱폼 스크립트 생성
      this.logger.log('Generating longform script with Gemini...');
      const longformScript = await this.geminiService.generateScripts(article.content);

      // 4. 롱폼 영상 생성 (업로드 없이 파일만 생성)
      this.logger.log('Generating longform video...');
      const longformResult = await this.mediaPipeline.publishNews({
        title: article.title,
        newsContent: article.content,
        anchorScript: longformScript.anchor,
        reporterScript: longformScript.reporter,
        newsUrl: article.url,
        imageUrls: article.imageUrls,
        privacyStatus: 'private',
        skipUpload: true, // 업로드 건너뛰기
      });

      // 5. 숏폼 영상 생성 (Gemini가 자동으로 스크립트 생성)
      this.logger.log('Generating shortform video...');
      const shortsResult = await this.shortsPipeline.createAndUploadShorts({
        title: article.title,
        content: article.content, // Gemini가 자동으로 Shorts 스크립트 생성
        newsUrl: article.url,
        imageUrls: article.imageUrls,
        skipUpload: true, // 업로드 건너뛰기
      });

      // 6. 생성된 영상 파일을 review 디렉토리로 복사
      const longformPath = path.join(reviewDir, 'longform_review.mp4');
      const shortformPath = path.join(reviewDir, 'shortform_review.mp4');

      if (longformResult.videoPath) {
        await fs.copy(longformResult.videoPath, longformPath);
        this.logger.log(`Longform saved to: ${longformPath}`);
      }

      if (shortsResult.videoPath) {
        await fs.copy(shortsResult.videoPath, shortformPath);
        this.logger.log(`Shortform saved to: ${shortformPath}`);
      }

      return {
        success: true,
        message: 'Review videos generated successfully',
        article: {
          title: article.title,
          url: article.url,
        },
        videos: {
          longform: longformPath,
          shortform: shortformPath,
        },
        note: 'Videos saved to output/review directory. No upload performed.',
      };
    } catch (error) {
      this.logger.error('Failed to generate review videos:', error.message);
      throw new HttpException(
        `Failed to generate review videos: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
