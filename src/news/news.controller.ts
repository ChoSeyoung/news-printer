import { Controller, Post, Query, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { DaumNewsScheduleService } from './services/daum-news-schedule.service';

/**
 * 뉴스 컨트롤러
 *
 * 다음 뉴스 스크래핑 전용 엔드포인트 제공
 */
@Controller('news')
export class NewsController {
  private readonly logger = new Logger(NewsController.name);

  constructor(
    private readonly daumNewsSchedule: DaumNewsScheduleService,
  ) {}

  /**
   * 다음 뉴스 수동 트리거 (대통령실/국회)
   * @param limit - 각 카테고리별 기사 수 (기본: 100)
   */
  @Post('daum/trigger')
  async triggerDaumNews(
    @Query('limit') limit?: string,
  ): Promise<{ success: number; failed: number }> {
    try {
      const limitNumber = limit ? parseInt(limit, 10) : 100;
      this.logger.log(`Manual Daum News trigger: limit=${limitNumber}`);
      return await this.daumNewsSchedule.triggerManually(limitNumber);
    } catch (error) {
      this.logger.error('Failed to trigger Daum News:', error);
      throw new HttpException(
        `Failed to trigger Daum News: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
