import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ScriptResponse {
  anchor: string;
  reporter: string;
}

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured in environment variables');
      throw new Error('GEMINI_API_KEY is required');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }

  /**
   * Generate anchor and reporter scripts from article content
   * @param content - Full article content
   * @returns ScriptResponse with anchor and reporter scripts
   */
  async generateScripts(content: string): Promise<ScriptResponse> {
    try {
      this.logger.debug('Generating scripts with Gemini API');

      const prompt = this.buildPrompt(content);
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      this.logger.debug(`Received response from Gemini: ${text.substring(0, 100)}...`);

      // Parse JSON response
      const scripts = this.parseScriptResponse(text);

      this.logger.debug('Successfully generated anchor and reporter scripts');
      return scripts;
    } catch (error) {
      this.logger.error('Failed to generate scripts with Gemini:', error.message);
      return {
        anchor: '',
        reporter: '',
      };
    }
  }

  /**
   * Build prompt for Gemini API
   * @param content - Article content
   * @returns Formatted prompt
   */
  private buildPrompt(content: string): string {
    return `주어진 지문을 바탕으로 두 가지 종류의 뉴스 대본을 작성해주세요.
응답은 JSON 형식으로 마크다운 문법이 아닌 json 파일을 응답하세요.
앵커 대본과 리포터 대본을 각각 "anchor"와 "reporter"라는 키를 사용하여 반환해야 합니다.
반환된 데이터에는 이스케이프 문자가 포함되면 안되고 항시 문자열만 들어가야합니다.
리포터 대본은 뉴스 내용에 대한 개인적인 견해를 포함하되, 정치적 비판이나 조언이 포함될 수 있습니다.
또한, 리포터는 대본 끝에 "어디서 전달드렸다, 기자였습니다"와 같은 멘트를 포함하지 않고, 앵커 또한 어떤 기자가 전해주겠다는 멘트는 생략해야합니다.
리포터는 뉴스 내용에 맞는 피드백과 칭찬을 자연스럽게 포함해야 합니다.
뉴스 대본은 TTS 를 이용하여 오디오 파일로 변환할 예정이므로 사람이 들었을 때 자연스럽게 들려야하는 대본이여야합니다.

다음은 주어진 텍스트입니다: ${content}`;
  }

  /**
   * Parse script response from Gemini API
   * Handles both pure JSON and markdown code block wrapped JSON
   * @param text - Response text from Gemini
   * @returns ScriptResponse object
   */
  private parseScriptResponse(text: string): ScriptResponse {
    try {
      // Remove markdown code block if present
      let jsonText = text.trim();

      // Remove ```json and ``` markers
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      // Parse JSON
      const parsed = JSON.parse(jsonText.trim());

      // Validate structure
      if (!parsed.anchor || !parsed.reporter) {
        this.logger.warn('Invalid script response structure, missing anchor or reporter');
        return { anchor: '', reporter: '' };
      }

      // Remove escape characters
      return {
        anchor: this.removeEscapeCharacters(parsed.anchor),
        reporter: this.removeEscapeCharacters(parsed.reporter),
      };
    } catch (error) {
      this.logger.error('Failed to parse script response:', error.message);
      this.logger.debug('Raw response text:', text);
      return { anchor: '', reporter: '' };
    }
  }

  /**
   * Remove escape characters from text
   * @param text - Text with potential escape characters
   * @returns Clean text
   */
  private removeEscapeCharacters(text: string): string {
    return text
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
}
