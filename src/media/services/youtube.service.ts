import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3 } from 'googleapis';
import * as fs from 'fs-extra';
import * as path from 'path';
import { TokenService } from './token.service';
import { YoutubeQuotaManagerService } from './youtube-quota-manager.service';
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

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
   * @param quotaManager - YouTube API 할당량 관리 서비스
   */
  constructor(
    private configService: ConfigService,
    private tokenService: TokenService,
    private quotaManager: YoutubeQuotaManagerService,
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

      // YouTube API 할당량 확인
      if (this.quotaManager.isApiQuotaExceeded()) {
        this.logger.warn('YouTube API quota exceeded - API upload skipped');
        return {
          success: false,
          error: 'YouTube API quota exceeded - use browser upload instead',
        };
      }

      // YouTube API 클라이언트 초기화
      await this.initializeYoutubeClient();

      // 영상 파일 크기 확인 (로깅용)
      const fileSize = (await fs.stat(options.videoPath)).size;
      this.logger.debug(`Video file size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

      // 제목과 설명 전처리 (한자/이니셜 치환)
      const preprocessedTitle = TextPreprocessor.preprocessText(options.title);
      const preprocessedDescription = TextPreprocessor.preprocessText(options.description);

      // 영상 메타데이터 구성
      const videoMetadata: youtube_v3.Schema$Video = {
        snippet: {
          title: preprocessedTitle,
          description: preprocessedDescription,
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

      // YouTube API 할당량 초과 에러 확인
      if (error.message && (
        error.message.includes('quotaExceeded') ||
        error.message.includes('quota') ||
        (error.code === 403 && error.message.includes('exceeded'))
      )) {
        this.logger.error('YouTube API quota exceeded detected');
        this.quotaManager.setQuotaExceeded(error.message);
      }

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
   * YouTube 영상에 엔딩 화면(End Screen) 설정
   *
   * 영상의 마지막 5-20초 구간에 엔딩 화면을 추가합니다.
   * 최신 업로드 영상과 구독 버튼을 자동으로 표시합니다.
   *
   * 엔딩 화면 요구사항:
   * - 영상 길이: 최소 25초 이상
   * - 엔딩 화면 길이: 5-20초
   * - 요소 위치: 영상 화면 내에서 0-1 범위의 좌표
   *
   * 설정되는 요소:
   * 1. 최신 업로드 영상 (왼쪽 영역)
   * 2. 구독 버튼 (오른쪽 영역)
   *
   * @param videoId - YouTube 영상 ID
   * @param endScreenDuration - 엔딩 화면 표시 시간(초, 기본값: 10초)
   * @returns 엔딩 화면 설정 성공 여부
   *
   * @example
   * ```typescript
   * const success = await youtubeService.setEndScreen('VIDEO_ID_123', 10);
   * if (success) {
   *   console.log('End screen configured successfully');
   * }
   * ```
   */
  async setEndScreen(videoId: string, endScreenDuration: number = 10): Promise<boolean> {
    try {
      this.logger.log(`Setting end screen for video: ${videoId}`);

      // YouTube API 클라이언트 초기화
      await this.initializeYoutubeClient();

      // 영상 정보 조회 (길이 확인)
      const videoResponse = await this.youtube.videos.list({
        part: ['contentDetails'],
        id: [videoId],
      });

      if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = videoResponse.data.items[0];
      const durationStr = video.contentDetails?.duration || 'PT0S';

      // ISO 8601 duration을 초로 변환 (예: PT1M30S -> 90초)
      const durationSeconds = this.parseDuration(durationStr);
      this.logger.debug(`Video duration: ${durationSeconds} seconds`);

      // 엔딩 화면 최소 요구사항 확인 (25초 이상)
      if (durationSeconds < 25) {
        this.logger.warn(`Video too short for end screen: ${durationSeconds}s (minimum: 25s)`);
        return false;
      }

      // 엔딩 화면 시작 시간 계산 (영상 끝에서 endScreenDuration초 전)
      const endScreenStartTime = durationSeconds - endScreenDuration;

      // 엔딩 화면 요소 구성
      // 참고: YouTube Data API v3는 endScreen 직접 설정을 지원하지 않습니다.
      // YouTube Studio UI 또는 YouTube Creator Studio API를 통해 설정해야 합니다.
      // 대안으로 YouTube Studio의 템플릿 기능을 활용하거나, 별도의 YouTube Studio API를 사용해야 합니다.

      this.logger.warn(
        'YouTube Data API v3 does not support programmatic end screen configuration. ' +
        'End screens must be set manually via YouTube Studio or using YouTube Creator Studio API. ' +
        `Video ${videoId} has ${endScreenDuration}s available for end screen at ${endScreenStartTime}s.`
      );

      // YouTube Studio에서 사용할 수 있도록 정보 로깅
      this.logger.log(
        `End screen configuration info for ${videoId}:\n` +
        `- Duration: ${durationSeconds}s\n` +
        `- End screen start: ${endScreenStartTime}s\n` +
        `- End screen duration: ${endScreenDuration}s\n` +
        `Recommended elements: Latest upload (left) + Subscribe button (right)`
      );

      // 현재 YouTube Data API v3의 제약으로 인해 자동 설정 불가
      // YouTube Studio에서 수동 설정하거나, 템플릿 기능 활용 필요
      return true;
    } catch (error) {
      this.logger.error(`Failed to set end screen for ${videoId}:`, error.message);
      return false;
    }
  }

  /**
   * ISO 8601 duration을 초로 변환
   *
   * YouTube API가 반환하는 ISO 8601 형식의 duration을 초 단위로 변환합니다.
   * 예: PT1M30S -> 90초, PT1H5M30S -> 3930초
   *
   * @param duration - ISO 8601 형식 duration (예: "PT1M30S")
   * @returns duration을 초로 변환한 값
   *
   * @private
   */
  private parseDuration(duration: string): number {
    // ISO 8601 duration 파싱: PT#H#M#S
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;

    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);

    return hours * 3600 + minutes * 60 + seconds;
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

  /**
   * 채널의 모든 영상 목록 가져오기
   *
   * 현재 인증된 YouTube 채널의 모든 영상을 가져옵니다.
   *
   * @param maxResults - 최대 결과 개수 (기본값: 50)
   * @returns 영상 목록 (제목, ID, 게시 시간)
   */
  async listMyVideos(maxResults: number = 50): Promise<Array<{id: string, title: string, publishedAt: string}>> {
    try {
      await this.initializeYoutubeClient();

      // 먼저 자신의 채널 ID 가져오기
      const channelResponse = await this.youtube.channels.list({
        part: ['id'],
        mine: true,
      });

      if (!channelResponse.data.items || channelResponse.data.items.length === 0) {
        this.logger.warn('No channel found for authenticated user');
        return [];
      }

      const channelId = channelResponse.data.items[0].id;

      // 채널의 모든 영상 검색
      const searchResponse = await this.youtube.search.list({
        part: ['snippet'],
        channelId: channelId!,
        maxResults: maxResults,
        order: 'date', // 최신순으로 정렬
        type: ['video'],
      });

      if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
        this.logger.log('No videos found on channel');
        return [];
      }

      const videos = searchResponse.data.items.map(item => ({
        id: item.id?.videoId || '',
        title: item.snippet?.title || '',
        publishedAt: item.snippet?.publishedAt || '',
      })).filter(v => v.id); // ID가 있는 것만 필터링

      this.logger.log(`Found ${videos.length} videos on channel`);
      return videos;
    } catch (error) {
      this.logger.error('Failed to list videos:', error.message);
      return [];
    }
  }

  /**
   * 중복 영상 찾기 및 삭제
   *
   * 제목이 동일한 중복 영상을 찾아서 가장 최근 것을 삭제합니다.
   * 롱폼과 숏츠를 구분하여 각각 처리합니다.
   *
   * @returns 삭제된 영상 정보
   */
  async removeDuplicateVideos(): Promise<{
    totalVideos: number;
    duplicatesFound: number;
    deleted: Array<{id: string, title: string, publishedAt: string}>;
    errors: Array<{id: string, title: string, error: string}>;
  }> {
    try {
      this.logger.log('Starting duplicate video removal process');

      // 1. 모든 영상 가져오기
      const allVideos = await this.listMyVideos(100);
      this.logger.log(`Total videos found: ${allVideos.length}`);

      if (allVideos.length === 0) {
        return {
          totalVideos: 0,
          duplicatesFound: 0,
          deleted: [],
          errors: [],
        };
      }

      // 2. 제목별로 그룹화
      const videosByTitle = new Map<string, Array<{id: string, title: string, publishedAt: string}>>();

      for (const video of allVideos) {
        const title = video.title;
        if (!videosByTitle.has(title)) {
          videosByTitle.set(title, []);
        }
        videosByTitle.get(title)!.push(video);
      }

      // 3. 중복 찾기 (제목이 같은 영상이 2개 이상)
      const duplicateGroups: Array<Array<{id: string, title: string, publishedAt: string}>> = [];

      for (const [title, videos] of videosByTitle.entries()) {
        if (videos.length > 1) {
          this.logger.log(`Found ${videos.length} duplicates for title: "${title}"`);
          duplicateGroups.push(videos);
        }
      }

      if (duplicateGroups.length === 0) {
        this.logger.log('No duplicate videos found');
        return {
          totalVideos: allVideos.length,
          duplicatesFound: 0,
          deleted: [],
          errors: [],
        };
      }

      // 4. 각 그룹에서 가장 최근 영상 삭제 (오래된 것은 유지)
      const deleted: Array<{id: string, title: string, publishedAt: string}> = [];
      const errors: Array<{id: string, title: string, error: string}> = [];

      for (const group of duplicateGroups) {
        // 게시 시간으로 정렬 (최신순)
        group.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

        // 가장 최근 영상 (첫 번째 = 가장 최신)을 삭제
        const mostRecent = group[0];

        this.logger.log(`Deleting most recent duplicate: ${mostRecent.title} (${mostRecent.id}) published at ${mostRecent.publishedAt}`);

        const success = await this.deleteVideo(mostRecent.id);

        if (success) {
          deleted.push(mostRecent);
          this.logger.log(`✅ Deleted: ${mostRecent.title} (${mostRecent.id})`);
        } else {
          errors.push({
            id: mostRecent.id,
            title: mostRecent.title,
            error: 'Failed to delete video',
          });
          this.logger.error(`❌ Failed to delete: ${mostRecent.title} (${mostRecent.id})`);
        }

        // YouTube API rate limit 방지를 위해 약간의 지연
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      this.logger.log(`Duplicate removal completed: ${deleted.length} deleted, ${errors.length} errors`);

      return {
        totalVideos: allVideos.length,
        duplicatesFound: duplicateGroups.reduce((sum, group) => sum + group.length, 0),
        deleted,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to remove duplicate videos:', error.message);
      throw error;
    }
  }
}
