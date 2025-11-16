import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import * as fs from 'fs-extra';
import * as path from 'path';
import { TokenService } from './token.service';

export interface YoutubeUploadOptions {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  categoryId?: string;
  privacyStatus?: 'public' | 'private' | 'unlisted';
}

export interface YoutubeUploadResult {
  success: boolean;
  videoId?: string;
  videoUrl?: string;
  error?: string;
}

@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  private youtube: youtube_v3.Youtube;
  private oauth2Client: any;

  constructor(
    private configService: ConfigService,
    private tokenService: TokenService,
  ) {}

  /**
   * Initialize YouTube API with OAuth2 credentials
   */
  private async initializeYoutubeClient(): Promise<void> {
    try {
      // Load OAuth credentials
      const credentialsPath = path.join(
        process.cwd(),
        'credentials',
        'youtube-oauth-credentials.json',
      );
      const credentials = await fs.readJson(credentialsPath);
      const { client_id, client_secret, redirect_uris } = credentials.web;

      // Create OAuth2 client
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0],
      );

      // Load saved tokens
      const tokens = await this.tokenService.loadTokens();
      if (!tokens) {
        throw new Error(
          'No YouTube OAuth tokens found. ' +
            'Please authorize first by visiting: http://localhost:3000/auth/youtube/authorize',
        );
      }

      // Set credentials
      this.oauth2Client.setCredentials(tokens);

      // Check if token needs refresh
      if (this.tokenService.isTokenExpired(tokens)) {
        this.logger.log('Access token expired, refreshing...');
        const { credentials: newTokens } = await this.oauth2Client.refreshAccessToken();
        await this.tokenService.saveTokens(newTokens);
        this.logger.log('Access token refreshed successfully');
      }

      // Create YouTube client
      this.youtube = google.youtube({
        version: 'v3',
        auth: this.oauth2Client,
      });

      this.logger.log('YouTube client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize YouTube client:', error.message);
      throw error;
    }
  }

  /**
   * Upload video to YouTube
   * @param options - Upload configuration
   * @returns Upload result with video ID and URL
   */
  async uploadVideo(options: YoutubeUploadOptions): Promise<YoutubeUploadResult> {
    try {
      this.logger.log(`Uploading video to YouTube: ${options.title}`);

      // Initialize YouTube client
      await this.initializeYoutubeClient();

      // Read video file
      const fileSize = (await fs.stat(options.videoPath)).size;
      this.logger.debug(`Video file size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      // Prepare video metadata
      const videoMetadata: youtube_v3.Schema$Video = {
        snippet: {
          title: options.title,
          description: options.description,
          tags: options.tags || ['news', 'automated'],
          categoryId: options.categoryId || '25', // News & Politics
        },
        status: {
          privacyStatus: options.privacyStatus || 'unlisted',
          selfDeclaredMadeForKids: false,
        },
      };

      // Upload video
      const response = await this.youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: videoMetadata,
        media: {
          body: fs.createReadStream(options.videoPath),
        },
      });

      const videoId = response.data.id || undefined;
      const videoUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined;

      this.logger.log(`Video uploaded successfully: ${videoUrl}`);

      return {
        success: true,
        videoId,
        videoUrl,
      };
    } catch (error) {
      this.logger.error('Failed to upload video to YouTube:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete video from YouTube
   * @param videoId - YouTube video ID
   */
  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      await this.initializeYoutubeClient();
      await this.youtube.videos.delete({ id: videoId });
      this.logger.log(`Video deleted from YouTube: ${videoId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete video ${videoId}:`, error.message);
      return false;
    }
  }
}
