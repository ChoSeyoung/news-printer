import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 스크립트 응답 인터페이스
 */
export interface ScriptResponse {
  /** 앵커 대본 */
  anchor: string;
  /** 리포터 대본 */
  reporter: string;
}

/**
 * 썸네일 이미지 선택 결과 인터페이스
 */
export interface ThumbnailImageSelection {
  /** 선택된 이미지 인덱스 (0부터 시작) */
  selectedIndex: number;
  /** 선택 이유 */
  reason: string;
}

/**
 * Google Gemini AI 서비스
 *
 * Google Gemini AI를 사용하여 뉴스 대본 생성 및 썸네일 이미지 선택을 수행합니다.
 *
 * 주요 기능:
 * - 뉴스 기사 내용을 바탕으로 앵커/리포터 대본 자동 생성
 * - AI 기반 썸네일 이미지 선택
 * - JSON 응답 파싱 및 검증
 * - 마크다운 코드 블록 자동 제거
 */
@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model;

  constructor(private configService: ConfigService) {
    // Gemini API 키 가져오기
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      this.logger.error('GEMINI_API_KEY is not configured in environment variables');
      throw new Error('GEMINI_API_KEY is required');
    }

    // Gemini AI 클라이언트 초기화
    this.genAI = new GoogleGenerativeAI(apiKey);
    // gemini-2.0-flash-lite 모델 사용 (빠르고 효율적)
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
  }

  /**
   * 기사 내용으로부터 앵커 및 리포터 대본을 생성합니다
   *
   * @param content - 기사 전체 내용
   * @returns 앵커 및 리포터 대본
   *
   * 생성 방식:
   * 1. 한국어 프롬프트로 Gemini API 호출
   * 2. JSON 형식 응답 파싱
   * 3. 배열 형식 응답을 문자열로 변환
   * 4. 이스케이프 문자 제거
   *
   * 대본 특징:
   * - 앵커: 뉴스 개요 및 전달
   * - 리포터: 상세 내용 및 개인적 견해 포함
   * - TTS에 적합한 자연스러운 문체
   * - 기자 멘트 생략 ("어디서 전달드렸습니다" 등)
   */
  async generateScripts(content: string): Promise<ScriptResponse> {
    try {
      this.logger.debug('Generating scripts with Gemini API');

      // 프롬프트 생성
      const prompt = this.buildPrompt(content);

      // Gemini API 호출
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      this.logger.debug(`Received response from Gemini: ${text.substring(0, 100)}...`);

      // JSON 응답 파싱
      const scripts = this.parseScriptResponse(text);

      this.logger.debug('Successfully generated anchor and reporter scripts');
      return scripts;
    } catch (error) {
      this.logger.error('Failed to generate scripts with Gemini:', error.message);
      // 에러 시 빈 대본 반환
      return {
        anchor: '',
        reporter: '',
      };
    }
  }

  /**
   * Gemini API용 프롬프트를 생성합니다
   *
   * @param content - 기사 내용
   * @returns 형식화된 프롬프트
   *
   * 프롬프트 요구사항:
   * - JSON 형식 응답 (마크다운 없음)
   * - anchor, reporter 키 사용
   * - 이스케이프 문자 없이 순수 문자열
   * - 리포터는 개인 견해 및 피드백 포함
   * - TTS에 적합한 자연스러운 대본
   * - 기자 멘트 생략
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
   * Gemini API 응답에서 스크립트를 파싱합니다
   *
   * @param text - Gemini 응답 텍스트
   * @returns 스크립트 응답 객체
   *
   * 처리 기능:
   * - 마크다운 코드 블록 제거 (```json, ```)
   * - JSON 파싱
   * - 구조 검증 (anchor, reporter 필드 확인)
   * - 배열을 문자열로 변환 (이중 개행으로 연결)
   * - 이스케이프 문자 제거
   */
  private parseScriptResponse(text: string): ScriptResponse {
    try {
      // 마크다운 코드 블록 제거
      let jsonText = text.trim();

      // ```json 또는 ``` 제거
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      // JSON 파싱
      const parsed = JSON.parse(jsonText.trim());

      // 필수 필드 검증
      if (!parsed.anchor || !parsed.reporter) {
        this.logger.warn('Invalid script response structure, missing anchor or reporter');
        return { anchor: '', reporter: '' };
      }

      // 배열을 문자열로 변환 (필요시)
      const anchorText = Array.isArray(parsed.anchor)
        ? parsed.anchor.join('\n\n')
        : parsed.anchor;
      const reporterText = Array.isArray(parsed.reporter)
        ? parsed.reporter.join('\n\n')
        : parsed.reporter;

      // 이스케이프 문자 제거 후 반환
      return {
        anchor: this.removeEscapeCharacters(anchorText),
        reporter: this.removeEscapeCharacters(reporterText),
      };
    } catch (error) {
      this.logger.error('Failed to parse script response:', error.message);
      this.logger.debug('Raw response text:', text);
      return { anchor: '', reporter: '' };
    }
  }

  /**
   * 배경 이미지 중 썸네일에 가장 적합한 이미지를 선택합니다
   *
   * @param title - 뉴스 제목
   * @param newsContent - 뉴스 내용
   * @param imageCount - 사용 가능한 이미지 개수
   * @returns 선택된 이미지 인덱스 (0부터 시작)
   *
   * 선택 기준:
   * 1. 뉴스 제목과 내용을 가장 잘 표현하는 이미지
   * 2. 시각적으로 강렬하고 클릭을 유도할 수 있는 이미지
   * 3. 뉴스의 핵심 메시지를 전달하기 좋은 이미지
   *
   * 기본값: 에러 발생 시 0번 이미지 반환
   */
  async selectBestThumbnailImage(
    title: string,
    newsContent: string,
    imageCount: number,
  ): Promise<number> {
    try {
      this.logger.debug('Selecting best thumbnail image with Gemini API');

      // 썸네일 선택 프롬프트
      const prompt = `다음 뉴스 기사의 썸네일로 사용할 배경 이미지를 ${imageCount}개 중에서 선택해주세요.

뉴스 제목: ${title}
뉴스 내용: ${newsContent}

배경 이미지는 0번부터 ${imageCount - 1}번까지 총 ${imageCount}개가 있습니다.
각 이미지는 뉴스와 관련된 키워드로 검색된 이미지입니다.

썸네일로 가장 적합한 이미지의 인덱스 번호(0-${imageCount - 1})를 선택해주세요.
선택 기준:
1. 뉴스 제목과 내용을 가장 잘 표현하는 이미지
2. 시각적으로 강렬하고 클릭을 유도할 수 있는 이미지
3. 뉴스의 핵심 메시지를 전달하기 좋은 이미지

응답은 JSON 형식으로 작성하되, 마크다운 문법 없이 순수 JSON만 반환해주세요.
형식: {"selectedIndex": 숫자, "reason": "선택 이유"}

첫 번째 이미지(0번)를 선택하는 것이 일반적으로 가장 적합합니다.`;

      // Gemini API 호출
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      this.logger.debug(`Received thumbnail selection: ${text}`);

      // 응답 파싱
      const selection = this.parseThumbnailSelection(text, imageCount);
      this.logger.debug(`Selected image index: ${selection.selectedIndex}, reason: ${selection.reason}`);

      return selection.selectedIndex;
    } catch (error) {
      this.logger.error('Failed to select thumbnail image with Gemini:', error.message);
      // 에러 시 첫 번째 이미지 반환
      return 0;
    }
  }

  /**
   * Gemini API 응답에서 썸네일 선택 결과를 파싱합니다
   *
   * @param text - Gemini 응답 텍스트
   * @param imageCount - 사용 가능한 이미지 개수
   * @returns 썸네일 이미지 선택 결과
   *
   * 처리 기능:
   * - 마크다운 코드 블록 제거
   * - JSON 파싱
   * - selectedIndex 필드 검증
   * - 인덱스 범위 검증 (0 ~ imageCount-1)
   * - 에러 시 기본값 (0) 반환
   */
  private parseThumbnailSelection(text: string, imageCount: number): ThumbnailImageSelection {
    try {
      // 마크다운 코드 블록 제거
      let jsonText = text.trim();

      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/```\s*$/, '');
      }

      // JSON 파싱
      const parsed = JSON.parse(jsonText.trim());

      // selectedIndex 필드 검증
      if (typeof parsed.selectedIndex !== 'number') {
        this.logger.warn('Invalid thumbnail selection response, using default (0)');
        return { selectedIndex: 0, reason: 'Default selection (parsing error)' };
      }

      // 인덱스 범위 검증 (0 ~ imageCount-1)
      const index = Math.max(0, Math.min(parsed.selectedIndex, imageCount - 1));

      return {
        selectedIndex: index,
        reason: parsed.reason || 'No reason provided',
      };
    } catch (error) {
      this.logger.error('Failed to parse thumbnail selection:', error.message);
      return { selectedIndex: 0, reason: 'Default selection (parsing error)' };
    }
  }

  /**
   * 텍스트에서 이스케이프 문자를 실제 문자로 변환합니다
   *
   * @param text - 이스케이프 문자가 포함된 텍스트
   * @returns 변환된 텍스트
   *
   * 변환 항목:
   * - \\n -> 개행
   * - \\r -> 캐리지 리턴
   * - \\t -> 탭
   * - \\" -> 큰따옴표
   * - \\' -> 작은따옴표
   * - \\\\ -> 백슬래시
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
