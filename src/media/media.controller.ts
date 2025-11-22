import { Controller, Post, Get, Body, Param, Query, HttpException, HttpStatus, Logger, Delete } from '@nestjs/common';
import { MediaPipelineService } from './services/media-pipeline.service';
import { AnalyticsService } from './services/analytics.service';
import { YoutubeService } from './services/youtube.service';
import { PublishNewsDto, PublishNewsResponseDto } from './dto/publish-news.dto';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(
    private readonly mediaPipeline: MediaPipelineService,
    private readonly analyticsService: AnalyticsService,
    private readonly youtubeService: YoutubeService,
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
}
