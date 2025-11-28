import { Controller, Get, Query, Logger } from '@nestjs/common';
import { KeywordAnalysisService, KeywordStat, KeywordStats } from '../services/keyword-analysis.service';

/**
 * 키워드 조회 API 컨트롤러
 *
 * 뉴스 키워드 통계 및 트렌드 정보를 제공합니다.
 */
@Controller('keywords')
export class KeywordsController {
  private readonly logger = new Logger(KeywordsController.name);

  constructor(private readonly keywordAnalysisService: KeywordAnalysisService) {}

  /**
   * 상위 키워드 조회
   *
   * GET /keywords/top?limit=50&days=7
   *
   * @param limit - 반환할 키워드 수 (기본: 50, 최대: 200)
   * @param days - 최근 N일 이내 (선택적, 전체 기간이면 생략)
   * @returns 상위 키워드 배열
   */
  @Get('top')
  getTopKeywords(
    @Query('limit') limit?: string,
    @Query('days') days?: string,
  ): {
    success: boolean;
    data: KeywordStat[];
    params: { limit: number; days?: number };
  } {
    try {
      // 파라미터 파싱 및 유효성 검사
      const parsedLimit = limit ? Math.min(parseInt(limit, 10), 200) : 50;
      const parsedDays = days ? parseInt(days, 10) : undefined;

      // 키워드 조회
      const keywords = this.keywordAnalysisService.getTopKeywords(parsedLimit, parsedDays);

      this.logger.log(
        `Top keywords requested: limit=${parsedLimit}, days=${parsedDays || 'all'}, results=${keywords.length}`,
      );

      return {
        success: true,
        data: keywords,
        params: {
          limit: parsedLimit,
          ...(parsedDays && { days: parsedDays }),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get top keywords:', error.message);
      return {
        success: false,
        data: [],
        params: { limit: 50 },
      };
    }
  }

  /**
   * 트렌딩 키워드 조회
   *
   * GET /keywords/trending?days=7
   *
   * @param days - 비교 기간 (기본: 7일)
   * @returns 트렌딩 키워드 배열
   */
  @Get('trending')
  getTrendingKeywords(
    @Query('days') days?: string,
  ): {
    success: boolean;
    data: KeywordStat[];
    params: { days: number };
  } {
    try {
      const parsedDays = days ? parseInt(days, 10) : 7;

      // 트렌딩 키워드 조회
      const keywords = this.keywordAnalysisService.getTrendingKeywords(parsedDays);

      this.logger.log(`Trending keywords requested: days=${parsedDays}, results=${keywords.length}`);

      return {
        success: true,
        data: keywords,
        params: { days: parsedDays },
      };
    } catch (error) {
      this.logger.error('Failed to get trending keywords:', error.message);
      return {
        success: false,
        data: [],
        params: { days: 7 },
      };
    }
  }

  /**
   * 전체 키워드 통계 조회
   *
   * GET /keywords/stats
   *
   * @returns 전체 통계 정보
   */
  @Get('stats')
  getStats(): {
    success: boolean;
    data: {
      lastUpdated: Date;
      totalArticles: number;
      totalKeywords: number;
      topKeywords: KeywordStat[];
      recentDays: {
        date: string;
        articleCount: number;
        topKeywords: string[];
      }[];
    };
  } {
    try {
      const stats: KeywordStats = this.keywordAnalysisService.getStats();

      // 최근 7일 통계 추출
      const recentDays = Object.entries(stats.dailyStats)
        .sort((a, b) => b[0].localeCompare(a[0])) // 날짜 내림차순
        .slice(0, 7)
        .map(([date, stat]) => ({
          date,
          articleCount: stat.articleCount,
          topKeywords: stat.topKeywords,
        }));

      this.logger.log('Keyword stats requested');

      return {
        success: true,
        data: {
          lastUpdated: stats.lastUpdated,
          totalArticles: stats.totalArticles,
          totalKeywords: stats.keywords.length,
          topKeywords: stats.keywords.slice(0, 10), // 상위 10개
          recentDays,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get keyword stats:', error.message);
      return {
        success: false,
        data: {
          lastUpdated: new Date(),
          totalArticles: 0,
          totalKeywords: 0,
          topKeywords: [],
          recentDays: [],
        },
      };
    }
  }

  /**
   * 특정 키워드 검색
   *
   * GET /keywords/search?q=국회
   *
   * @param query - 검색할 키워드
   * @returns 검색 결과
   */
  @Get('search')
  searchKeyword(
    @Query('q') query: string,
  ): {
    success: boolean;
    data: KeywordStat | null;
    query: string;
  } {
    try {
      if (!query || query.trim().length === 0) {
        return {
          success: false,
          data: null,
          query: '',
        };
      }

      const stats = this.keywordAnalysisService.getStats();
      const keyword = stats.keywords.find((k) => k.word === query.trim());

      this.logger.log(`Keyword search: q=${query}, found=${!!keyword}`);

      return {
        success: true,
        data: keyword || null,
        query: query.trim(),
      };
    } catch (error) {
      this.logger.error('Failed to search keyword:', error.message);
      return {
        success: false,
        data: null,
        query: query || '',
      };
    }
  }
}
