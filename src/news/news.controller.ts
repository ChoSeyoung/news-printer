import { Controller, Get, Post, Query, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsItemDto } from './dto/news-item.dto';
import { PublishAllDto, PublishAllResponseDto, PublishAllResultItem } from './dto/publish-all.dto';
import { NewsPreviewDto, NewsPreviewResponseDto, NewsPreviewItem } from './dto/news-preview.dto';
import { MediaPipelineService } from '../media/services/media-pipeline.service';

@Controller('news')
export class NewsController {
  private readonly logger = new Logger(NewsController.name);

  constructor(
    private readonly newsService: NewsService,
    private readonly mediaPipeline: MediaPipelineService,
  ) {}

  @Get()
  async getNews(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
    @Query('fullContent') fullContent?: string,
  ): Promise<{
    success: boolean;
    data: NewsItemDto[];
    meta: {
      total: number;
      source: string;
      fetchedAt: string;
      category?: string;
      includesFullContent: boolean;
    };
  }> {
    try {
      const limitNumber = limit ? parseInt(limit, 10) : 10;
      const includeFullContent = fullContent === 'true';

      if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
        throw new HttpException(
          'Limit must be between 1 and 100',
          HttpStatus.BAD_REQUEST,
        );
      }

      const newsItems = await this.newsService.fetchNews(
        category || 'politics',
        limitNumber,
        includeFullContent,
      );

      return {
        success: true,
        data: newsItems,
        meta: {
          total: newsItems.length,
          source: 'chosun.com',
          fetchedAt: new Date().toISOString(),
          includesFullContent: includeFullContent,
          ...(category && { category }),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to fetch news: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Integrated endpoint: Fetch news, generate scripts, create videos, and upload to YouTube
   * @param dto - Configuration for news fetching and publishing
   * @returns Results of publishing all news items
   */
  @Post('publish-all')
  async publishAll(@Body() dto: PublishAllDto): Promise<PublishAllResponseDto> {
    try {
      const category = dto.category || 'politics';
      const limit = dto.limit || 10;
      const privacyStatus = dto.privacyStatus || 'unlisted';

      this.logger.log(`Publishing all news: category=${category}, limit=${limit}`);

      // Step 1: Fetch news with full content and scripts
      const newsItems = await this.newsService.fetchNews(category, limit, true);

      if (!newsItems || newsItems.length === 0) {
        return {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          results: [],
        };
      }

      // Step 2: Filter items that have all required fields
      const publishableItems = newsItems.filter(
        (item) => item.fullContent && item.anchor && item.reporter,
      );

      this.logger.log(
        `Found ${publishableItems.length} publishable items out of ${newsItems.length}`,
      );

      // Step 3: Process each item through media pipeline
      const results: PublishAllResultItem[] = [];
      let successful = 0;
      let failed = 0;

      for (const item of publishableItems) {
        try {
          this.logger.log(`Processing: ${item.title}`);

          const result = await this.mediaPipeline.publishNews({
            title: item.title,
            newsContent: item.fullContent || item.description || item.title,
            anchorScript: item.anchor!,
            reporterScript: item.reporter!,
            privacyStatus,
          });

          if (result.success) {
            successful++;
            results.push({
              title: item.title,
              success: true,
              videoId: result.videoId,
              videoUrl: result.videoUrl,
            });
            this.logger.log(`✅ Success: ${item.title} - ${result.videoUrl}`);
          } else {
            failed++;
            results.push({
              title: item.title,
              success: false,
              error: result.error,
            });
            this.logger.warn(`❌ Failed: ${item.title} - ${result.error}`);
          }
        } catch (error) {
          failed++;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.push({
            title: item.title,
            success: false,
            error: errorMessage,
          });
          this.logger.error(`❌ Error processing ${item.title}:`, error);
        }
      }

      this.logger.log(
        `Completed: ${successful} successful, ${failed} failed out of ${publishableItems.length}`,
      );

      return {
        totalProcessed: publishableItems.length,
        successful,
        failed,
        results,
      };
    } catch (error) {
      this.logger.error('Failed to publish news:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to publish news: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Preview news videos before publishing
   * @param dto - Preview configuration
   * @returns Preview data including video metadata
   */
  @Get('preview')
  async previewNews(
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ): Promise<NewsPreviewResponseDto> {
    try {
      const limitNumber = limit ? parseInt(limit, 10) : 10;
      const categoryName = category || 'politics';

      if (isNaN(limitNumber) || limitNumber < 1 || limitNumber > 100) {
        throw new HttpException(
          'Limit must be between 1 and 100',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log(`Generating preview: category=${categoryName}, limit=${limitNumber}`);

      // Fetch news with full content and scripts
      const newsItems = await this.newsService.fetchNews(categoryName, limitNumber, true);

      if (!newsItems || newsItems.length === 0) {
        return {
          total: 0,
          items: [],
          meta: {
            category: categoryName,
            fetchedAt: new Date().toISOString(),
          },
        };
      }

      // Filter items that have all required fields
      const previewableItems = newsItems.filter(
        (item) => item.fullContent && item.anchor && item.reporter,
      );

      this.logger.log(`Generating preview for ${previewableItems.length} items`);

      // Generate preview for each item
      const previewItems: NewsPreviewItem[] = [];

      for (const item of previewableItems) {
        try {
          const preview = await this.mediaPipeline.previewNews({
            title: item.title,
            newsContent: item.fullContent || item.description || item.title,
            anchorScript: item.anchor!,
            reporterScript: item.reporter!,
          });

          previewItems.push({
            title: preview.optimizedTitle,
            originalTitle: item.title,
            description: preview.optimizedDescription,
            tags: preview.tags,
            categoryId: preview.categoryId,
            categoryName: preview.categoryName,
            estimatedDurationSeconds: preview.estimatedDurationSeconds,
            anchorScript: item.anchor!,
            reporterScript: item.reporter!,
          });
        } catch (error) {
          this.logger.error(`Preview error for ${item.title}:`, error);
        }
      }

      return {
        total: previewItems.length,
        items: previewItems,
        meta: {
          category: categoryName,
          fetchedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to generate preview:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to generate preview: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
