import { Controller, Post, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HourlyBrowserUploadScheduleService } from './services/hourly-browser-upload-schedule.service';

/**
 * 뉴스 컨트롤러
 *
 * 뉴스 스크래핑 및 업로드 엔드포인트 제공
 */
@Controller('news')
export class NewsController {
  private readonly logger = new Logger(NewsController.name);

  constructor(
    private readonly hourlyUploadSchedule: HourlyBrowserUploadScheduleService,
  ) {}

  /**
   * 시간별 업로드 스케줄러 수동 트리거
   * 뉴스 스크래핑 → 롱폼/숏폼 생성 및 업로드
   */
  @Post('daum/trigger')
  async triggerHourlyUpload(): Promise<{ message: string }> {
    try {
      this.logger.log('Manual trigger: Hourly upload scheduler');
      await this.hourlyUploadSchedule.triggerManually();
      return { message: 'Hourly upload scheduler triggered successfully' };
    } catch (error) {
      this.logger.error('Failed to trigger hourly upload:', error);
      throw new HttpException(
        `Failed to trigger hourly upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
