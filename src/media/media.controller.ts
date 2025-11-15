import { Controller, Post, Body, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { MediaPipelineService } from './services/media-pipeline.service';
import { PublishNewsDto, PublishNewsResponseDto } from './dto/publish-news.dto';

@Controller('media')
export class MediaController {
  private readonly logger = new Logger(MediaController.name);

  constructor(private readonly mediaPipeline: MediaPipelineService) {}

  @Post('publish')
  async publishNews(@Body() dto: PublishNewsDto): Promise<PublishNewsResponseDto> {
    try {
      this.logger.log(`Publishing news: ${dto.title}`);

      // Validate input
      if (!dto.title || !dto.anchorScript || !dto.reporterScript) {
        throw new HttpException(
          'Missing required fields: title, anchorScript, and reporterScript are required',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Process through pipeline
      const result = await this.mediaPipeline.publishNews({
        title: dto.title,
        anchorScript: dto.anchorScript,
        reporterScript: dto.reporterScript,
        privacyStatus: dto.privacyStatus || 'unlisted',
      });

      if (result.success) {
        return result;
      } else {
        throw new HttpException(
          result.error || 'Failed to publish news',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    } catch (error) {
      this.logger.error('Failed to publish news:', error.message);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to publish news: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
