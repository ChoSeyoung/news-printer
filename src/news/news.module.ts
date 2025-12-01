import { Module, forwardRef } from '@nestjs/common';
import { NewsController } from './news.controller';
import { KeywordsController } from './controllers/keywords.controller';
import { GeminiService } from './services/gemini.service';
import { DaumNewsScraperService } from './services/daum-news-scraper.service';
import { HourlyBrowserUploadScheduleService } from './services/hourly-browser-upload-schedule.service';
import { KeywordAnalysisService } from './services/keyword-analysis.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [forwardRef(() => MediaModule)],
  controllers: [NewsController, KeywordsController],
  providers: [
    GeminiService,
    DaumNewsScraperService,
    HourlyBrowserUploadScheduleService, // 통합 스케줄러 (활성)
    KeywordAnalysisService,
  ],
  exports: [GeminiService, KeywordAnalysisService, DaumNewsScraperService],
})
export class NewsModule {}
