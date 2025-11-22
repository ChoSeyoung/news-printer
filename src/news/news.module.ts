import { Module, forwardRef } from '@nestjs/common';
import { NewsController } from './news.controller';
import { GeminiService } from './services/gemini.service';
import { ScheduleService } from './services/schedule.service';
import { DaumNewsScraperService } from './services/daum-news-scraper.service';
import { DaumNewsScheduleService } from './services/daum-news-schedule.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [forwardRef(() => MediaModule)],
  controllers: [NewsController],
  providers: [
    GeminiService,
    ScheduleService,
    DaumNewsScraperService,
    DaumNewsScheduleService,
  ],
  exports: [GeminiService],
})
export class NewsModule {}
