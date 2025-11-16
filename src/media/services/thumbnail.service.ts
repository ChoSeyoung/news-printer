import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 썸네일 생성 옵션 인터페이스
 */
export interface ThumbnailOptions {
  /** 뉴스 제목 (썸네일에 표시됨) */
  title: string;
  /** 뉴스 카테고리 (색상 테마 결정) */
  category: string;
  /** 뉴스 날짜 (선택사항) */
  date?: Date;
  /** 이미지 URL (선택사항, 현재 미사용) */
  imageUrl?: string;
  /** 배경 이미지 파일 경로 (선택사항, 없으면 단색 배경) */
  backgroundImagePath?: string;
}

/**
 * 썸네일 자동 생성 서비스
 *
 * Sharp 라이브러리를 사용하여 BBC 스타일의 전문적인 뉴스 썸네일을 자동 생성합니다.
 * 카테고리별 색상 테마, 배경 이미지, 타이포그래피를 적용하여 YouTube 썸네일을 생성합니다.
 *
 * 주요 기능:
 * - BBC 뉴스 스타일의 전문적인 디자인
 * - 카테고리별 색상 테마 적용 (정치, 경제, 사회 등)
 * - 배경 이미지 또는 단색 배경 지원
 * - 텍스트 가독성 최적화 (반투명 오버레이)
 * - 자동 줄바꿈 및 폰트 크기 조정
 * - YouTube 권장 해상도 (1280x720)
 *
 * 디자인 요소:
 * - YBC News 로고 및 악센트 바
 * - 카테고리별 맞춤 색상
 * - 시스템 폰트 사용 (크로스 플랫폼 호환성)
 * - 여백 및 레이아웃 최적화
 *
 * @example
 * ```typescript
 * const thumbnailPath = await thumbnailService.generateThumbnail({
 *   title: '대통령 신년 기자회견 주요 내용',
 *   category: '정치',
 *   backgroundImagePath: './images/news_bg.jpg'
 * });
 * // 반환값: './temp/thumbnail_1234567890.jpg'
 * ```
 */
@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  /** 임시 파일 저장 디렉토리 */
  private readonly tempDir = './temp';
  /** 썸네일 가로 해상도 (YouTube 권장) */
  private readonly width = 1280;
  /** 썸네일 세로 해상도 (YouTube 권장) */
  private readonly height = 720;

  /**
   * BBC 스타일 카테고리별 색상 테마
   *
   * 각 뉴스 카테고리마다 고유한 색상 테마를 적용하여
   * 시각적으로 카테고리를 구분할 수 있도록 합니다.
   *
   * 색상 구성:
   * - background: 배경색 (어두운 톤으로 전문성 표현)
   * - accent: 강조색 (악센트 바 및 중요 요소)
   * - emoji: 카테고리 이모지 (현재 미사용)
   */
  private readonly categoryColors: Record<string, { background: string; accent: string; emoji: string }> = {
    '정치': { background: '#1a1a2e', accent: '#e94560', emoji: '🏛️' },
    '경제': { background: '#0f2027', accent: '#2c5364', emoji: '💰' },
    '사회': { background: '#2d3436', accent: '#74b9ff', emoji: '👥' },
    '국제': { background: '#1e3a8a', accent: '#60a5fa', emoji: '🌍' },
    '과학기술': { background: '#1e293b', accent: '#f97316', emoji: '💻' },
    '문화': { background: '#312e81', accent: '#a78bfa', emoji: '🎭' },
    '스포츠': { background: '#065f46', accent: '#34d399', emoji: '⚽' },
    default: { background: '#1f2937', accent: '#f3f4f6', emoji: '📢' },
  };

  /**
   * ThumbnailService 생성자
   *
   * 임시 디렉토리를 생성합니다.
   */
  constructor() {
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * BBC 스타일 썸네일 자동 생성
   *
   * 뉴스 제목, 카테고리, 배경 이미지를 조합하여 전문적인 썸네일을 생성합니다.
   *
   * 생성 프로세스:
   * 1. 카테고리별 색상 테마 선택
   * 2. 배경 생성 (이미지 또는 단색)
   * 3. 텍스트 레이어 생성 (SVG)
   * 4. 배경 이미지 사용 시 반투명 오버레이 추가
   * 5. 모든 레이어 합성
   * 6. JPEG 형식으로 저장
   *
   * 출력 스펙:
   * - 해상도: 1280x720 (16:9 비율)
   * - 형식: JPEG
   * - 품질: 90%
   *
   * @param options - 썸네일 생성 옵션
   * @returns 생성된 썸네일 파일 경로
   * @throws {Error} 썸네일 생성 실패 시
   *
   * @example
   * ```typescript
   * // 배경 이미지 사용
   * const thumbnail1 = await thumbnailService.generateThumbnail({
   *   title: '경제 성장률 3% 돌파',
   *   category: '경제',
   *   backgroundImagePath: './images/economy.jpg'
   * });
   *
   * // 단색 배경 사용
   * const thumbnail2 = await thumbnailService.generateThumbnail({
   *   title: '국회 본회의 개최',
   *   category: '정치'
   * });
   * ```
   */
  async generateThumbnail(options: ThumbnailOptions): Promise<string> {
    try {
      this.logger.log(`Generating BBC-style thumbnail for: ${options.title}`);

      const outputPath = path.join(
        this.tempDir,
        `thumbnail_${Date.now()}.jpg`,
      );

      // 카테고리별 색상 가져오기
      const colors = this.categoryColors[options.category] || this.categoryColors.default;

      // 배경 생성 (이미지 또는 단색)
      const background = options.backgroundImagePath
        ? await this.createImageBackground(options.backgroundImagePath)
        : await this.createBackground(colors.background);

      // 텍스트 SVG 생성 (BBC 스타일)
      const textSvg = this.createTextSvg(options.title, colors.accent);

      // 레이어 합성을 위한 배열
      const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [];

      // 배경 이미지가 있으면 검정색 반투명 오버레이 추가 (텍스트 가독성 향상)
      if (options.backgroundImagePath) {
        const darkOverlay = await this.createDarkOverlay();
        compositeInputs.push({
          input: darkOverlay,
          top: 0,
          left: 0,
        });
      }

      // 텍스트 레이어 추가
      compositeInputs.push({
        input: Buffer.from(textSvg),
        top: 0,
        left: 0,
      });

      // 배경 + 오버레이 + 텍스트 합성
      await sharp(background)
        .composite(compositeInputs)
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      this.logger.log(`Thumbnail created: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to generate thumbnail:', error.message);
      throw error;
    }
  }

  /**
   * 이미지 파일을 썸네일 배경으로 생성
   *
   * 제공된 이미지를 썸네일 크기(1280x720)로 리사이즈하고 크롭합니다.
   * 이미지의 가로세로 비율을 유지하며 중앙 기준으로 크롭합니다.
   *
   * 처리 과정:
   * 1. 이미지 로드
   * 2. 1280x720 크기로 리사이즈 (cover 모드)
   * 3. 중앙 기준 크롭
   * 4. PNG 포맷으로 버퍼 반환
   *
   * @param imagePath - 배경 이미지 파일 경로
   * @returns 처리된 이미지 버퍼
   *
   * @private
   */
  private async createImageBackground(imagePath: string): Promise<Buffer> {
    try {
      // 이미지를 썸네일 크기로 리사이즈하고 크롭
      return await sharp(imagePath)
        .resize(this.width, this.height, {
          fit: 'cover', // 이미지를 늘려서 전체 영역 채움
          position: 'center', // 중앙 기준으로 크롭
        })
        .png()
        .toBuffer();
    } catch (error) {
      this.logger.error('Failed to create image background, using solid color:', error.message);
      // 이미지 로드 실패 시 기본 단색 배경 사용
      return this.createBackground('#1f2937');
    }
  }

  /**
   * 검정색 반투명 오버레이 생성
   *
   * 배경 이미지 위에 검정색 반투명 레이어를 추가하여
   * 텍스트 가독성을 향상시킵니다.
   *
   * 오버레이 스펙:
   * - 색상: 검정색 (rgba(0, 0, 0, 0.6))
   * - 투명도: 60%
   * - 크기: 1280x720 (전체 화면)
   *
   * @returns 반투명 오버레이 이미지 버퍼
   *
   * @private
   */
  private async createDarkOverlay(): Promise<Buffer> {
    // SVG로 검정색 반투명 오버레이 생성
    const svg = `
      <svg width="${this.width}" height="${this.height}">
        <rect width="${this.width}" height="${this.height}" fill="rgba(0, 0, 0, 0.6)" />
      </svg>
    `;

    return sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  /**
   * BBC 스타일 단색 배경 생성
   *
   * SVG를 사용하여 지정된 색상의 단색 배경을 생성합니다.
   * 배경 이미지가 없을 때 사용됩니다.
   *
   * @param backgroundColor - 배경 색상 (HEX 코드)
   * @returns 단색 배경 이미지 버퍼
   *
   * @private
   */
  private async createBackground(backgroundColor: string): Promise<Buffer> {
    // SVG 단색 배경 (어두운 톤)
    const svg = `
      <svg width="${this.width}" height="${this.height}">
        <rect width="${this.width}" height="${this.height}" fill="${backgroundColor}" />
      </svg>
    `;

    return sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  /**
   * BBC 스타일 텍스트 SVG 오버레이 생성
   *
   * 뉴스 제목과 YBC News 로고를 포함한 텍스트 레이어를 SVG로 생성합니다.
   *
   * 디자인 요소:
   * 1. 악센트 바 (상단 좌측, 카테고리 색상)
   * 2. YBC News 로고 (악센트 바 우측)
   * 3. 뉴스 제목 (중앙, 자동 줄바꿈)
   *
   * 텍스트 처리:
   * - 자동 줄바꿈 (25자마다)
   * - 최대 3줄로 제한
   * - 줄 수에 따라 폰트 크기 자동 조정
   * - 좌측 정렬
   * - 여백 최적화
   *
   * @param title - 뉴스 제목
   * @param accentColor - 강조 색상 (카테고리별)
   * @returns SVG 텍스트 레이어 문자열
   *
   * @private
   */
  private createTextSvg(title: string, accentColor: string): string {
    // 제목 줄바꿈 처리 (여백 고려하여 25자마다)
    const maxCharsPerLine = 25;
    const titleLines = this.wrapText(title, maxCharsPerLine);

    const lineHeight = 65;
    const startY = 280;
    const leftMargin = 120;
    const rightMargin = 100; // 우측 여백 확보

    // SVG 텍스트 생성
    let textElements = '';

    // 상단 악센트 바 (BBC 스타일)
    textElements += `
      <rect x="80" y="60" width="8" height="80" fill="${accentColor}" />
    `;

    // YBC News 로고 (악센트 바 우측)
    textElements += `
      <text x="110" y="110"
            font-size="32"
            text-anchor="start"
            fill="white"
            font-weight="700"
            font-family="system-ui, -apple-system, sans-serif"
            letter-spacing="1">
        YBC News
      </text>
    `;

    // 제목 (좌측 정렬, 여백 내에서 깔끔한 타이포그래피)
    titleLines.forEach((line, index) => {
      const y = startY + (index * lineHeight);
      // 줄 수에 따라 폰트 크기 조정 (여백 고려)
      let fontSize = 58;
      if (titleLines.length > 2) {
        fontSize = 50;
      }
      if (titleLines.length > 3) {
        fontSize = 45;
      }

      textElements += `
        <text x="${leftMargin}" y="${y}"
              font-size="${fontSize}"
              text-anchor="start"
              fill="white"
              font-weight="600"
              font-family="system-ui, -apple-system, sans-serif">
          ${this.escapeXml(line)}
        </text>
      `;
    });

    return `
      <svg width="${this.width}" height="${this.height}">
        ${textElements}
      </svg>
    `;
  }

  /**
   * 텍스트 자동 줄바꿈 처리
   *
   * 지정된 최대 문자 수에 맞춰 텍스트를 여러 줄로 나눕니다.
   * 단어 단위로 나누며, 최대 3줄로 제한합니다.
   *
   * 처리 로직:
   * 1. 공백 기준으로 단어 분리
   * 2. 각 단어를 현재 줄에 추가
   * 3. 최대 문자 수 초과 시 다음 줄로 이동
   * 4. 최대 3줄까지만 반환
   *
   * @param text - 원본 텍스트
   * @param maxChars - 줄당 최대 문자 수
   * @returns 줄바꿈 처리된 텍스트 배열
   *
   * @private
   */
  private wrapText(text: string, maxChars: number): string[] {
    const lines: string[] = [];
    let currentLine = '';

    const words = text.split(' ');
    for (const word of words) {
      if ((currentLine + word).length > maxChars) {
        if (currentLine) {
          lines.push(currentLine.trim());
        }
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    // 최대 3줄로 제한
    return lines.slice(0, 3);
  }

  /**
   * XML 특수문자 이스케이프
   *
   * SVG에서 사용될 텍스트의 특수문자를 이스케이프 처리합니다.
   * XML 구문 오류를 방지하기 위해 필수적입니다.
   *
   * 이스케이프 대상:
   * - & → &amp;
   * - < → &lt;
   * - > → &gt;
   * - " → &quot;
   * - ' → &apos;
   *
   * @param text - 원본 텍스트
   * @returns 이스케이프 처리된 텍스트
   *
   * @private
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * 썸네일 파일 삭제
   *
   * 생성된 썸네일 파일을 임시 디렉토리에서 삭제합니다.
   * YouTube 업로드 완료 후 불필요한 파일을 정리하는 데 사용됩니다.
   *
   * @param filepath - 삭제할 썸네일 파일 경로
   * @returns Promise<void>
   *
   * @example
   * ```typescript
   * await thumbnailService.deleteThumbnail('./temp/thumbnail_1234567890.jpg');
   * ```
   */
  async deleteThumbnail(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted thumbnail: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete thumbnail ${filepath}:`, error.message);
    }
  }
}
