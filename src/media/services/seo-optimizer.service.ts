import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface SeoMetadata {
  optimizedTitle: string;
  optimizedDescription: string;
  tags: string[];
  categoryId: string;
  keywords: string[];
}

export interface SeoInput {
  originalTitle: string;
  newsContent: string;
  anchorScript: string;
  reporterScript: string;
}

@Injectable()
export class SeoOptimizerService {
  private readonly logger = new Logger(SeoOptimizerService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model;

  // 유튜브 알고리즘 친화적 이모지
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

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  }

  /**
   * 유튜브 알고리즘 최적화를 위한 SEO 메타데이터 생성
   */
  async generateSeoMetadata(input: SeoInput): Promise<SeoMetadata> {
    try {
      this.logger.log('Generating SEO-optimized metadata for YouTube');

      // Gemini로 키워드 추출 및 분석
      const analysis = await this.analyzeContent(input);

      // 제목 최적화
      const optimizedTitle = this.optimizeTitle(
        input.originalTitle,
        analysis.keywords,
        analysis.category,
      );

      // 설명 최적화
      const optimizedDescription = this.optimizeDescription(
        input.newsContent,
        input.anchorScript,
        input.reporterScript,
        analysis.keywords,
      );

      // 태그 생성
      const tags = this.generateTags(analysis.keywords, analysis.category);

      // 카테고리 ID 결정
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
   * Gemini로 콘텐츠 분석 및 키워드 추출
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
1. 검색량이 높은 키워드 우선
2. 뉴스의 핵심 내용과 직접 관련
3. 롱테일 키워드 포함
4. 트렌딩 키워드 고려`;

      const result = await this.model.generateContent(prompt);
      const text = result.response.text();

      // JSON 파싱
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
      // 기본값 반환
      return {
        keywords: [input.originalTitle],
        category: '사회',
        mainTopic: input.originalTitle,
      };
    }
  }

  /**
   * 제목 최적화: 원본 제목 사용 (썸네일과 동일)
   * 100자 이내로 제한
   */
  private optimizeTitle(
    originalTitle: string,
    keywords: string[],
    category: string,
  ): string {
    // 원본 제목 그대로 사용 (썸네일에 들어가는 제목)
    let title = originalTitle;

    // 100자 제한 (YouTube 제목 길이 제한)
    if (title.length > 100) {
      title = title.substring(0, 97) + '...';
    }

    return title;
  }

  /**
   * 설명 최적화: 자연스러운 뉴스 채널 스타일 설명 (이모지 제거)
   */
  private optimizeDescription(
    newsContent: string,
    anchorScript: string,
    reporterScript: string,
    keywords: string[],
  ): string {
    const now = new Date();
    const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    // 뉴스 내용 완전 요약 (말줄임표 없이)
    const summary = this.createCompleteSummary(newsContent, anchorScript, reporterScript);

    // 키워드 해시태그 생성 (최대 15개, 공백 제거)
    const keywordHashtags = keywords
      .slice(0, 15)
      .map(k => `#${k.replace(/\s+/g, '')}`) // 공백 제거
      .join(' ');

    const description = `
${dateStr} 주요 뉴스입니다.

${summary}

구독과 좋아요는 더 나은 콘텐츠 제작에 큰 힘이 됩니다.

#뉴스 #속보 #한국뉴스 ${keywordHashtags}
`.trim();

    return description;
  }

  /**
   * 뉴스 내용의 완전한 요약 생성 (말줄임표 없이)
   */
  private createCompleteSummary(
    newsContent: string,
    anchorScript: string,
    reporterScript: string,
  ): string {
    // 앵커 대본에서 핵심 내용 추출
    const anchorSummary = anchorScript
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join(' ')
      .trim();

    // 리포터 대본에서 핵심 내용 추출
    const reporterSummary = reporterScript
      .split('\n')
      .filter(line => line.trim().length > 0)
      .join(' ')
      .trim();

    // 앵커 + 리포터 대본을 조합하여 완전한 요약 생성
    const fullSummary = `${anchorSummary} ${reporterSummary}`.trim();

    // 300자 이내로 정리 (말줄임표 없이 문장 단위로 자르기)
    if (fullSummary.length <= 300) {
      return fullSummary;
    }

    // 문장 단위로 분리 (마침표, 물음표, 느낌표 기준)
    const sentences = fullSummary.split(/([.?!])\s+/);
    let summary = '';
    let i = 0;

    while (i < sentences.length && (summary + sentences[i]).length <= 300) {
      summary += sentences[i];
      i++;
    }

    // 마지막 문장이 완전하지 않으면 제거
    const lastPunctuationIndex = Math.max(
      summary.lastIndexOf('.'),
      summary.lastIndexOf('?'),
      summary.lastIndexOf('!'),
    );

    if (lastPunctuationIndex > 0) {
      return summary.substring(0, lastPunctuationIndex + 1).trim();
    }

    // 구두점이 없으면 그대로 반환
    return summary.trim();
  }

  /**
   * 태그 생성: 다양한 카테고리의 태그 조합
   * 최대 30개 제한 (공백 제거)
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
   * 카테고리 ID 선택
   * 유튜브 카테고리 ID 참고: https://developers.google.com/youtube/v3/docs/videoCategories/list
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
