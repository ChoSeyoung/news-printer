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
 * YouTube Shorts용 스크립트 응답 인터페이스
 */
export interface ShortsScriptResponse {
  /** Shorts 60초 스크립트 */
  script: string;
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
    // gemini-2.5-flash-lite 모델 사용 (빠르고 효율적)
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
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
   * - 앵커는 간결한 뉴스 개요만 전달 (기자 연결 멘트 제외)
   * - 리포터는 개인 견해 및 피드백 포함
   * - TTS에 적합한 자연스러운 대본
   * - 기자 마무리 멘트 생략
   */
  private buildPrompt(content: string): string {
    // 컨텐츠가 너무 길면 앞부분만 사용 (토큰 절약)
    const truncatedContent = content.length > 2000 ? content.substring(0, 2000) + '...' : content;

    return `뉴스 대본 생성. JSON만 반환: {"anchor":"...", "reporter":"..."}

규칙:
- anchor: 첫3초에 핵심 전달, 기자연결멘트 제외
- reporter: 견해/분석 포함, 마무리멘트 제외
- TTS용 자연스러운 문체

기사:
${truncatedContent}`;
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

      // 썸네일 선택 프롬프트 (최적화)
      const truncatedContent = newsContent.length > 500 ? newsContent.substring(0, 500) + '...' : newsContent;
      const prompt = `이미지 ${imageCount}개 중 썸네일 선택. JSON반환: {"selectedIndex":숫자,"reason":"이유"}

제목: ${title}
내용: ${truncatedContent}

0-${imageCount - 1}번 중 클릭유도력 높은 이미지 선택.`;

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
   * YouTube Shorts용 60초 요약 스크립트를 생성합니다
   *
   * @param content - 원본 뉴스 내용
   * @returns Shorts 60초 스크립트
   *
   * 생성 방식:
   * 1. 원본 뉴스를 60초 분량으로 압축
   * 2. Shorts 시청 패턴에 최적화 (첫 3초 Hook 필수)
   * 3. 세로 화면 시청에 적합한 간결한 문장
   * 4. 시청 유지율을 높이는 구성
   *
   * 스크립트 특징:
   * - 60초 이내 (약 150-200자)
   * - 첫 3초: 가장 충격적이거나 흥미로운 내용으로 Hook
   * - 중간: 핵심 정보 전달
   * - 마지막: 강렬한 마무리 또는 Call-to-Action
   */
  async generateShortsScript(title: string, content: string): Promise<string> {
    try {
      this.logger.debug('Generating Shorts script with Gemini API');

      // Shorts 프롬프트 생성
      const prompt = this.buildShortsPrompt(title, content);

      // Gemini API 호출
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      this.logger.debug(`Received Shorts script from Gemini: ${text.substring(0, 100)}...`);

      // JSON 응답 파싱
      const script = this.parseShortsScriptResponse(text);

      this.logger.debug('Successfully generated Shorts script');
      return script;
    } catch (error) {
      this.logger.error('Failed to generate Shorts script with Gemini:', error.message);
      return '';
    }
  }

  /**
   * Shorts용 프롬프트를 생성합니다
   *
   * @param content - 원본 뉴스 내용
   * @returns Shorts 프롬프트
   *
   * 프롬프트 요구사항:
   * - 60초 분량 (TTS 기준 약 150-200자)
   * - 첫 3초에 핵심 Hook (이탈 방지)
   * - 간결하고 임팩트 있는 문장
   * - 세로 화면 시청에 적합
   * - YouTube Shorts 알고리즘 최적화
   */
  private buildShortsPrompt(title: string, content: string): string {
    // 컨텐츠가 너무 길면 앞부분만 사용 (토큰 절약)
    const truncatedContent = content.length > 1500 ? content.substring(0, 1500) + '...' : content;

    return `뉴스 앵커가 시청자에게 전달하는 60초 Shorts 스크립트 생성. JSON반환: {"script":"..."}

제목: ${title}

중요:
- 반드시 위 제목과 관련된 내용만 요약하세요
- 제목과 무관한 내용은 완전히 무시하세요
- 기사에 없는 내용을 절대 생성하지 마세요
- 저작권 경고문, 송고 정보, 제보 안내, 광고 문구는 무시하세요
- 기사 내용이 부족하면 제목만 바탕으로 간단히 요약하세요

규칙:
- 뉴스 앵커 말투 (예: "~했습니다", "~로 알려졌습니다", "~라고 전했습니다")
- 첫 문장에 핵심 내용 Hook (시청자 이탈 방지)
- 150-200자 (60초 TTS 분량)
- 객관적이고 신뢰감 있는 톤
- 짧고 명확한 문장으로 구성
- "~입니다" 종결어미 사용
- 마무리멘트나 인사말 제외

기사:
${truncatedContent}`;
  }

  /**
   * Gemini API 응답에서 Shorts 스크립트를 파싱합니다
   *
   * @param text - Gemini 응답 텍스트
   * @returns Shorts 스크립트
   */
  private parseShortsScriptResponse(text: string): string {
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

      // 필수 필드 검증
      if (!parsed.script) {
        this.logger.warn('Invalid Shorts script response structure, missing script field');
        return '';
      }

      // 이스케이프 문자 제거 후 반환
      return this.removeEscapeCharacters(parsed.script);
    } catch (error) {
      this.logger.error('Failed to parse Shorts script response:', error.message);
      this.logger.debug('Raw response text:', text);
      return '';
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
