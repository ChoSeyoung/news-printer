import { Module, forwardRef } from '@nestjs/common';
import { MediaController } from './media.controller';
import { AuthController } from './controllers/auth.controller';
import { TtsService } from './services/tts.service';
import { VideoService } from './services/video.service';
import { YoutubeService } from './services/youtube.service';
import { MediaPipelineService } from './services/media-pipeline.service';
import { TokenService } from './services/token.service';
import { SeoOptimizerService } from './services/seo-optimizer.service';
import { ThumbnailService } from './services/thumbnail.service';
import { ImageSearchService } from './services/image-search.service';
import { PublishedNewsTrackingService } from './services/published-news-tracking.service';
import { AnalyticsService } from './services/analytics.service';
import { ShortsVideoService } from './services/shorts-video.service';
import { ShortsPipelineService } from './services/shorts-pipeline.service';
import { NewsModule } from '../news/news.module';

@Module({
  imports: [forwardRef(() => NewsModule)],
  controllers: [MediaController, AuthController],
  providers: [
    TtsService,
    VideoService,
    YoutubeService,
    MediaPipelineService,
    TokenService,
    SeoOptimizerService,
    ThumbnailService,
    ImageSearchService,
    PublishedNewsTrackingService,
    AnalyticsService,
    ShortsVideoService,
    ShortsPipelineService,
  ],
  exports: [MediaPipelineService, PublishedNewsTrackingService, ShortsPipelineService],
})
export class MediaModule {}
