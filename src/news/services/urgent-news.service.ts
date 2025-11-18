import { Injectable, Logger } from '@nestjs/common';
import { TrendsService } from './trends.service';
import { NewsItemDto } from '../dto/news-item.dto';

/**
 * 긴급 뉴스 감지 결과
 */
export interface UrgentNewsDetection {
  /** 긴급 뉴스 여부 */
  isUrgent: boolean;

  /** 긴급도 점수 (0-100) */
  urgencyScore: number;

  /** 긴급 뉴스 이유 */
  reasons: string[];

  /** 매칭된 트렌딩 키워드 */
  trendingKeywords: string[];
}

/**
 * 긴급 뉴스 자동 감지 서비스
 *
 * 핵심 기능:
 * - Google Trends 실시간 트렌드 키워드 매칭
 * - 속보/긴급 키워드 패턴 감지
 * - 긴급도 점수 계산 (트렌드 + 키워드 + 시간)
 * - 자동 업로드 트리거 판단
 *
 * 전략:
 * - 트렌딩 뉴스 실시간 감지로 조회수 극대화
 * - 긴급 뉴스 빠른 업로드로 경쟁 우위 확보
 * - 알고리즘 노출 증대 (트렌드 + 신속성)
 */
@Injectable()
export class UrgentNewsService {
  private readonly logger = new Logger(UrgentNewsService.name);

  // 긴급 뉴스 키워드 패턴
  private readonly URGENT_KEYWORDS = [
    '속보',
    '긴급',
    '돌발',
    '발표',
    '확정',
    '첫',
    '최초',
    '사상 처음',
    '단독',
    '전격',
    '전면',
    '전국',
    '대규모',
    '충격',
    '파문',
    '논란',
    '비상',
  ];

  // 긴급도 임계값 (75점 이상 = 자동 업로드)
  private readonly URGENCY_THRESHOLD = 75;

  constructor(private readonly trendsService: TrendsService) {}

  /**
   * 뉴스의 긴급성 감지
   *
   * @param news 뉴스 아이템
   * @returns 긴급 뉴스 감지 결과
   */
  async detectUrgency(news: NewsItemDto): Promise<UrgentNewsDetection> {
    try {
      this.logger.debug(`Detecting urgency for: ${news.title}`);

      const reasons: string[] = [];
      let urgencyScore = 0;

      // 1️⃣ 트렌딩 키워드 매칭 (40점)
      const trendingKeywords = await this.trendsService.getTrendingKeywords(20);
      const matchedTrends = this.trendsService.matchTrendingKeywords(
        `${news.title} ${news.description}`,
        trendingKeywords,
      );

      if (matchedTrends.length > 0) {
        const trendScore = Math.min(40, matchedTrends.length * 10);
        urgencyScore += trendScore;
        reasons.push(`트렌딩 키워드 매칭 (${matchedTrends.length}개)`);

        // 매칭된 키워드의 트렌드 점수 반영
        const avgTrendScore =
          matchedTrends.reduce((sum, t) => sum + t.trendScore, 0) /
          matchedTrends.length;
        if (avgTrendScore > 80) {
          urgencyScore += 10;
          reasons.push('고관심 트렌드 (80점 이상)');
        }
      }

      // 2️⃣ 긴급 키워드 패턴 감지 (30점)
      const urgentKeywordCount = this.countUrgentKeywords(
        `${news.title} ${news.description}`,
      );
      if (urgentKeywordCount > 0) {
        const keywordScore = Math.min(30, urgentKeywordCount * 15);
        urgencyScore += keywordScore;
        reasons.push(`긴급 키워드 ${urgentKeywordCount}개 감지`);
      }

      // 3️⃣ 시간 민감도 (20점) - 최근 뉴스일수록 높음
      const timeSensitivity = this.calculateTimeSensitivity(news.pubDate);
      urgencyScore += timeSensitivity;
      if (timeSensitivity > 10) {
        reasons.push('최근 발행 뉴스 (1시간 이내)');
      }

      // 4️⃣ 이미지 풍부도 (10점) - 이미지 많을수록 영상 품질 높음
      if (news.imageUrls && news.imageUrls.length >= 3) {
        urgencyScore += 10;
        reasons.push(`이미지 ${news.imageUrls.length}개 포함`);
      }

      // 긴급 뉴스 판정
      const isUrgent = urgencyScore >= this.URGENCY_THRESHOLD;

      this.logger.log(
        `Urgency detection: ${news.title} - Score: ${urgencyScore} (${isUrgent ? 'URGENT' : 'NORMAL'})`,
      );

      return {
        isUrgent,
        urgencyScore,
        reasons,
        trendingKeywords: matchedTrends.map((t) => t.keyword),
      };
    } catch (error) {
      this.logger.error('Failed to detect urgency:', error.message);
      return {
        isUrgent: false,
        urgencyScore: 0,
        reasons: [],
        trendingKeywords: [],
      };
    }
  }

  /**
   * 긴급 뉴스 목록 필터링
   *
   * @param newsList 뉴스 목록
   * @param threshold 긴급도 임계값 (기본 75점)
   * @returns 긴급 뉴스 목록 (긴급도 순 정렬)
   */
  async filterUrgentNews(
    newsList: NewsItemDto[],
    threshold: number = this.URGENCY_THRESHOLD,
  ): Promise<Array<NewsItemDto & { urgencyScore: number }>> {
    const urgentNews: Array<NewsItemDto & { urgencyScore: number }> = [];

    for (const news of newsList) {
      const detection = await this.detectUrgency(news);

      if (detection.isUrgent && detection.urgencyScore >= threshold) {
        urgentNews.push({
          ...news,
          urgencyScore: detection.urgencyScore,
        });
      }
    }

    // 긴급도 순으로 정렬 (높은 순)
    urgentNews.sort((a, b) => b.urgencyScore - a.urgencyScore);

    this.logger.log(
      `Filtered ${urgentNews.length} urgent news from ${newsList.length} total`,
    );

    return urgentNews;
  }

  /**
   * 자동 업로드 여부 판단
   *
   * @param urgencyScore 긴급도 점수
   * @returns 자동 업로드 여부
   */
  shouldAutoUpload(urgencyScore: number): boolean {
    return urgencyScore >= this.URGENCY_THRESHOLD;
  }

  /**
   * 긴급 키워드 개수 세기
   */
  private countUrgentKeywords(text: string): number {
    let count = 0;
    for (const keyword of this.URGENT_KEYWORDS) {
      if (text.includes(keyword)) {
        count++;
      }
    }
    return count;
  }

  /**
   * 시간 민감도 계산
   *
   * 점수 기준:
   * - 1시간 이내: 20점
   * - 3시간 이내: 15점
   * - 6시간 이내: 10점
   * - 12시간 이내: 5점
   * - 그 이상: 0점
   *
   * @param pubDate 발행 날짜
   * @returns 시간 민감도 점수 (0-20)
   */
  private calculateTimeSensitivity(pubDate?: string): number {
    if (!pubDate) {
      return 0;
    }

    try {
      const publishedTime = new Date(pubDate).getTime();
      const now = Date.now();
      const hoursDiff = (now - publishedTime) / (1000 * 60 * 60);

      if (hoursDiff < 1) return 20; // 1시간 이내
      if (hoursDiff < 3) return 15; // 3시간 이내
      if (hoursDiff < 6) return 10; // 6시간 이내
      if (hoursDiff < 12) return 5; // 12시간 이내

      return 0; // 12시간 이상
    } catch (error) {
      this.logger.warn('Failed to parse pubDate:', error.message);
      return 0;
    }
  }

  /**
   * 긴급 뉴스 통계
   *
   * @param newsList 뉴스 목록
   * @returns 긴급 뉴스 통계 정보
   */
  async getUrgentNewsStats(
    newsList: NewsItemDto[],
  ): Promise<{
    total: number;
    urgent: number;
    urgencyRate: number;
    avgUrgencyScore: number;
  }> {
    const urgentNews = await this.filterUrgentNews(newsList);

    const avgUrgencyScore =
      urgentNews.length > 0
        ? urgentNews.reduce((sum, n) => sum + n.urgencyScore, 0) /
          urgentNews.length
        : 0;

    return {
      total: newsList.length,
      urgent: urgentNews.length,
      urgencyRate: (urgentNews.length / newsList.length) * 100,
      avgUrgencyScore: Math.round(avgUrgencyScore),
    };
  }
}
