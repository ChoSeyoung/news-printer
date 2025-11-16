import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class KeywordExtractionService {
  private readonly logger = new Logger(KeywordExtractionService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured');
      throw new Error('GEMINI_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
  }

  /**
   * Extract English keywords from Korean news content for image search
   * @param title - News title
   * @param content - News content
   * @returns Comma-separated English keywords
   */
  async extractKeywords(title: string, content: string): Promise<string> {
    try {
      this.logger.debug('Extracting keywords with Gemini API');

      const prompt = this.buildPrompt(title, content);
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const keywords = response.text().trim();

      this.logger.debug(`Extracted keywords: ${keywords}`);
      return keywords;
    } catch (error) {
      this.logger.error('Failed to extract keywords:', error.message);

      // Fallback to generic news keyword
      this.logger.warn('Using fallback keyword: news');
      return 'news';
    }
  }

  /**
   * Build prompt for keyword extraction
   * @param title - News title
   * @param content - News content
   * @returns Formatted prompt
   */
  private buildPrompt(title: string, content: string): string {
    return `다음 뉴스 기사에서 배경 이미지 검색을 위한 핵심 키워드 1-3개를 영어로 추출해주세요.

뉴스 제목: ${title}
뉴스 내용: ${content.substring(0, 500)}

요구사항:
1. 뉴스의 핵심 주제를 대표하는 키워드만 선택
2. 이미지 검색에 적합한 구체적인 명사 위주로 선택
3. 모든 키워드는 영어로 번역
4. 쉼표로 구분하여 출력 (예: parliament, budget, government)
5. 설명이나 다른 텍스트 없이 키워드만 출력

키워드:`;
  }
}
