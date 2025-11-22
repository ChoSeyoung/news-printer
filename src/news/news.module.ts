import { Module, forwardRef } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { ArticleScraperService } from './services/article-scraper.service';
import { GeminiService } from './services/gemini.service';
import { ScheduleService } from './services/schedule.service';
import { TrendsService } from './services/trends.service';
import { UrgentNewsService } from './services/urgent-news.service';
import { DaumNewsScraperService } from './services/daum-news-scraper.service';
import { DaumNewsScheduleService } from './services/daum-news-schedule.service';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [forwardRef(() => MediaModule)],
  controllers: [NewsController],
  providers: [
    NewsService,
    ArticleScraperService,
    GeminiService,
    ScheduleService,
    TrendsService,
    UrgentNewsService,
    DaumNewsScraperService,
    DaumNewsScheduleService,
  ],
  exports: [NewsService, ArticleScraperService, GeminiService, TrendsService, UrgentNewsService],
})
export class NewsModule {}
