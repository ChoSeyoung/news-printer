import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 카테고리 전략 인터페이스
 */
export interface CategoryStrategy {
  name: string;
  thumbnail: {
    textEmphasis: 'highlight' | 'shadow' | 'underline' | 'all';
    highlightColor: string;
    keywords: string[];
    faceDetectionPriority: number;
  };
  videoStyle: {
    pacing: 'slow' | 'moderate' | 'fast' | 'very-fast';
    musicIntensity: 'low' | 'medium' | 'high';
    visualEffects: string;
  };
  scriptOptimization: {
    hookStyle: string;
    hookKeywords: string[];
    toneStyle: string;
    emphasizeWords: string[];
  };
  seoKeywords: string[];
  targetAudience: {
    ageGroup: string;
    interests: string[];
  };
}

/**
 * 카테고리별 최적화 전략 서비스
 *
 * 뉴스 카테고리에 따라 다른 최적화 전략을 적용합니다.
 * config/category-strategies.json 파일에서 전략을 로드하여
 * 썸네일, 스크립트, SEO, 타겟팅을 카테고리별로 최적화합니다.
 *
 * 지원 카테고리:
 * - politics (정치): 형광펜 효과, 팩트 중심 훅
 * - economy (경제): 그림자 효과, 숫자 강조 훅
 * - technology (기술/IT): 전체 효과, 혁신 강조 훅
 * - entertainment (연예/문화): 밑줄 효과, 센세이셔널 훅
 * - sports (스포츠): 그림자 효과, 흥분감 있는 훅
 * - society (사회): 형광펜 효과, 긴급성 훅
 * - health (건강/의학): 전체 효과, 정보 전달 훅
 * - international (국제): 그림자 효과, 글로벌 관점 훅
 * - default (일반): 균형잡힌 기본 전략
 *
 * @example
 * ```typescript
 * const strategy = categoryService.getStrategy('technology');
 * const optimizedTitle = categoryService.optimizeTitleForCategory(
 *   '새로운 AI 기술 발표',
 *   'technology'
 * );
 * ```
 */
@Injectable()
export class CategoryOptimizationService {
  private readonly logger = new Logger(CategoryOptimizationService.name);
  private strategies: Map<string, CategoryStrategy> = new Map();
  private optimizationRules: any;
  private performanceTargets: any;

  /**
   * CategoryOptimizationService 생성자
   *
   * config/category-strategies.json 파일을 로드합니다.
   */
  constructor() {
    this.loadStrategies();
  }

  /**
   * 카테고리 전략 설정 파일 로드
   *
   * @private
   */
  private async loadStrategies() {
    try {
      const configPath = path.join(
        process.cwd(),
        'config',
        'category-strategies.json',
      );

      if (!(await fs.pathExists(configPath))) {
        this.logger.warn(
          `Category strategies config not found: ${configPath}. Using default strategy.`,
        );
        return;
      }

      const config = await fs.readJson(configPath);

      // 카테고리 전략 로드
      for (const [category, strategy] of Object.entries(config.categories)) {
        this.strategies.set(category, strategy as CategoryStrategy);
      }

      this.optimizationRules = config.optimizationRules;
      this.performanceTargets = config.performanceTargets;

      this.logger.log(
        `Loaded ${this.strategies.size} category strategies from config`,
      );
    } catch (error) {
      this.logger.error('Failed to load category strategies:', error.message);
    }
  }

  /**
   * 특정 카테고리의 전략 가져오기
   *
   * @param category - 카테고리 이름 (politics, economy, technology 등)
   * @returns 카테고리 전략 객체, 없으면 default 전략
   *
   * @example
   * ```typescript
   * const strategy = categoryService.getStrategy('technology');
   * console.log(strategy.thumbnail.textEmphasis); // 'all'
   * ```
   */
  getStrategy(category: string): CategoryStrategy {
    const strategy = this.strategies.get(category);

    if (!strategy) {
      this.logger.warn(
        `Strategy not found for category: ${category}. Using default.`,
      );
      return this.strategies.get('default') || this.getDefaultStrategy();
    }

    return strategy;
  }

  /**
   * 뉴스 제목에서 카테고리 자동 감지
   *
   * 제목과 내용의 키워드를 분석하여 가장 적합한 카테고리를 추론합니다.
   *
   * @param title - 뉴스 제목
   * @param content - 뉴스 내용 (선택)
   * @returns 감지된 카테고리 이름
   *
   * @example
   * ```typescript
   * const category = categoryService.detectCategory(
   *   '삼성전자, 혁신적인 AI 칩 개발 성공'
   * );
   * // 반환: 'technology'
   * ```
   */
  detectCategory(title: string, content?: string): string {
    const text = `${title} ${content || ''}`.toLowerCase();

    // 카테고리별 키워드 매칭 점수 계산
    const scores = new Map<string, number>();

    for (const [category, strategy] of this.strategies.entries()) {
      if (category === 'default') continue;

      let score = 0;

      // SEO 키워드 매칭
      for (const keyword of strategy.seoKeywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 2;
        }
      }

      // 썸네일 키워드 매칭
      for (const keyword of strategy.thumbnail.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      // 강조 단어 매칭
      for (const word of strategy.scriptOptimization.emphasizeWords) {
        if (text.includes(word.toLowerCase())) {
          score += 1.5;
        }
      }

      scores.set(category, score);
    }

    // 가장 높은 점수의 카테고리 선택
    let maxScore = 0;
    let detectedCategory = 'default';

    for (const [category, score] of scores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        detectedCategory = category;
      }
    }

    this.logger.log(
      `Detected category for "${title}": ${detectedCategory} (score: ${maxScore})`,
    );

    return detectedCategory;
  }

  /**
   * 카테고리에 맞춰 제목 최적화
   *
   * 카테고리별 키워드와 스타일을 반영하여 제목을 최적화합니다.
   * YouTube 제목 길이 제한(100자)을 준수합니다.
   *
   * @param title - 원본 제목
   * @param category - 카테고리 이름
   * @returns 최적화된 제목
   *
   * @example
   * ```typescript
   * const optimized = categoryService.optimizeTitleForCategory(
   *   'AI 기술 발표',
   *   'technology'
   * );
   * // 반환: '🚀 혁신적인 AI 기술 발표 | 세계 최초'
   * ```
   */
  optimizeTitleForCategory(title: string, category: string): string {
    const strategy = this.getStrategy(category);
    const maxLength = this.optimizationRules?.titleMaxLength || 100;

    // 카테고리별 접두사 추가
    const prefixes: Record<string, string> = {
      politics: '🏛️',
      economy: '📈',
      technology: '🚀',
      entertainment: '⭐',
      sports: '⚽',
      society: '🔔',
      health: '🏥',
      international: '🌍',
    };

    const prefix = prefixes[category] || '📰';

    // 키워드 강조
    let optimizedTitle = title;
    for (const keyword of strategy.thumbnail.keywords) {
      if (title.includes(keyword)) {
        optimizedTitle = `${prefix} ${keyword}: ${title}`;
        break;
      }
    }

    // 접두사만 추가
    if (optimizedTitle === title) {
      optimizedTitle = `${prefix} ${title}`;
    }

    // 길이 제한
    if (optimizedTitle.length > maxLength) {
      optimizedTitle = optimizedTitle.substring(0, maxLength - 3) + '...';
    }

    return optimizedTitle;
  }

  /**
   * 카테고리에 맞춰 설명(description) 최적화
   *
   * SEO 키워드를 포함한 설명을 생성합니다.
   *
   * @param description - 원본 설명
   * @param category - 카테고리 이름
   * @returns 최적화된 설명
   */
  optimizeDescriptionForCategory(
    description: string,
    category: string,
  ): string {
    const strategy = this.getStrategy(category);
    const maxLength = this.optimizationRules?.descriptionMaxLength || 5000;

    // SEO 키워드를 해시태그로 추가
    const hashtags = strategy.seoKeywords
      .map((keyword) => `#${keyword}`)
      .join(' ');

    let optimizedDescription = `${description}\n\n${hashtags}`;

    // 길이 제한
    if (optimizedDescription.length > maxLength) {
      optimizedDescription = optimizedDescription.substring(0, maxLength);
    }

    return optimizedDescription;
  }

  /**
   * 카테고리에 맞는 훅 오프닝 스타일 가져오기
   *
   * GeminiService의 프롬프트에 카테고리별 훅 스타일을 적용할 수 있습니다.
   *
   * @param category - 카테고리 이름
   * @returns 훅 스타일 문자열
   *
   * @example
   * ```typescript
   * const hookStyle = categoryService.getHookStyleForCategory('economy');
   * // 반환: 'numeric' - 숫자 강조형 훅
   * ```
   */
  getHookStyleForCategory(category: string): string {
    const strategy = this.getStrategy(category);
    return strategy.scriptOptimization.hookStyle;
  }

  /**
   * 카테고리에 맞는 훅 키워드 가져오기
   *
   * @param category - 카테고리 이름
   * @returns 훅 키워드 배열
   */
  getHookKeywordsForCategory(category: string): string[] {
    const strategy = this.getStrategy(category);
    return strategy.scriptOptimization.hookKeywords;
  }

  /**
   * 카테고리에 맞는 썸네일 텍스트 강조 타입 가져오기
   *
   * @param category - 카테고리 이름
   * @returns 텍스트 강조 타입
   */
  getThumbnailEmphasisType(
    category: string,
  ): 'highlight' | 'shadow' | 'underline' | 'all' {
    const strategy = this.getStrategy(category);
    return strategy.thumbnail.textEmphasis;
  }

  /**
   * 카테고리에 맞는 썸네일 색상 가져오기
   *
   * @param category - 카테고리 이름
   * @returns 썸네일 하이라이트 색상 (hex)
   */
  getThumbnailColor(category: string): string {
    const strategy = this.getStrategy(category);
    return strategy.thumbnail.highlightColor;
  }

  /**
   * 카테고리에 맞는 얼굴 감지 우선순위 가져오기
   *
   * @param category - 카테고리 이름
   * @returns 얼굴 감지 우선순위 (0-1)
   */
  getFaceDetectionPriority(category: string): number {
    const strategy = this.getStrategy(category);
    return strategy.thumbnail.faceDetectionPriority;
  }

  /**
   * 모든 카테고리 목록 가져오기
   *
   * @returns 카테고리 이름 배열
   */
  getAllCategories(): string[] {
    return Array.from(this.strategies.keys()).filter(
      (cat) => cat !== 'default',
    );
  }

  /**
   * 최적화 규칙 가져오기
   *
   * @returns 최적화 규칙 객체
   */
  getOptimizationRules(): any {
    return this.optimizationRules;
  }

  /**
   * 성과 목표 가져오기
   *
   * @returns 성과 목표 객체
   */
  getPerformanceTargets(): any {
    return this.performanceTargets;
  }

  /**
   * 기본 전략 생성 (설정 파일 로드 실패 시 사용)
   *
   * @private
   */
  private getDefaultStrategy(): CategoryStrategy {
    return {
      name: '일반',
      thumbnail: {
        textEmphasis: 'shadow',
        highlightColor: '#808080',
        keywords: ['뉴스', '소식'],
        faceDetectionPriority: 0.6,
      },
      videoStyle: {
        pacing: 'moderate',
        musicIntensity: 'medium',
        visualEffects: 'standard',
      },
      scriptOptimization: {
        hookStyle: 'balanced',
        hookKeywords: ['전해드립니다', '소식입니다'],
        toneStyle: 'neutral',
        emphasizeWords: ['뉴스', '소식'],
      },
      seoKeywords: ['뉴스', '소식'],
      targetAudience: {
        ageGroup: '20-60',
        interests: ['뉴스', '시사'],
      },
    };
  }
}
