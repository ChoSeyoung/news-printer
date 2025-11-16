import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import * as fs from 'fs-extra';
import * as path from 'path';
import { TokenService } from './token.service';

/**
 * YouTube 업로드 옵션 인터페이스
 */
export interface YoutubeUploadOptions {
  /** 업로드할 영상 파일 경로 */
  videoPath: string;
  /** 영상 제목 (최대 100자) */
  title: string;
  /** 영상 설명 */
  description: string;
  /** 영상 태그 배열 (선택사항) */
  tags?: string[];
  /** YouTube 카테고리 ID (기본값: '25' = 뉴스/정치) */
  categoryId?: string;
  /** 공개 상태: 공개, 비공개, 일부 공개 (기본값: 'unlisted') */
  privacyStatus?: 'public' | 'private' | 'unlisted';
  /** 썸네일 이미지 파일 경로 (선택사항) */
  thumbnailPath?: string;
}

/**
 * YouTube 업로드 결과 인터페이스
 */
export interface YoutubeUploadResult {
  /** 업로드 성공 여부 */
  success: boolean;
  /** YouTube 영상 ID */
  videoId?: string;
  /** YouTube 영상 URL */
  videoUrl?: string;
  /** 에러 메시지 (실패 시) */
  error?: string;
}

/**
 * YouTube 업로드 서비스
 *
 * Google YouTube Data API v3를 사용하여 영상을 YouTube에 업로드하는 서비스입니다.
 * OAuth 2.0 인증을 통해 사용자의 YouTube 채널에 영상을 게시합니다.
 *
 * 주요 기능:
 * - OAuth 2.0 인증 및 토큰 관리
 * - 영상 업로드 (메타데이터 포함)
 * - 썸네일 이미지 업로드
 * - 영상 삭제
 * - 토큰 자동 갱신
 *
 * OAuth 인증 흐름:
 * 1. 최초 인증: http://localhost:3000/auth/youtube/authorize 방문
 * 2. Google 계정 로그인 및 권한 승인
 * 3. 토큰 자동 저장 및 관리
 * 4. 만료 시 자동 갱신
 *
 * @example
 * ```typescript
 * const result = await youtubeService.uploadVideo({
 *   videoPath: './temp/video.mp4',
 *   title: '오늘의 뉴스',
 *   description: '주요 뉴스를 전해드립니다.',
 *   tags: ['뉴스', '속보'],
 *   thumbnailPath: './temp/thumbnail.jpg'
 * });
 * // result.videoUrl: 'https://www.youtube.com/watch?v=VIDEO_ID'
 * ```
 */
@Injectable()
export class YoutubeService {
  private readonly logger = new Logger(YoutubeService.name);
  /** YouTube Data API 클라이언트 */
  private youtube: youtube_v3.Youtube;
  /** Google OAuth 2.0 클라이언트 */
  private oauth2Client: any;

  /**
   * YoutubeService 생성자
   *
   * @param configService - NestJS 환경 설정 서비스
   * @param tokenService - OAuth 토큰 관리 서비스
   */
  constructor(
    private configService: ConfigService,
    private tokenService: TokenService,
  ) {}

  /**
   * YouTube API 클라이언트 초기화
   *
   * OAuth 2.0 인증 정보를 로드하고 YouTube API 클라이언트를 생성합니다.
   * 저장된 토큰을 로드하고, 만료된 경우 자동으로 갱신합니다.
   *
   * 처리 과정:
   * 1. OAuth 인증 정보 파일 로드 (youtube-oauth-credentials.json)
   * 2. OAuth 2.0 클라이언트 생성
   * 3. 저장된 토큰 로드 및 설정
   * 4. 토큰 만료 여부 확인
   * 5. 만료 시 자동 갱신
   * 6. YouTube API 클라이언트 생성
   *
   * @returns Promise<void>
   * @throws {Error} 인증 정보 또는 토큰이 없는 경우
   * @throws {Error} OAuth 클라이언트 초기화 실패 시
   *
   * @private
   */
  private async initializeYoutubeClient(): Promise<void> {
    try {
      // 1. OAuth 인증 정보 로드
      const credentialsPath = path.join(
        process.cwd(),
        'credentials',
        'youtube-oauth-credentials.json',
      );
      const credentials = await fs.readJson(credentialsPath);
      const { client_id, client_secret, redirect_uris } = credentials.web;

      // 2. OAuth 2.0 클라이언트 생성
      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0],
      );

      // 3. 저장된 토큰 로드
      const tokens = await this.tokenService.loadTokens();
      if (!tokens) {
        throw new Error(
          'No YouTube OAuth tokens found. ' +
            'Please authorize first by visiting: http://localhost:3000/auth/youtube/authorize',
        );
      }

      // 4. 토큰 설정
      this.oauth2Client.setCredentials(tokens);

      // 5. 토큰 만료 확인 및 자동 갱신
      if (this.tokenService.isTokenExpired(tokens)) {
        this.logger.log('Access token expired, refreshing...');
        const { credentials: newTokens } = await this.oauth2Client.refreshAccessToken();
        await this.tokenService.saveTokens(newTokens);
        this.logger.log('Access token refreshed successfully');
      }

      // 6. YouTube API 클라이언트 생성
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
   * YouTube에 영상 업로드
   *
   * 영상 파일과 메타데이터를 YouTube에 업로드합니다.
   * 썸네일이 제공된 경우 자동으로 썸네일도 업로드합니다.
   *
   * 업로드 프로세스:
   * 1. YouTube API 클라이언트 초기화
   * 2. 영상 파일 크기 확인
   * 3. 메타데이터 구성 (제목, 설명, 태그, 카테고리, 공개 상태)
   * 4. 영상 업로드 실행
   * 5. 썸네일 업로드 (제공된 경우)
   *
   * 메타데이터 기본값:
   * - 카테고리: '25' (뉴스/정치)
   * - 공개 상태: 'unlisted' (일부 공개)
   * - 어린이 콘텐츠: false
   *
   * @param options - YouTube 업로드 옵션
   * @returns 업로드 결과 (성공 여부, 영상 ID, URL)
   *
   * @example
   * ```typescript
   * const result = await youtubeService.uploadVideo({
   *   videoPath: './temp/news_video.mp4',
   *   title: '2024년 1월 1일 주요 뉴스',
   *   description: '오늘의 주요 뉴스를 전해드립니다.\n\n#뉴스 #속보',
   *   tags: ['뉴스', '속보', '한국뉴스'],
   *   categoryId: '25',
   *   privacyStatus: 'unlisted',
   *   thumbnailPath: './temp/thumbnail.jpg'
   * });
   *
   * if (result.success) {
   *   console.log(`Uploaded: ${result.videoUrl}`);
   * }
   * ```
   */
  async uploadVideo(options: YoutubeUploadOptions): Promise<YoutubeUploadResult> {
    try {
      this.logger.log(`Uploading video to YouTube: ${options.title}`);

      // YouTube API 클라이언트 초기화
      await this.initializeYoutubeClient();

      // 영상 파일 크기 확인 (로깅용)
      const fileSize = (await fs.stat(options.videoPath)).size;
      this.logger.debug(`Video file size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      // 영상 메타데이터 구성
      const videoMetadata: youtube_v3.Schema$Video = {
        snippet: {
          title: options.title,
          description: options.description,
          tags: options.tags || ['news', 'automated'],
          categoryId: options.categoryId || '25', // 25 = 뉴스/정치 카테고리
        },
        status: {
          privacyStatus: options.privacyStatus || 'unlisted', // 기본값: 일부 공개
          selfDeclaredMadeForKids: false, // 어린이 콘텐츠 아님
        },
      };

      // YouTube에 영상 업로드
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

      // 썸네일 업로드 (제공된 경우)
      if (options.thumbnailPath && videoId) {
        try {
          await this.uploadThumbnail(videoId, options.thumbnailPath);
          this.logger.log(`Thumbnail uploaded successfully for video: ${videoId}`);
        } catch (thumbnailError) {
          this.logger.warn(`Failed to upload thumbnail: ${thumbnailError.message}`);
          // 썸네일 업로드 실패 시에도 전체 업로드는 성공으로 처리
        }
      }

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
   * YouTube 영상에 썸네일 이미지 업로드
   *
   * 업로드된 영상에 커스텀 썸네일 이미지를 설정합니다.
   * JPEG 형식의 이미지를 YouTube에 업로드합니다.
   *
   * 썸네일 요구사항:
   * - 형식: JPEG
   * - 권장 해상도: 1280x720 (16:9 비율)
   * - 최대 파일 크기: 2MB
   * - 계정 인증 필요 (전화번호 인증된 YouTube 계정)
   *
   * @param videoId - YouTube 영상 ID
   * @param thumbnailPath - 썸네일 이미지 파일 경로
   * @returns Promise<void>
   * @throws {Error} 썸네일 업로드 실패 시
   *
   * @private
   *
   * @example
   * ```typescript
   * await this.uploadThumbnail('VIDEO_ID_123', './temp/thumbnail.jpg');
   * ```
   */
  private async uploadThumbnail(videoId: string, thumbnailPath: string): Promise<void> {
    try {
      this.logger.debug(`Uploading thumbnail for video: ${videoId}`);

      const response = await this.youtube.thumbnails.set({
        videoId: videoId,
        media: {
          mimeType: 'image/jpeg',
          body: fs.createReadStream(thumbnailPath),
        },
      });

      this.logger.debug(`Thumbnail upload response: ${JSON.stringify(response.data)}`);
    } catch (error) {
      this.logger.error(`Failed to upload thumbnail for ${videoId}:`, error.message);
      throw error;
    }
  }

  /**
   * YouTube에서 영상 삭제
   *
   * 업로드된 영상을 YouTube에서 완전히 삭제합니다.
   * 삭제된 영상은 복구할 수 없습니다.
   *
   * 주의사항:
   * - 삭제 후에는 복구 불가능
   * - 영상의 조회수, 좋아요 등 모든 데이터 삭제
   * - YouTube API 권한 필요
   *
   * @param videoId - 삭제할 YouTube 영상 ID
   * @returns 삭제 성공 여부
   *
   * @example
   * ```typescript
   * const deleted = await youtubeService.deleteVideo('VIDEO_ID_123');
   * if (deleted) {
   *   console.log('Video deleted successfully');
   * }
   * ```
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
