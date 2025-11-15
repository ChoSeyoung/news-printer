import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { ArticleScraperService } from './services/article-scraper.service';
import { GeminiService } from './services/gemini.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, ArticleScraperService, GeminiService],
  exports: [NewsService, ArticleScraperService, GeminiService],
})
export class NewsModule {}
