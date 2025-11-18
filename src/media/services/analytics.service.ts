import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, youtube_v3, youtubeAnalytics_v2 } from 'googleapis';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 영상 메트릭 인터페이스
 */
export interface VideoMetrics {
  /** 영상 ID */
  videoId: string;
  /** 영상 제목 */
  title: string;
  /** 조회수 */
  views: number;
  /** 좋아요 수 */
  likes: number;
  /** 평균 시청 시간 (초) */
  averageViewDuration: number;
  /** 평균 시청률 (%) */
  averageViewPercentage: number;
  /** 클릭률 (CTR, %) */
  clickThroughRate: number;
  /** 구독자 증가 수 */
  subscribersGained: number;
  /** 게시 날짜 */
  publishedAt: string;
  /** 카테고리 */
  categoryId: string;
}

/**
 * 검색 유입 키워드 인터페이스
 */
export interface SearchTerm {
  /** 검색 키워드 */
  term: string;
  /** 해당 키워드로 유입된 조회수 */
  views: number;
  /** 전체 조회수 대비 비율 (%) */
  percentage: number;
}

/**
 * 데모그래픽 데이터 인터페이스
 */
export interface DemographicData {
  /** 연령대 */
  ageGroup: string;
  /** 성별 */
  gender: string;
  /** 조회수 */
  views: number;
  /** 시청 시간 (분) */
  watchTimeMinutes: number;
}

/**
 * 트래픽 소스 인터페이스
 */
export interface TrafficSource {
  /** 소스 타입 (검색, 추천, 외부 등) */
  sourceType: string;
  /** 조회수 */
  views: number;
  /** 비율 (%) */
  percentage: number;
}

/**
 * 종합 분석 리포트 인터페이스
 */
export interface AnalyticsReport {
  /** 영상 메트릭 */
  videoMetrics: VideoMetrics;
  /** 검색 유입 키워드 (상위 25개) */
  searchTerms: SearchTerm[];
  /** 데모그래픽 데이터 */
  demographics: DemographicData[];
  /** 트래픽 소스 */
  trafficSources: TrafficSource[];
  /** 시간대별 조회수 */
  hourlyViews: Array<{ hour: number; views: number }>;
  /** 생성 시간 */
  generatedAt: string;
}

/**
 * YouTube Analytics 서비스
 *
 * YouTube Analytics API를 사용하여 영상 성과 메트릭을 수집하고 분석합니다.
 * 조회수, 체류 시간, CTR, 검색 키워드, 데모그래픽 등의 데이터를 추적하여
 * 콘텐츠 최적화 및 성과 개선에 활용합니다.
 *
 * 주요 기능:
 * - 영상별 성과 메트릭 수집 (조회수, 좋아요, 시청 시간 등)
 * - 검색 유입 키워드 분석 (상위 25개)
 * - 데모그래픽 데이터 분석 (연령, 성별)
 * - 트래픽 소스 분석 (검색, 추천, 외부 등)
 * - 종합 분석 리포트 생성 및 저장
 *
 * API 할당량:
 * - YouTube Data API v3: 일일 10,000 쿼리
 * - YouTube Analytics API: 일일 50,000 쿼리 (충분함)
 *
 * @example
 * ```typescript
 * // 단일 영상 메트릭 조회
 * const metrics = await analyticsService.getVideoMetrics('VIDEO_ID');
 * console.log(metrics.views, metrics.averageViewDuration);
 *
 * // 종합 리포트 생성
 * const report = await analyticsService.generateAnalyticsReport('VIDEO_ID');
 * // analytics/report_VIDEO_ID_2024-01-01.json 저장
 *
 * // 검색 키워드 분석
 * const keywords = await analyticsService.getSearchTerms('VIDEO_ID');
 * console.log(keywords[0].term, keywords[0].views);
 * ```
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  /** YouTube Data API 클라이언트 */
  private youtube: youtube_v3.Youtube;
  /** YouTube Analytics API 클라이언트 */
  private analytics: youtubeAnalytics_v2.Youtubeanalytics;
  /** OAuth2 인증 클라이언트 */
  private auth: any;
  /** 분석 데이터 저장 디렉토리 */
  private readonly analyticsDir = './analytics';

  /**
   * AnalyticsService 생성자
   *
   * YouTube API 클라이언트를 초기화하고 OAuth2 인증을 설정합니다.
   *
   * @param configService - NestJS 환경 설정 서비스
   */
  constructor(private configService: ConfigService) {
    // 분석 데이터 저장 디렉토리 생성
    fs.ensureDirSync(this.analyticsDir);

    // OAuth2 인증 클라이언트 초기화
    this.initializeAuth();
  }

  /**
   * OAuth2 인증 클라이언트 초기화
   *
   * YouTube API 접근을 위한 OAuth2 인증을 설정합니다.
   * 기존 TokenService에서 저장한 토큰을 사용합니다.
   *
   * @private
   */
  private async initializeAuth(): Promise<void> {
    try {
      const clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID');
      const clientSecret = this.configService.get<string>('YOUTUBE_CLIENT_SECRET');
      const redirectUri = this.configService.get<string>('YOUTUBE_REDIRECT_URI');

      if (!clientId || !clientSecret || !redirectUri) {
        this.logger.error('YouTube API credentials not configured');
        throw new Error('YouTube API credentials are required');
      }

      // OAuth2 클라이언트 생성
      this.auth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

      // 저장된 토큰 로드
      const tokenPath = './credentials/youtube-tokens.json';
      if (await fs.pathExists(tokenPath)) {
        const tokens = await fs.readJson(tokenPath);
        this.auth.setCredentials(tokens);
        this.logger.log('YouTube OAuth2 credentials loaded successfully');
      } else {
        this.logger.warn('YouTube token not found. Please authenticate first.');
      }

      // API 클라이언트 초기화
      this.youtube = google.youtube({ version: 'v3', auth: this.auth });
      this.analytics = google.youtubeAnalytics({ version: 'v2', auth: this.auth });

      this.logger.log('YouTube Analytics API initialized');
    } catch (error) {
      this.logger.error('Failed to initialize YouTube Analytics API:', error.message);
    }
  }

  /**
   * 영상별 성과 메트릭 수집
   *
   * YouTube Analytics API를 사용하여 특정 영상의 주요 성과 지표를 수집합니다.
   *
   * 수집 메트릭:
   * - views: 조회수
   * - likes: 좋아요 수
   * - averageViewDuration: 평균 시청 시간 (초)
   * - averageViewPercentage: 평균 시청률 (%)
   * - subscribersGained: 구독자 증가 수
   *
   * @param videoId - YouTube 영상 ID
   * @param startDate - 시작 날짜 (YYYY-MM-DD, 기본: 영상 게시일)
   * @param endDate - 종료 날짜 (YYYY-MM-DD, 기본: 오늘)
   * @returns 영상 메트릭 데이터
   *
   * @example
   * ```typescript
   * const metrics = await analyticsService.getVideoMetrics('abc123xyz');
   * console.log(`조회수: ${metrics.views}`);
   * console.log(`평균 시청 시간: ${metrics.averageViewDuration}초`);
   * console.log(`평균 시청률: ${metrics.averageViewPercentage}%`);
   * ```
   */
  async getVideoMetrics(
    videoId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<VideoMetrics> {
    try {
      this.logger.log(`Fetching metrics for video: ${videoId}`);

      // 영상 정보 가져오기 (제목, 게시일, 카테고리)
      const videoResponse = await this.youtube.videos.list({
        part: ['snippet', 'statistics'],
        id: [videoId],
      });

      if (!videoResponse.data.items || videoResponse.data.items.length === 0) {
        throw new Error(`Video not found: ${videoId}`);
      }

      const video = videoResponse.data.items[0];
      const publishedAt = video.snippet?.publishedAt || new Date().toISOString();

      // 날짜 설정 (기본값: 영상 게시일 ~ 오늘)
      const start = startDate || publishedAt.split('T')[0];
      const end = endDate || new Date().toISOString().split('T')[0];

      // Analytics API로 상세 메트릭 조회
      const analyticsResponse = await this.analytics.reports.query({
        ids: 'channel==MINE',
        startDate: start,
        endDate: end,
        metrics: 'views,likes,averageViewDuration,averageViewPercentage,subscribersGained',
        dimensions: 'video',
        filters: `video==${videoId}`,
      });

      // 메트릭 데이터 파싱
      const rows = analyticsResponse.data.rows || [];
      const metrics = rows.length > 0 ? rows[0] : [0, 0, 0, 0, 0];

      // CTR 계산 (YouTube Data API에서 제공하지 않으므로 별도 조회)
      const ctr = await this.getClickThroughRate(videoId, start, end);

      const result: VideoMetrics = {
        videoId,
        title: video.snippet?.title || 'Unknown',
        views: Number(metrics[0]) || 0,
        likes: Number(metrics[1]) || 0,
        averageViewDuration: Number(metrics[2]) || 0,
        averageViewPercentage: Number(metrics[3]) || 0,
        clickThroughRate: ctr,
        subscribersGained: Number(metrics[4]) || 0,
        publishedAt,
        categoryId: video.snippet?.categoryId || '25',
      };

      this.logger.log(`Metrics collected for ${videoId}: ${result.views} views`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to get video metrics for ${videoId}:`, error.message);
      throw error;
    }
  }

  /**
   * 클릭률(CTR) 조회
   *
   * 썸네일 노출 대비 클릭 비율을 계산합니다.
   *
   * @param videoId - YouTube 영상 ID
   * @param startDate - 시작 날짜
   * @param endDate - 종료 날짜
   * @returns CTR (%)
   *
   * @private
   */
  private async getClickThroughRate(
    videoId: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    try {
      const response = await this.analytics.reports.query({
        ids: 'channel==MINE',
        startDate,
        endDate,
        metrics: 'cardClickRate', // 카드 클릭률을 CTR 대용으로 사용
        dimensions: 'video',
        filters: `video==${videoId}`,
      });

      const rows = response.data.rows || [];
      return rows.length > 0 ? Number(rows[0][0]) || 0 : 0;
    } catch (error) {
      this.logger.warn(`Failed to get CTR for ${videoId}, using 0`, error.message);
      return 0;
    }
  }

  /**
   * 검색 유입 키워드 분석
   *
   * YouTube 검색을 통해 유입된 상위 키워드를 분석합니다.
   * 어떤 검색어로 사용자들이 영상을 찾는지 파악하여 SEO 최적화에 활용합니다.
   *
   * @param videoId - YouTube 영상 ID
   * @param maxResults - 최대 결과 개수 (기본: 25)
   * @returns 검색 키워드 배열 (조회수 내림차순)
   *
   * @example
   * ```typescript
   * const keywords = await analyticsService.getSearchTerms('abc123xyz', 10);
   * keywords.forEach(kw => {
   *   console.log(`"${kw.term}": ${kw.views}회 (${kw.percentage}%)`);
   * });
   * ```
   */
  async getSearchTerms(videoId: string, maxResults: number = 25): Promise<SearchTerm[]> {
    try {
      this.logger.log(`Fetching search terms for video: ${videoId}`);

      // 검색 유입 트래픽 조회
      const response = await this.analytics.reports.query({
        ids: 'channel==MINE',
        startDate: '2024-01-01',
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'views',
        dimensions: 'insightTrafficSourceDetail',
        filters: `video==${videoId};insightTrafficSourceType==YT_SEARCH`,
        sort: '-views',
        maxResults,
      });

      const rows = response.data.rows || [];

      // 전체 조회수 (비율 계산용)
      const metrics = await this.getVideoMetrics(videoId);
      const totalViews = metrics.views;

      // 검색 키워드 데이터 변환
      const searchTerms: SearchTerm[] = rows.map((row) => ({
        term: String(row[0]),
        views: Number(row[1]),
        percentage: totalViews > 0 ? (Number(row[1]) / totalViews) * 100 : 0,
      }));

      this.logger.log(`Found ${searchTerms.length} search terms for ${videoId}`);
      return searchTerms;
    } catch (error) {
      this.logger.error(`Failed to get search terms for ${videoId}:`, error.message);
      return [];
    }
  }

  /**
   * 데모그래픽 데이터 분석
   *
   * 시청자의 연령대와 성별 분포를 분석합니다.
   * 타겟 시청자층을 파악하여 콘텐츠 전략을 최적화합니다.
   *
   * @param videoId - YouTube 영상 ID
   * @returns 데모그래픽 데이터 배열
   *
   * @example
   * ```typescript
   * const demographics = await analyticsService.getDemographics('abc123xyz');
   * demographics.forEach(demo => {
   *   console.log(`${demo.ageGroup} ${demo.gender}: ${demo.views}회`);
   * });
   * ```
   */
  async getDemographics(videoId: string): Promise<DemographicData[]> {
    try {
      this.logger.log(`Fetching demographics for video: ${videoId}`);

      const response = await this.analytics.reports.query({
        ids: 'channel==MINE',
        startDate: '2024-01-01',
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'views,estimatedMinutesWatched',
        dimensions: 'ageGroup,gender',
        filters: `video==${videoId}`,
        sort: '-views',
      });

      const rows = response.data.rows || [];

      const demographics: DemographicData[] = rows.map((row) => ({
        ageGroup: String(row[0]),
        gender: String(row[1]),
        views: Number(row[2]),
        watchTimeMinutes: Number(row[3]),
      }));

      this.logger.log(`Found ${demographics.length} demographic segments for ${videoId}`);
      return demographics;
    } catch (error) {
      this.logger.error(`Failed to get demographics for ${videoId}:`, error.message);
      return [];
    }
  }

  /**
   * 트래픽 소스 분석
   *
   * 조회수의 유입 경로를 분석합니다.
   * (검색, 추천, 외부 링크, 재생목록 등)
   *
   * @param videoId - YouTube 영상 ID
   * @returns 트래픽 소스 배열
   *
   * @example
   * ```typescript
   * const sources = await analyticsService.getTrafficSources('abc123xyz');
   * sources.forEach(src => {
   *   console.log(`${src.sourceType}: ${src.views}회 (${src.percentage}%)`);
   * });
   * ```
   */
  async getTrafficSources(videoId: string): Promise<TrafficSource[]> {
    try {
      this.logger.log(`Fetching traffic sources for video: ${videoId}`);

      const response = await this.analytics.reports.query({
        ids: 'channel==MINE',
        startDate: '2024-01-01',
        endDate: new Date().toISOString().split('T')[0],
        metrics: 'views',
        dimensions: 'insightTrafficSourceType',
        filters: `video==${videoId}`,
        sort: '-views',
      });

      const rows = response.data.rows || [];

      // 전체 조회수
      const metrics = await this.getVideoMetrics(videoId);
      const totalViews = metrics.views;

      const trafficSources: TrafficSource[] = rows.map((row) => ({
        sourceType: String(row[0]),
        views: Number(row[1]),
        percentage: totalViews > 0 ? (Number(row[1]) / totalViews) * 100 : 0,
      }));

      this.logger.log(`Found ${trafficSources.length} traffic sources for ${videoId}`);
      return trafficSources;
    } catch (error) {
      this.logger.error(`Failed to get traffic sources for ${videoId}:`, error.message);
      return [];
    }
  }

  /**
   * 종합 분석 리포트 생성 및 저장
   *
   * 영상의 모든 분석 데이터를 수집하여 종합 리포트를 생성하고 JSON 파일로 저장합니다.
   *
   * 저장 경로: `./analytics/report_{videoId}_{date}.json`
   *
   * @param videoId - YouTube 영상 ID
   * @returns 종합 분석 리포트
   *
   * @example
   * ```typescript
   * const report = await analyticsService.generateAnalyticsReport('abc123xyz');
   * // analytics/report_abc123xyz_2024-01-15.json 저장됨
   *
   * console.log(report.videoMetrics.views);
   * console.log(report.searchTerms[0].term);
   * console.log(report.demographics);
   * ```
   */
  async generateAnalyticsReport(videoId: string): Promise<AnalyticsReport> {
    try {
      this.logger.log(`Generating analytics report for video: ${videoId}`);

      // 모든 메트릭 수집 (병렬 처리)
      const [videoMetrics, searchTerms, demographics, trafficSources] = await Promise.all([
        this.getVideoMetrics(videoId),
        this.getSearchTerms(videoId),
        this.getDemographics(videoId),
        this.getTrafficSources(videoId),
      ]);

      // 종합 리포트 생성
      const report: AnalyticsReport = {
        videoMetrics,
        searchTerms,
        demographics,
        trafficSources,
        hourlyViews: [], // 시간대별 데이터는 추가 구현 가능
        generatedAt: new Date().toISOString(),
      };

      // JSON 파일로 저장
      const date = new Date().toISOString().split('T')[0];
      const reportPath = path.join(this.analyticsDir, `report_${videoId}_${date}.json`);
      await fs.writeJson(reportPath, report, { spaces: 2 });

      this.logger.log(`Analytics report saved: ${reportPath}`);
      return report;
    } catch (error) {
      this.logger.error(`Failed to generate analytics report for ${videoId}:`, error.message);
      throw error;
    }
  }

  /**
   * 고성과 영상 식별
   *
   * CTR 또는 시청률이 평균 이상인 영상들을 식별합니다.
   * OptimizationService에서 패턴 학습에 사용됩니다.
   *
   * @param threshold - 성과 기준 배수 (기본: 1.5 = 평균의 150%)
   * @param limit - 최대 결과 개수 (기본: 10)
   * @returns 고성과 영상 메트릭 배열
   *
   * @example
   * ```typescript
   * const topVideos = await analyticsService.getHighPerformingVideos(1.5, 10);
   * topVideos.forEach(video => {
   *   console.log(`${video.title}: CTR ${video.clickThroughRate}%`);
   * });
   * ```
   */
  async getHighPerformingVideos(
    threshold: number = 1.5,
    limit: number = 10,
  ): Promise<VideoMetrics[]> {
    try {
      this.logger.log(`Finding high-performing videos (threshold: ${threshold}x average)`);

      // 채널의 최근 영상 목록 가져오기
      const videosResponse = await this.youtube.search.list({
        part: ['id'],
        forMine: true,
        type: ['video'],
        order: 'date',
        maxResults: 50,
      });

      const videoIds = videosResponse.data.items?.map((item) => item.id?.videoId || '') || [];

      // 각 영상의 메트릭 수집
      const allMetrics = await Promise.all(
        videoIds.map((id) => this.getVideoMetrics(id).catch(() => null)),
      );

      // null 제거
      const validMetrics = allMetrics.filter((m) => m !== null) as VideoMetrics[];

      // 평균 CTR 계산
      const avgCTR =
        validMetrics.reduce((sum, m) => sum + m.clickThroughRate, 0) / validMetrics.length;

      // 고성과 영상 필터링 (CTR > 평균 * threshold)
      const highPerformers = validMetrics
        .filter((m) => m.clickThroughRate >= avgCTR * threshold)
        .sort((a, b) => b.clickThroughRate - a.clickThroughRate)
        .slice(0, limit);

      this.logger.log(`Found ${highPerformers.length} high-performing videos`);
      return highPerformers;
    } catch (error) {
      this.logger.error('Failed to get high-performing videos:', error.message);
      return [];
    }
  }
}
