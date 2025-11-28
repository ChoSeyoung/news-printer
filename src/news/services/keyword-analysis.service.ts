import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';
import { KoreanTextAnalyzer } from '../../common/utils/korean-text-analyzer.util';

/**
 * 키워드 통계 정보
 */
export interface KeywordStat {
  /** 키워드 */
  word: string;
  /** 전체 출현 횟수 */
  count: number;
  /** 등장한 기사 수 */
  articleCount: number;
  /** 최근 기사 URL 목록 (최대 10개) */
  articles: string[];
  /** 첫 등장 시각 */
  firstSeen: Date;
  /** 마지막 등장 시각 */
  lastSeen: Date;
}

/**
 * 일별 통계
 */
export interface DailyStat {
  /** 기사 수 */
  articleCount: number;
  /** 상위 키워드 (최대 10개) */
  topKeywords: string[];
}

/**
 * 전체 키워드 통계
 */
export interface KeywordStats {
  /** 마지막 업데이트 시각 */
  lastUpdated: Date;
  /** 전체 분석된 기사 수 */
  totalArticles: number;
  /** 키워드 통계 배열 */
  keywords: KeywordStat[];
  /** 일별 통계 */
  dailyStats: Record<string, DailyStat>;
}

/**
 * 키워드 분석 서비스
 *
 * 뉴스 기사에서 키워드를 추출하고 통계를 관리합니다.
 * JSON 파일 기반으로 키워드 빈도, 등장 기사, 트렌드 등을 추적합니다.
 */
@Injectable()
export class KeywordAnalysisService {
  private readonly logger = new Logger(KeywordAnalysisService.name);
  private readonly statsFilePath: string;
  private stats: KeywordStats;

  constructor() {
    this.statsFilePath = path.join(process.cwd(), 'temp', 'keyword-stats.json');
    this.loadStats();
  }

  /**
   * 통계 파일 로드
   */
  private async loadStats(): Promise<void> {
    try {
      if (await fs.pathExists(this.statsFilePath)) {
        const data = await fs.readJson(this.statsFilePath);
        this.stats = {
          ...data,
          lastUpdated: new Date(data.lastUpdated),
          keywords: data.keywords.map((k: any) => ({
            ...k,
            firstSeen: new Date(k.firstSeen),
            lastSeen: new Date(k.lastSeen),
          })),
        };
        this.logger.log(
          `Loaded keyword stats: ${this.stats.keywords.length} keywords, ${this.stats.totalArticles} articles`,
        );
      } else {
        // 초기 데이터 구조
        this.stats = {
          lastUpdated: new Date(),
          totalArticles: 0,
          keywords: [],
          dailyStats: {},
        };
        await this.saveStats();
        this.logger.log('Initialized new keyword stats file');
      }
    } catch (error) {
      this.logger.error('Failed to load keyword stats:', error.message);
      // 에러 시 초기 상태로
      this.stats = {
        lastUpdated: new Date(),
        totalArticles: 0,
        keywords: [],
        dailyStats: {},
      };
    }
  }

  /**
   * 통계 파일 저장
   */
  private async saveStats(): Promise<void> {
    try {
      // temp 디렉토리 확인
      const tempDir = path.dirname(this.statsFilePath);
      await fs.ensureDir(tempDir);

      await fs.writeJson(this.statsFilePath, this.stats, { spaces: 2 });
      this.logger.debug('Keyword stats saved');
    } catch (error) {
      this.logger.error('Failed to save keyword stats:', error.message);
    }
  }

  /**
   * 기사 분석 및 키워드 통계 업데이트
   *
   * @param articleUrl - 기사 URL
   * @param content - 기사 본문
   */
  async updateKeywordStats(articleUrl: string, content: string): Promise<void> {
    try {
      // 1. 키워드 추출
      const keywords = KoreanTextAnalyzer.extractKeywords(content);

      if (keywords.length === 0) {
        this.logger.debug(`No keywords extracted from: ${articleUrl}`);
        return;
      }

      // 2. 키워드 통계 업데이트
      const now = new Date();
      const today = this.getDateKey(now);

      // 키워드 맵 생성 (빠른 조회용)
      const keywordMap = new Map<string, KeywordStat>();
      this.stats.keywords.forEach((k) => keywordMap.set(k.word, k));

      // 각 키워드 처리
      for (const word of keywords) {
        let stat = keywordMap.get(word);

        if (stat) {
          // 기존 키워드 업데이트
          stat.count++;
          stat.lastSeen = now;

          // 중복 URL 방지
          if (!stat.articles.includes(articleUrl)) {
            stat.articleCount++;
            stat.articles.unshift(articleUrl); // 최신 기사를 앞에 추가
            // 최대 10개까지만 유지
            if (stat.articles.length > 10) {
              stat.articles = stat.articles.slice(0, 10);
            }
          }
        } else {
          // 새 키워드 추가
          stat = {
            word,
            count: 1,
            articleCount: 1,
            articles: [articleUrl],
            firstSeen: now,
            lastSeen: now,
          };
          keywordMap.set(word, stat);
        }
      }

      // 3. 맵을 배열로 변환 및 정렬
      this.stats.keywords = Array.from(keywordMap.values()).sort((a, b) => b.count - a.count);

      // 4. 일별 통계 업데이트
      if (!this.stats.dailyStats[today]) {
        this.stats.dailyStats[today] = {
          articleCount: 0,
          topKeywords: [],
        };
      }
      this.stats.dailyStats[today].articleCount++;

      // 오늘의 상위 키워드 (최대 10개)
      const todayKeywords = Array.from(keywordMap.values())
        .filter((k) => this.getDateKey(k.lastSeen) === today)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((k) => k.word);
      this.stats.dailyStats[today].topKeywords = todayKeywords;

      // 5. 전체 통계 업데이트
      this.stats.totalArticles++;
      this.stats.lastUpdated = now;

      // 6. 저장
      await this.saveStats();

      this.logger.debug(
        `Updated keyword stats for: ${articleUrl} (${keywords.length} unique keywords)`,
      );
    } catch (error) {
      this.logger.error(`Failed to update keyword stats for ${articleUrl}:`, error.message);
    }
  }

  /**
   * 상위 키워드 조회
   *
   * @param limit - 반환할 키워드 수 (기본: 50)
   * @param days - 최근 N일 이내 (선택적, 전체 기간이면 생략)
   * @returns 상위 키워드 배열
   */
  getTopKeywords(limit: number = 50, days?: number): KeywordStat[] {
    let keywords = this.stats.keywords;

    // 기간 필터링
    if (days) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      keywords = keywords.filter((k) => k.lastSeen >= cutoffDate);
    }

    // 상위 N개 반환
    return keywords.slice(0, limit);
  }

  /**
   * 트렌딩 키워드 조회
   * 최근 증가 추세의 키워드 반환
   *
   * @param days - 비교 기간 (기본: 7일)
   * @returns 트렌딩 키워드 배열
   */
  getTrendingKeywords(days: number = 7): KeywordStat[] {
    const now = new Date();
    const recentDate = new Date(now);
    recentDate.setDate(recentDate.getDate() - days);

    // 최근 기간의 키워드만 필터링
    const recentKeywords = this.stats.keywords.filter((k) => k.lastSeen >= recentDate);

    // 최근 기간 내 등장 빈도로 정렬
    return recentKeywords.sort((a, b) => {
      // 최근 등장한 키워드 우선
      const aRecency = now.getTime() - a.lastSeen.getTime();
      const bRecency = now.getTime() - b.lastSeen.getTime();

      // 빈도 * (1 / 최근성) 점수
      const aScore = a.count / (aRecency / (1000 * 60 * 60 * 24) + 1);
      const bScore = b.count / (bRecency / (1000 * 60 * 60 * 24) + 1);

      return bScore - aScore;
    });
  }

  /**
   * 전체 통계 조회
   *
   * @returns 키워드 통계
   */
  getStats(): KeywordStats {
    return this.stats;
  }

  /**
   * 오래된 통계 정리
   *
   * @param daysToKeep - 유지할 일수 (기본: 30일)
   */
  async cleanupOldStats(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // 오래된 키워드 제거
      const beforeCount = this.stats.keywords.length;
      this.stats.keywords = this.stats.keywords.filter((k) => k.lastSeen >= cutoffDate);
      const afterCount = this.stats.keywords.length;

      // 오래된 일별 통계 제거
      const cutoffDateKey = this.getDateKey(cutoffDate);
      const dailyKeys = Object.keys(this.stats.dailyStats);
      for (const dateKey of dailyKeys) {
        if (dateKey < cutoffDateKey) {
          delete this.stats.dailyStats[dateKey];
        }
      }

      await this.saveStats();

      this.logger.log(
        `Cleaned up old keyword stats: ${beforeCount - afterCount} keywords removed`,
      );
    } catch (error) {
      this.logger.error('Failed to cleanup old stats:', error.message);
    }
  }

  /**
   * 날짜를 YYYY-MM-DD 형식 문자열로 변환
   */
  private getDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
