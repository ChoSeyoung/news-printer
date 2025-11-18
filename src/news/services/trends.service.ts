import { Injectable, Logger } from '@nestjs/common';
import * as googleTrends from 'google-trends-api';

/**
 * 트렌딩 키워드 정보
 */
export interface TrendingKeyword {
  /** 키워드 */
  keyword: string;

  /** 트렌드 점수 (0-100) */
  trendScore: number;

  /** 관련 검색어 */
  relatedQueries?: string[];
}

/**
 * Google Trends API 서비스
 *
 * 핵심 기능:
 * - 한국 실시간 트렌딩 키워드 조회
 * - 뉴스 키워드와 트렌드 매칭
 * - 트렌드 점수 계산 (조회수, 상승률 기반)
 *
 * 전략:
 * - 실시간 트렌딩 키워드로 SEO 최적화
 * - 높은 관심도 키워드 우선 콘텐츠 제작
 * - 검색 유입 극대화
 */
@Injectable()
export class TrendsService {
  private readonly logger = new Logger(TrendsService.name);

  // 트렌딩 키워드 캐시 (30분 갱신)
  private trendingCache: TrendingKeyword[] = [];
  private lastCacheUpdate: Date | null = null;
  private readonly CACHE_DURATION_MS = 30 * 60 * 1000; // 30분

  /**
   * 한국 실시간 트렌딩 키워드 조회
   *
   * @param count 조회할 키워드 개수 (기본 10개)
   * @returns 트렌딩 키워드 배열
   */
  async getTrendingKeywords(count: number = 10): Promise<TrendingKeyword[]> {
    try {
      // 캐시 확인
      if (this.isCacheValid()) {
        this.logger.debug(`Returning cached trending keywords (${this.trendingCache.length})`);
        return this.trendingCache.slice(0, count);
      }

      this.logger.log('Fetching real-time trending keywords from Google Trends');

      // Google Trends 실시간 트렌딩 검색 (한국)
      const results = await googleTrends.realTimeTrends({
        geo: 'KR', // 대한민국
        category: 'all', // 모든 카테고리
      });

      const parsedResults = JSON.parse(results);
      const trendingSearches = parsedResults?.storySummaries?.trendingStories || [];

      this.logger.debug(`Found ${trendingSearches.length} trending stories`);

      // 트렌딩 키워드 추출 및 정규화
      const keywords: TrendingKeyword[] = [];

      for (const story of trendingSearches.slice(0, count)) {
        const title = story.entityNames?.[0] || story.articles?.[0]?.articleTitle || '';

        if (title) {
          const keyword: TrendingKeyword = {
            keyword: title,
            trendScore: this.calculateTrendScore(story),
            relatedQueries: story.entityNames?.slice(1, 4) || [],
          };

          keywords.push(keyword);
        }
      }

      // 트렌드 점수로 정렬
      keywords.sort((a, b) => b.trendScore - a.trendScore);

      // 캐시 업데이트
      this.trendingCache = keywords;
      this.lastCacheUpdate = new Date();

      this.logger.log(`Retrieved ${keywords.length} trending keywords`);
      return keywords;
    } catch (error) {
      this.logger.error('Failed to fetch trending keywords:', error.message);

      // 캐시가 있으면 캐시 반환 (오래되어도)
      if (this.trendingCache.length > 0) {
        this.logger.warn('Returning stale cache due to API error');
        return this.trendingCache.slice(0, count);
      }

      return [];
    }
  }

  /**
   * 특정 키워드의 트렌드 관심도 조회
   *
   * @param keyword 조회할 키워드
   * @returns 트렌드 점수 (0-100)
   */
  async getKeywordInterest(keyword: string): Promise<number> {
    try {
      this.logger.debug(`Getting interest for keyword: ${keyword}`);

      // 최근 7일간 관심도 조회
      const results = await googleTrends.interestOverTime({
        keyword: keyword,
        geo: 'KR',
        startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7일 전
        endTime: new Date(),
      });

      const parsedResults = JSON.parse(results);
      const timelineData = parsedResults?.default?.timelineData || [];

      if (timelineData.length === 0) {
        return 0;
      }

      // 최근 데이터 포인트의 평균 값 계산
      const recentValues = timelineData
        .slice(-3) // 최근 3개 데이터 포인트
        .map((point: any) => parseInt(point.value?.[0] || '0', 10));

      const avgInterest = recentValues.reduce((sum: number, val: number) => sum + val, 0) / recentValues.length;

      this.logger.debug(`Keyword "${keyword}" interest: ${avgInterest}`);
      return Math.round(avgInterest);
    } catch (error) {
      this.logger.error(`Failed to get interest for keyword "${keyword}":`, error.message);
      return 0;
    }
  }

  /**
   * 뉴스 제목/내용과 트렌딩 키워드 매칭
   *
   * @param text 뉴스 제목 또는 내용
   * @param trendingKeywords 트렌딩 키워드 목록
   * @returns 매칭된 키워드 배열 (점수순)
   */
  matchTrendingKeywords(
    text: string,
    trendingKeywords: TrendingKeyword[],
  ): TrendingKeyword[] {
    const matched: TrendingKeyword[] = [];

    for (const trend of trendingKeywords) {
      // 키워드가 텍스트에 포함되어 있는지 확인
      if (text.includes(trend.keyword)) {
        matched.push(trend);
        continue;
      }

      // 관련 검색어 확인
      if (trend.relatedQueries) {
        const hasRelated = trend.relatedQueries.some((query) =>
          text.includes(query),
        );
        if (hasRelated) {
          matched.push(trend);
        }
      }
    }

    // 트렌드 점수로 정렬
    matched.sort((a, b) => b.trendScore - a.trendScore);

    return matched;
  }

  /**
   * 트렌드 점수 계산
   *
   * 점수 기준:
   * - 뉴스 기사 수 (많을수록 높음)
   * - 트래픽 수준 (높을수록 높음)
   *
   * @param story Google Trends 스토리 객체
   * @returns 0-100 사이 점수
   */
  private calculateTrendScore(story: any): number {
    let score = 50; // 기본 점수

    // 뉴스 기사 수에 따른 점수
    const articleCount = story.articles?.length || 0;
    if (articleCount > 20) score += 30;
    else if (articleCount > 10) score += 20;
    else if (articleCount > 5) score += 10;

    // 트래픽 수준에 따른 점수
    const traffic = story.idsForDedup?.length || 0;
    if (traffic > 100) score += 20;
    else if (traffic > 50) score += 10;

    // 0-100 범위로 제한
    return Math.min(100, Math.max(0, score));
  }

  /**
   * 캐시가 유효한지 확인
   */
  private isCacheValid(): boolean {
    if (!this.lastCacheUpdate || this.trendingCache.length === 0) {
      return false;
    }

    const elapsed = Date.now() - this.lastCacheUpdate.getTime();
    return elapsed < this.CACHE_DURATION_MS;
  }

  /**
   * 캐시 강제 갱신
   */
  async refreshCache(): Promise<void> {
    this.logger.log('Manually refreshing trending keywords cache');
    this.lastCacheUpdate = null;
    await this.getTrendingKeywords();
  }

  /**
   * 카테고리별 트렌딩 키워드 조회
   *
   * @param category 카테고리 ('all', 'h', 'b', 'm', 't', 'e', 's')
   * @param count 조회할 개수
   * @returns 트렌딩 키워드 배열
   */
  async getTrendingByCategory(
    category: string = 'all',
    count: number = 10,
  ): Promise<TrendingKeyword[]> {
    try {
      this.logger.log(`Fetching trending keywords for category: ${category}`);

      const results = await googleTrends.realTimeTrends({
        geo: 'KR',
        category: category,
      });

      const parsedResults = JSON.parse(results);
      const trendingSearches = parsedResults?.storySummaries?.trendingStories || [];

      const keywords: TrendingKeyword[] = [];

      for (const story of trendingSearches.slice(0, count)) {
        const title = story.entityNames?.[0] || story.articles?.[0]?.articleTitle || '';

        if (title) {
          keywords.push({
            keyword: title,
            trendScore: this.calculateTrendScore(story),
            relatedQueries: story.entityNames?.slice(1, 4) || [],
          });
        }
      }

      keywords.sort((a, b) => b.trendScore - a.trendScore);

      this.logger.log(`Retrieved ${keywords.length} trending keywords for category ${category}`);
      return keywords;
    } catch (error) {
      this.logger.error(`Failed to fetch trending by category ${category}:`, error.message);
      return [];
    }
  }
}
