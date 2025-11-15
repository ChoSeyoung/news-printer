import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { NewsService } from './news.service';
import { NewsItemDto } from './dto/news-item.dto';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

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
}
