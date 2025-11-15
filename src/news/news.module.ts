import { Module } from '@nestjs/common';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { ArticleScraperService } from './services/article-scraper.service';

@Module({
  controllers: [NewsController],
  providers: [NewsService, ArticleScraperService],
  exports: [NewsService, ArticleScraperService],
})
export class NewsModule {}
