import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { TtsService } from './services/tts.service';
import { VideoService } from './services/video.service';
import { YoutubeService } from './services/youtube.service';
import { MediaPipelineService } from './services/media-pipeline.service';

@Module({
  controllers: [MediaController],
  providers: [TtsService, VideoService, YoutubeService, MediaPipelineService],
  exports: [MediaPipelineService],
})
export class MediaModule {}
