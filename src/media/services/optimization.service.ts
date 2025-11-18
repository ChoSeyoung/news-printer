import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnalyticsService, VideoMetrics } from './analytics.service';
import { CategoryOptimizationService } from './category-optimization.service';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 최적화 패턴 인터페이스
 */
export interface OptimizationPattern {
  /** 패턴 ID */
  id: string;
  /** 카테고리 */
  category: string;
  /** 성과 메트릭 */
  performance: {
    avgCtr: number;
    avgViewDuration: number;
    avgViews: number;
  };
  /** 공통 특성 */
  commonFeatures: {
    titleKeywords: string[];
    hookKeywords: string[];
    thumbnailStyle: string;
    videoLength: number;
  };
  /** 학습된 시간 */
  learnedAt: Date;
  /** 샘플 수 */
  sampleCount: number;
}

/**
 * 최적화 제안 인터페이스
 */
export interface OptimizationSuggestion {
  /** 제안 타입 */
  type: 'prompt' | 'thumbnail' | 'category' | 'seo';
  /** 우선순위 (1-5) */
  priority: number;
  /** 제안 내용 */
  suggestion: string;
  /** 예상 효과 */
  expectedImpact: string;
  /** 근거 데이터 */
  evidence: any;
}

/**
 * 성과 기반 자동 최적화 서비스
 *
 * YouTube Analytics 데이터를 분석하여 고성과 영상의 패턴을 학습하고,
 * 이를 바탕으로 프롬프트, 썸네일 전략, 카테고리 설정 등을 자동으로 최적화합니다.
 *
 * 주요 기능:
 * 1. **패턴 학습**: 고성과 영상의 공통점 분석
 * 2. **자동 최적화**: 학습된 패턴을 바탕으로 전략 조정
 * 3. **A/B 테스팅**: 다양한 전략의 효과 비교
 * 4. **주간 리포트**: 자동화된 성과 분석 및 제안
 *
 * Cron 스케줄:
 * - 매주 월요일 오전 2시: 주간 최적화 분석 및 적용
 * - 매일 오전 3시: 일간 성과 데이터 수집
 *
 * 학습 알고리즘:
 * - CTR 상위 20% 영상 분석
 * - 시청 시간 상위 20% 영상 분석
 * - 카테고리별 베스트 프랙티스 추출
 * - 트렌드 키워드 자동 감지
 *
 * @example
 * ```typescript
 * const suggestions = await optimizationService.generateOptimizationSuggestions();
 * await optimizationService.applyOptimizations(suggestions);
 * ```
 */
@Injectable()
export class OptimizationService {
  private readonly logger = new Logger(OptimizationService.name);
  private readonly dataDir = './optimization-data';
  private readonly patternsFile = path.join(this.dataDir, 'patterns.json');
  private readonly historyFile = path.join(this.dataDir, 'history.json');

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly categoryService: CategoryOptimizationService,
  ) {
    fs.ensureDirSync(this.dataDir);
  }

  /**
   * 매주 월요일 오전 2시 - 주간 최적화 분석 및 적용
   *
   * Cron 표현식: '0 2 * * 1' (매주 월요일 02:00)
   */
  @Cron('0 2 * * 1')
  async weeklyOptimization() {
    try {
      this.logger.log('Starting weekly optimization analysis...');

      // 1단계: 고성과 영상 데이터 수집
      const highPerformers =
        await this.analyticsService.getHighPerformingVideos(1.5, 20);

      if (highPerformers.length === 0) {
        this.logger.warn('No high-performing videos found for optimization');
        return;
      }

      // 2단계: 패턴 학습
      const patterns = await this.learnPatternsFromVideos(highPerformers);

      // 3단계: 최적화 제안 생성
      const suggestions = await this.generateOptimizationSuggestions();

      // 4단계: 자동 적용 (우선순위 4 이상만)
      const autoApplySuggestions = suggestions.filter((s) => s.priority >= 4);
      await this.applyOptimizations(autoApplySuggestions);

      // 5단계: 리포트 저장
      await this.saveWeeklyReport({
        timestamp: new Date(),
        highPerformersCount: highPerformers.length,
        patternsLearned: patterns.length,
        suggestionsGenerated: suggestions.length,
        autoApplied: autoApplySuggestions.length,
        patterns,
        suggestions,
      });

      this.logger.log(
        `Weekly optimization complete: ${autoApplySuggestions.length} optimizations applied`,
      );
    } catch (error) {
      this.logger.error('Weekly optimization failed:', error.message);
    }
  }

  /**
   * 매일 오전 3시 - 일간 성과 데이터 수집
   *
   * Cron 표현식: '0 3 * * *' (매일 03:00)
   */
  @Cron('0 3 * * *')
  async dailyDataCollection() {
    try {
      this.logger.log('Starting daily performance data collection...');

      const highPerformers =
        await this.analyticsService.getHighPerformingVideos(1.2, 50);

      // 성과 데이터 저장
      const dataFile = path.join(
        this.dataDir,
        `daily_${new Date().toISOString().split('T')[0]}.json`,
      );

      await fs.writeJson(dataFile, {
        timestamp: new Date(),
        videoCount: highPerformers.length,
        videos: highPerformers,
      });

      this.logger.log(
        `Daily data collection complete: ${highPerformers.length} videos tracked`,
      );
    } catch (error) {
      this.logger.error('Daily data collection failed:', error.message);
    }
  }

  /**
   * 고성과 영상에서 패턴 학습
   *
   * 카테고리별로 고성과 영상의 공통점을 분석하여 패턴을 추출합니다.
   *
   * @param videos - 고성과 영상 배열
   * @returns 학습된 패턴 배열
   *
   * @private
   */
  private async learnPatternsFromVideos(
    videos: VideoMetrics[],
  ): Promise<OptimizationPattern[]> {
    const patterns: OptimizationPattern[] = [];

    // 카테고리별로 그룹화
    const categorizedVideos = new Map<string, VideoMetrics[]>();

    for (const video of videos) {
      // 카테고리 감지 (제목 기반)
      const category = this.categoryService.detectCategory(
        video.title || 'Unknown',
      );

      if (!categorizedVideos.has(category)) {
        categorizedVideos.set(category, []);
      }

      categorizedVideos.get(category)!.push(video);
    }

    // 카테고리별 패턴 추출
    for (const [category, categoryVideos] of categorizedVideos.entries()) {
      if (categoryVideos.length < 3) {
        // 최소 3개 이상의 샘플 필요
        continue;
      }

      // 평균 성과 계산
      const avgCtr =
        categoryVideos.reduce((sum, v) => sum + (v.clickThroughRate || 0), 0) /
        categoryVideos.length;
      const avgViewDuration =
        categoryVideos.reduce(
          (sum, v) => sum + (v.averageViewDuration || 0),
          0,
        ) / categoryVideos.length;
      const avgViews =
        categoryVideos.reduce((sum, v) => sum + (v.views || 0), 0) /
        categoryVideos.length;

      // 공통 키워드 추출 (제목에서)
      const titleKeywords = this.extractCommonKeywords(
        categoryVideos.map((v) => v.title || ''),
      );

      // 평균 영상 길이
      const avgLength =
        categoryVideos.reduce(
          (sum, v) => sum + (v.averageViewDuration || 0),
          0,
        ) / categoryVideos.length;

      patterns.push({
        id: `pattern_${category}_${Date.now()}`,
        category,
        performance: {
          avgCtr,
          avgViewDuration,
          avgViews,
        },
        commonFeatures: {
          titleKeywords,
          hookKeywords: [], // 추후 확장 가능
          thumbnailStyle: this.categoryService.getThumbnailEmphasisType(
            category,
          ),
          videoLength: Math.round(avgLength),
        },
        learnedAt: new Date(),
        sampleCount: categoryVideos.length,
      });
    }

    // 패턴 저장
    await this.savePatterns(patterns);

    this.logger.log(`Learned ${patterns.length} optimization patterns`);
    return patterns;
  }

  /**
   * 제목/내용에서 공통 키워드 추출
   *
   * @param texts - 텍스트 배열
   * @param minFrequency - 최소 출현 빈도 (기본: 0.3, 30%)
   * @returns 공통 키워드 배열
   *
   * @private
   */
  private extractCommonKeywords(
    texts: string[],
    minFrequency = 0.3,
  ): string[] {
    const wordCount = new Map<string, number>();
    const totalTexts = texts.length;

    // 단어 빈도 계산
    for (const text of texts) {
      const words = text
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1);

      const uniqueWords = new Set(words);

      for (const word of uniqueWords) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    }

    // 최소 빈도 이상인 키워드 필터링
    const commonKeywords: string[] = [];

    for (const [word, count] of wordCount.entries()) {
      if (count / totalTexts >= minFrequency) {
        commonKeywords.push(word);
      }
    }

    return commonKeywords.slice(0, 10); // 상위 10개 키워드
  }

  /**
   * 최적화 제안 생성
   *
   * 학습된 패턴을 바탕으로 구체적인 최적화 제안을 생성합니다.
   *
   * @returns 최적화 제안 배열
   *
   * @example
   * ```typescript
   * const suggestions = await optimizationService.generateOptimizationSuggestions();
   * console.log(suggestions[0].suggestion);
   * // "기술 카테고리에서 '혁신', 'AI' 키워드 사용 시 CTR 35% 증가"
   * ```
   */
  async generateOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // 학습된 패턴 로드
    const patterns = await this.loadPatterns();

    if (patterns.length === 0) {
      this.logger.warn('No patterns found for generating suggestions');
      return suggestions;
    }

    // 카테고리별 제안 생성
    for (const pattern of patterns) {
      const strategy = this.categoryService.getStrategy(pattern.category);

      // 1. 프롬프트 최적화 제안
      if (pattern.commonFeatures.titleKeywords.length > 0) {
        suggestions.push({
          type: 'prompt',
          priority: 5,
          suggestion: `${strategy.name} 카테고리에서 "${pattern.commonFeatures.titleKeywords.join(', ')}" 키워드 사용 시 평균 CTR ${(pattern.performance.avgCtr * 100).toFixed(1)}% 달성`,
          expectedImpact: `CTR +${((pattern.performance.avgCtr - 0.05) * 100).toFixed(1)}%`,
          evidence: {
            category: pattern.category,
            keywords: pattern.commonFeatures.titleKeywords,
            avgCtr: pattern.performance.avgCtr,
            sampleCount: pattern.sampleCount,
          },
        });
      }

      // 2. 썸네일 최적화 제안
      suggestions.push({
        type: 'thumbnail',
        priority: 4,
        suggestion: `${strategy.name} 카테고리에서 "${pattern.commonFeatures.thumbnailStyle}" 텍스트 효과 사용 권장`,
        expectedImpact: `시청 시간 +${pattern.performance.avgViewDuration.toFixed(0)}초`,
        evidence: {
          category: pattern.category,
          style: pattern.commonFeatures.thumbnailStyle,
          avgViewDuration: pattern.performance.avgViewDuration,
        },
      });

      // 3. 영상 길이 최적화 제안
      if (pattern.commonFeatures.videoLength > 0) {
        suggestions.push({
          type: 'category',
          priority: 3,
          suggestion: `${strategy.name} 카테고리 최적 영상 길이: ${pattern.commonFeatures.videoLength}초`,
          expectedImpact: `조회수 +${pattern.performance.avgViews.toFixed(0)}회`,
          evidence: {
            category: pattern.category,
            optimalLength: pattern.commonFeatures.videoLength,
            avgViews: pattern.performance.avgViews,
          },
        });
      }
    }

    // 우선순위 정렬
    suggestions.sort((a, b) => b.priority - a.priority);

    this.logger.log(`Generated ${suggestions.length} optimization suggestions`);
    return suggestions;
  }

  /**
   * 최적화 제안 적용
   *
   * 생성된 최적화 제안을 실제 시스템에 적용합니다.
   * (현재는 로깅만 수행, 추후 실제 적용 로직 추가 가능)
   *
   * @param suggestions - 적용할 최적화 제안 배열
   *
   * @example
   * ```typescript
   * const suggestions = await optimizationService.generateOptimizationSuggestions();
   * await optimizationService.applyOptimizations(suggestions);
   * ```
   */
  async applyOptimizations(
    suggestions: OptimizationSuggestion[],
  ): Promise<void> {
    this.logger.log(`Applying ${suggestions.length} optimizations...`);

    for (const suggestion of suggestions) {
      // 현재는 로깅만 수행
      // 추후 실제 적용 로직 추가 가능:
      // - config/category-strategies.json 업데이트
      // - GeminiService 프롬프트 동적 조정
      // - ThumbnailService 전략 변경

      this.logger.log(
        `[${suggestion.type.toUpperCase()}] ${suggestion.suggestion} (Priority: ${suggestion.priority})`,
      );
    }

    // 적용 히스토리 저장
    await this.saveOptimizationHistory({
      timestamp: new Date(),
      appliedCount: suggestions.length,
      suggestions,
    });
  }

  /**
   * 학습된 패턴 저장
   *
   * @param patterns - 패턴 배열
   * @private
   */
  private async savePatterns(patterns: OptimizationPattern[]): Promise<void> {
    try {
      await fs.writeJson(this.patternsFile, patterns, { spaces: 2 });
      this.logger.debug(`Saved ${patterns.length} patterns to ${this.patternsFile}`);
    } catch (error) {
      this.logger.error('Failed to save patterns:', error.message);
    }
  }

  /**
   * 학습된 패턴 로드
   *
   * @returns 패턴 배열
   * @private
   */
  private async loadPatterns(): Promise<OptimizationPattern[]> {
    try {
      if (await fs.pathExists(this.patternsFile)) {
        return await fs.readJson(this.patternsFile);
      }
    } catch (error) {
      this.logger.error('Failed to load patterns:', error.message);
    }

    return [];
  }

  /**
   * 주간 리포트 저장
   *
   * @param report - 리포트 데이터
   * @private
   */
  private async saveWeeklyReport(report: any): Promise<void> {
    try {
      const reportFile = path.join(
        this.dataDir,
        `weekly_${new Date().toISOString().split('T')[0]}.json`,
      );

      await fs.writeJson(reportFile, report, { spaces: 2 });
      this.logger.log(`Weekly report saved: ${reportFile}`);
    } catch (error) {
      this.logger.error('Failed to save weekly report:', error.message);
    }
  }

  /**
   * 최적화 히스토리 저장
   *
   * @param history - 히스토리 데이터
   * @private
   */
  private async saveOptimizationHistory(history: any): Promise<void> {
    try {
      let allHistory: any[] = [];

      if (await fs.pathExists(this.historyFile)) {
        allHistory = await fs.readJson(this.historyFile);
      }

      allHistory.push(history);

      await fs.writeJson(this.historyFile, allHistory, { spaces: 2 });
      this.logger.debug('Optimization history saved');
    } catch (error) {
      this.logger.error('Failed to save optimization history:', error.message);
    }
  }

  /**
   * 최근 최적화 히스토리 조회
   *
   * @param limit - 조회할 개수 (기본: 10)
   * @returns 최적화 히스토리 배열
   */
  async getOptimizationHistory(limit = 10): Promise<any[]> {
    try {
      if (await fs.pathExists(this.historyFile)) {
        const allHistory = await fs.readJson(this.historyFile);
        return allHistory.slice(-limit).reverse();
      }
    } catch (error) {
      this.logger.error('Failed to get optimization history:', error.message);
    }

    return [];
  }
}
