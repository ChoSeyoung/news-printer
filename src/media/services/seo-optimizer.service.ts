import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

/**
 * SEO 메타데이터 인터페이스
 */
export interface SeoMetadata {
  /** 최적화된 영상 제목 (100자 이내) */
  optimizedTitle: string;
  /** 최적화된 영상 설명 (키워드 포함) */
  optimizedDescription: string;
  /** 태그 배열 (최대 30개) */
  tags: string[];
  /** YouTube 카테고리 ID */
  categoryId: string;
  /** 추출된 핵심 키워드 배열 */
  keywords: string[];
}

/**
 * SEO 최적화 입력 데이터 인터페이스
 */
export interface SeoInput {
  /** 원본 뉴스 제목 */
  originalTitle: string;
  /** 뉴스 본문 내용 */
  newsContent: string;
  /** 앵커 대본 */
  anchorScript: string;
  /** 리포터 대본 */
  reporterScript: string;
}

/**
 * YouTube SEO 최적화 서비스
 *
 * Google Gemini AI를 활용하여 YouTube 알고리즘에 최적화된 메타데이터를 생성합니다.
 * 뉴스 콘텐츠를 분석하여 검색 친화적인 제목, 설명, 태그를 자동으로 생성합니다.
 *
 * 주요 기능:
 * - Gemini AI 기반 콘텐츠 분석 및 키워드 추출
 * - 검색 최적화된 제목 생성 (100자 제한)
 * - SEO 친화적인 설명 작성 (키워드 해시태그 포함)
 * - 다양한 카테고리 태그 자동 생성 (최대 30개)
 * - YouTube 카테고리 자동 매핑
 *
 * SEO 최적화 전략:
 * - 검색량이 높은 키워드 우선 선정
 * - 롱테일 키워드 포함으로 틈새 검색 타겟팅
 * - 자연스러운 뉴스 채널 스타일 유지
 * - 해시태그 최적화 (공백 제거, 중복 제거)
 *
 * @example
 * ```typescript
 * const seoMetadata = await seoOptimizerService.generateSeoMetadata({
 *   originalTitle: '대통령 신년 기자회견',
 *   newsContent: '대통령이 신년 기자회견을 개최했습니다...',
 *   anchorScript: '안녕하세요. 뉴스입니다...',
 *   reporterScript: '김철수 기자입니다...'
 * });
 * // seoMetadata: { optimizedTitle, optimizedDescription, tags, categoryId, keywords }
 * ```
 */
@Injectable()
export class SeoOptimizerService {
  private readonly logger = new Logger(SeoOptimizerService.name);
  /** Google Gemini AI 클라이언트 */
  private readonly genAI: GoogleGenerativeAI;
  /** Gemini 모델 인스턴스 (gemini-2.5-flash-lite) */
  private readonly model;

  /**
   * 유튜브 알고리즘 친화적 이모지 (현재 미사용)
   *
   * 향후 제목이나 설명에 이모지를 추가할 때 사용할 수 있는
   * 카테고리별 이모지 맵입니다.
   */
  private readonly trendingEmojis = {
    breaking: ['🔥', '⚡', '🚨', '📢'],
    important: ['⭐', '💡', '👀', '📌'],
    time: ['⏰', '🕐', '📅', '🗓️'],
    topic: {
      politics: ['🏛️', '⚖️', '🗳️'],
      economy: ['💰', '📈', '💹', '📊'],
      society: ['👥', '🌍', '🏙️'],
      tech: ['💻', '🔬', '🚀', '📱'],
      culture: ['🎭', '🎬', '🎨', '📚'],
    },
  };

  /**
   * SeoOptimizerService 생성자
   *
   * Google Gemini AI 클라이언트를 초기화합니다.
   *
   * @param configService - NestJS 환경 설정 서비스
   * @throws {Error} GEMINI_API_KEY 환경 변수가 설정되지 않은 경우
   */
  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  }

  /**
   * YouTube SEO 최적화 메타데이터 생성
   *
   * 뉴스 콘텐츠를 분석하여 YouTube 알고리즘에 최적화된 메타데이터를 생성합니다.
   *
   * 처리 단계:
   * 1. Gemini AI로 콘텐츠 분석 및 키워드 추출
   * 2. 제목 최적화 (원본 제목 유지, 100자 제한)
   * 3. 설명 최적화 (완전한 요약 + 키워드 해시태그)
   * 4. 태그 생성 (다양한 카테고리, 최대 30개)
   * 5. YouTube 카테고리 ID 선택
   *
   * @param input - SEO 최적화 입력 데이터
   * @returns SEO 최적화된 메타데이터
   * @throws {Error} Gemini API 호출 실패 또는 분석 실패 시
   *
   * @example
   * ```typescript
   * const metadata = await seoOptimizerService.generateSeoMetadata({
   *   originalTitle: '경제 성장률 3% 돌파',
   *   newsContent: '올해 경제 성장률이 3%를 돌파했습니다...',
   *   anchorScript: '경제 뉴스입니다...',
   *   reporterScript: '경제부 이영희 기자입니다...'
   * });
   *
   * console.log(metadata.optimizedTitle); // '경제 성장률 3% 돌파'
   * console.log(metadata.tags.length);    // 30 (최대)
   * console.log(metadata.categoryId);     // '25' (뉴스/정치)
   * ```
   */
  async generateSeoMetadata(input: SeoInput): Promise<SeoMetadata> {
    try {
      this.logger.log('Generating SEO-optimized metadata for YouTube');

      // 1단계: Gemini로 키워드 추출 및 분석
      const analysis = await this.analyzeContent(input);

      // 2단계: 제목 최적화
      const optimizedTitle = this.optimizeTitle(
        input.originalTitle,
        analysis.keywords,
        analysis.category,
      );

      // 3단계: 설명 최적화 (Gemini AI 사용)
      const optimizedDescription = await this.optimizeDescription(
        input.newsContent,
        input.anchorScript,
        input.reporterScript,
        analysis.keywords,
      );

      // 4단계: 태그 생성
      const tags = this.generateTags(analysis.keywords, analysis.category);

      // 5단계: 카테고리 ID 결정
      const categoryId = this.selectCategoryId(analysis.category);

      this.logger.log('SEO metadata generated successfully');

      return {
        optimizedTitle,
        optimizedDescription,
        tags,
        categoryId,
        keywords: analysis.keywords,
      };
    } catch (error) {
      this.logger.error('Failed to generate SEO metadata:', error.message);
      throw error;
    }
  }

  /**
   * Gemini AI로 콘텐츠 분석 및 키워드 추출
   *
   * 뉴스 콘텐츠를 Gemini AI에게 전달하여 다음 정보를 추출합니다:
   * - 검색 최적화 키워드 10개 (검색량 높은 순서)
   * - 뉴스 카테고리 분류
   * - 핵심 주제 요약
   *
   * 키워드 선정 기준:
   * 1. 검색량이 높은 키워드 우선
   * 2. 뉴스의 핵심 내용과 직접 관련
   * 3. 롱테일 키워드 포함 (틈새 검색 타겟팅)
   * 4. 트렌딩 키워드 고려
   *
   * @param input - SEO 분석 입력 데이터
   * @returns 분석 결과 (키워드, 카테고리, 핵심 주제)
   *
   * @private
   */
  private async analyzeContent(input: SeoInput): Promise<{
    keywords: string[];
    category: string;
    mainTopic: string;
  }> {
    try {
      const prompt = `다음 뉴스 콘텐츠를 분석하여 유튜브 SEO에 최적화된 정보를 추출해주세요.

뉴스 제목: ${input.originalTitle}
뉴스 내용: ${input.newsContent}

다음 정보를 JSON 형식으로 반환해주세요:
{
  "keywords": ["핵심 키워드 10개 (검색량이 높고 관련성 높은 순서)"],
  "category": "정치|경제|사회|과학기술|문화|스포츠|국제 중 하나",
  "mainTopic": "이 뉴스의 핵심 주제를 한 문장으로"
}

키워드는 다음 기준으로 선정:
1. 반드시 명사 형태로만 추출 (예: "대통령", "국회", "경제정책", "부동산" 등)
2. 동사, 형용사, 서술어 제외 (예: "발표했다", "결정된", "논의중인" 등 제외)
3. 검색량이 높은 키워드 우선
4. 뉴스의 핵심 내용과 직접 관련된 명사
5. 인물명, 기관명, 지역명 포함 가능`;

      // Gemini AI 호출
      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // JSON 파싱 (코드 블록 제거)
      let jsonText = text.trim();
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      const analysis = JSON.parse(jsonText.trim());

      this.logger.debug(`Content analysis: ${JSON.stringify(analysis)}`);

      return {
        keywords: analysis.keywords || [],
        category: analysis.category || '사회',
        mainTopic: analysis.mainTopic || input.originalTitle,
      };
    } catch (error) {
      this.logger.error('Failed to analyze content:', error.message);
      // Gemini 분석 실패 시 기본값 반환
      return {
        keywords: [input.originalTitle],
        category: '사회',
        mainTopic: input.originalTitle,
      };
    }
  }

  /**
   * 제목 최적화
   *
   * 원본 제목을 그대로 사용하되, YouTube 제목 길이 제한(100자)을 준수합니다.
   * 썸네일에 표시되는 제목과 동일하게 유지하여 일관성을 보장합니다.
   *
   * 최적화 규칙:
   * - 원본 제목 유지 (썸네일과 동일)
   * - 100자 초과 시 97자로 자르고 '...' 추가
   * - 자연스러운 뉴스 제목 스타일 유지
   *
   * @param originalTitle - 원본 뉴스 제목
   * @param keywords - 추출된 키워드 배열 (현재 미사용)
   * @param category - 뉴스 카테고리 (현재 미사용)
   * @returns 최적화된 제목 (100자 이내)
   *
   * @private
   */
  private optimizeTitle(
    originalTitle: string,
    keywords: string[],
    category: string,
  ): string {
    // 한자 및 이니셜을 한글로 치환
    let title = TextPreprocessor.preprocessText(originalTitle);

    // 100자 제한 (YouTube 제목 길이 제한)
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    return title;
  }

  /**
   * 설명 최적화
   *
   * 자연스러운 뉴스 채널 스타일의 설명을 생성합니다.
   * Gemini AI로 생성한 실제 뉴스 요약을 사용하고,
   * 키워드 해시태그를 추가하여 검색 최적화를 강화합니다.
   *
   * 설명 구성:
   * 1. 날짜 정보 ("YYYY년 MM월 DD일 주요 뉴스입니다.")
   * 2. 뉴스 완전 요약 (Gemini AI 생성, 300자 이내)
   * 3. 구독/좋아요 안내
   * 4. 해시태그 (#뉴스 #속보 + 키워드 해시태그)
   *
   * @param newsContent - 뉴스 본문
   * @param anchorScript - 앵커 대본 (Gemini 실패 시 사용)
   * @param reporterScript - 리포터 대본 (Gemini 실패 시 사용)
   * @param keywords - 추출된 키워드 배열
   * @returns 최적화된 설명
   *
   * @private
   */
  private async optimizeDescription(
    newsContent: string,
    anchorScript: string,
    reporterScript: string,
    keywords: string[],
  ): Promise<string> {
    const now = new Date();
    const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    // 뉴스 내용 완전 요약 (Gemini AI로 생성)
    const summary = await this.createCompleteSummary(newsContent, anchorScript, reporterScript);

    // 요약문에서 한자 및 이니셜 치환
    const preprocessedSummary = TextPreprocessor.preprocessText(summary);

    // 키워드 해시태그 생성 (최대 15개, 공백 제거)
    const keywordHashtags = keywords
      .slice(0, 15)
      .map(k => `#${k.replace(/\s+/g, '')}`) // 공백 제거
      .join(' ');

    const description = `
${dateStr} 주요 뉴스입니다.

${preprocessedSummary}

구독과 좋아요는 더 나은 콘텐츠 제작에 큰 힘이 됩니다.

#뉴스 #속보 #한국뉴스 ${keywordHashtags}
`.trim();

    return description;
  }

  /**
   * 뉴스 내용의 완전한 요약 생성
   *
   * Gemini AI를 사용하여 실제 뉴스 내용을 요약합니다.
   * 앵커/리포터 스크립트를 그대로 사용하지 않고, 뉴스 본문을 기반으로 새로운 요약을 생성합니다.
   *
   * 요약 생성 과정:
   * 1. Gemini AI에게 뉴스 본문 전달
   * 2. 300자 이내의 간결한 요약 요청
   * 3. 핵심 정보만 포함 (육하원칙 기반)
   * 4. 자연스러운 문장 마무리
   *
   * @param newsContent - 뉴스 본문
   * @param anchorScript - 앵커 대본 (참고용, Gemini 실패 시 사용)
   * @param reporterScript - 리포터 대본 (참고용, Gemini 실패 시 사용)
   * @returns 완전한 요약 (300자 이내)
   *
   * @private
   */
  private async createCompleteSummary(
    newsContent: string,
    anchorScript: string,
    reporterScript: string,
  ): Promise<string> {
    try {
      const prompt = `다음 뉴스 기사를 300자 이내로 간결하게 요약해주세요.
육하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)을 기반으로 핵심 정보만 포함해주세요.
뉴스 스크립트가 아닌 실제 기사 내용을 요약해야 합니다.

뉴스 기사:
${newsContent}

요구사항:
- 300자 이내로 작성
- 완전한 문장으로 마무리 (말줄임표 사용 금지)
- 핵심 정보만 포함
- 자연스러운 뉴스 요약 스타일

순수 텍스트로만 응답하세요 (JSON이나 마크다운 형식 사용 금지).`;

      // Gemini AI 호출
      const result = await this.model.generateContent(prompt);
      const summary = result.response.text().trim();

      this.logger.debug(`Generated summary: ${summary.substring(0, 100)}...`);

      // 300자 제한 확인 (혹시 모를 경우 대비)
      if (summary.length <= 300) {
        return summary;
      }

      // 300자 초과 시 문장 단위로 자르기
      const sentences = summary.split(/([.?!])\s+/);
      let truncated = '';
      let i = 0;

      while (i < sentences.length && (truncated + sentences[i]).length <= 300) {
        truncated += sentences[i];
        i++;
      }

      const lastPunctuationIndex = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('?'),
        truncated.lastIndexOf('!'),
      );

      if (lastPunctuationIndex > 0) {
        return truncated.substring(0, lastPunctuationIndex + 1).trim();
      }

      return truncated.trim();
    } catch (error) {
      this.logger.error('Failed to generate summary with Gemini:', error.message);

      // Gemini 실패 시 앵커+리포터 대본으로 대체
      const anchorSummary = anchorScript
        .split('\n')
        .filter(line => line.trim().length > 0)
        .join(' ')
        .trim();

      const reporterSummary = reporterScript
        .split('\n')
        .filter(line => line.trim().length > 0)
        .join(' ')
        .trim();

      const fallbackSummary = `${anchorSummary} ${reporterSummary}`.trim();

      if (fallbackSummary.length <= 300) {
        return fallbackSummary;
      }

      // 문장 단위로 자르기
      const sentences = fallbackSummary.split(/([.?!])\s+/);
      let summary = '';
      let i = 0;

      while (i < sentences.length && (summary + sentences[i]).length <= 300) {
        summary += sentences[i];
        i++;
      }

      const lastPunctuationIndex = Math.max(
        summary.lastIndexOf('.'),
        summary.lastIndexOf('?'),
        summary.lastIndexOf('!'),
      );

      if (lastPunctuationIndex > 0) {
        return summary.substring(0, lastPunctuationIndex + 1).trim();
      }

      return summary.trim();
    }
  }

  /**
   * 태그 생성
   *
   * 다양한 카테고리의 태그를 조합하여 YouTube 검색 최적화를 강화합니다.
   * 최대 30개 제한을 준수하며, 공백을 제거하고 중복을 제거합니다.
   *
   * 태그 구성:
   * 1. 핵심 키워드 5개 (Gemini 추출)
   * 2. 카테고리 태그 2개 (예: '정치', '정치뉴스')
   * 3. 일반 뉴스 태그 6개 ('뉴스', '속보' 등)
   * 4. 시간 관련 태그 4개 (연도, 월 등)
   * 5. 뉴스 타입 태그 3개 ('현장뉴스', '심층분석' 등)
   * 6. 롱테일 키워드 (나머지 키워드)
   *
   * @param keywords - 추출된 키워드 배열
   * @param category - 뉴스 카테고리
   * @returns 태그 배열 (최대 30개, 중복 제거됨)
   *
   * @private
   */
  private generateTags(keywords: string[], category: string): string[] {
    const tags: string[] = [];

    // 1. 핵심 키워드 (5개, 공백 제거)
    tags.push(...keywords.slice(0, 5).map(k => k.replace(/\s+/g, '')));

    // 2. 카테고리 태그
    tags.push(category);
    tags.push(`${category}뉴스`);

    // 3. 일반 뉴스 태그
    tags.push('뉴스', '속보', '오늘의뉴스', '최신뉴스', '한국뉴스', '뉴스속보');

    // 4. 시간 관련 태그
    const now = new Date();
    tags.push(
      `${now.getFullYear()}년`,
      `${now.getMonth() + 1}월`,
      '뉴스브리핑',
      '종합뉴스',
    );

    // 5. 뉴스 타입 태그
    tags.push('현장뉴스', '심층분석', '뉴스리포트');

    // 6. 롱테일 키워드 (나머지 키워드, 공백 제거)
    tags.push(...keywords.slice(5, 12).map(k => k.replace(/\s+/g, '')));

    // 중복 제거 및 30개 제한
    const uniqueTags = [...new Set(tags)];
    return uniqueTags.slice(0, 30);
  }

  /**
   * YouTube 카테고리 ID 선택
   *
   * 뉴스 카테고리를 YouTube 카테고리 ID로 매핑합니다.
   * YouTube Data API v3의 카테고리 ID를 사용합니다.
   *
   * 카테고리 매핑:
   * - 정치, 경제, 사회, 국제 → '25' (뉴스/정치)
   * - 과학기술 → '28' (과학/기술)
   * - 문화 → '24' (엔터테인먼트)
   * - 스포츠 → '17' (스포츠)
   * - 기타 → '25' (기본값: 뉴스/정치)
   *
   * YouTube 카테고리 ID 참고:
   * https://developers.google.com/youtube/v3/docs/videoCategories/list
   *
   * @param category - 뉴스 카테고리
   * @returns YouTube 카테고리 ID
   *
   * @private
   */
  private selectCategoryId(category: string): string {
    const categoryMap: Record<string, string> = {
      '정치': '25', // News & Politics
      '경제': '25', // News & Politics
      '사회': '25', // News & Politics
      '국제': '25', // News & Politics
      '과학기술': '28', // Science & Technology
      '문화': '24', // Entertainment
      '스포츠': '17', // Sports
    };

    return categoryMap[category] || '25'; // 기본값: News & Politics
  }
}
