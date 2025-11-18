import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs-extra';

/**
 * 텍스트 강조 효과 옵션 인터페이스
 */
export interface TextEmphasisOptions {
  /** 강조할 텍스트 */
  text: string;
  /** 텍스트 X 좌표 (px) */
  x: number;
  /** 텍스트 Y 좌표 (px) */
  y: number;
  /** 폰트 크기 (px, 기본: 48) */
  fontSize?: number;
  /** 폰트 패밀리 (기본: 'NanumGothic Bold') */
  fontFamily?: string;
  /** 텍스트 색상 (기본: '#FFFFFF') */
  textColor?: string;
  /** 강조 효과 타입 */
  emphasisType: 'highlight' | 'shadow' | 'underline' | 'all';
  /** 하이라이트 배경 색상 (기본: '#FF0000') */
  highlightColor?: string;
  /** 그림자 색상 (기본: '#000000') */
  shadowColor?: string;
  /** 밑줄 색상 (기본: '#FFFF00') */
  underlineColor?: string;
  /** 그림자 오프셋 (px, 기본: 4) */
  shadowOffset?: number;
  /** 밑줄 두께 (px, 기본: 4) */
  underlineThickness?: number;
}

/**
 * 썸네일 텍스트 강조 서비스
 *
 * Sharp 라이브러리를 사용하여 썸네일 이미지에 텍스트 강조 효과를 추가합니다.
 * CTR 향상을 위해 다음과 같은 효과를 제공합니다:
 *
 * 1. **Highlight (형광펜 효과)**: 텍스트 배경에 색상 박스
 * 2. **Shadow (그림자 효과)**: 텍스트에 그림자 추가하여 가독성 향상
 * 3. **Underline (밑줄 효과)**: 텍스트 하단에 강조 밑줄
 * 4. **All (전체 효과)**: 위 3가지 효과 모두 적용
 *
 * YouTube 썸네일 최적화 가이드:
 * - 해상도: 1280x720 (16:9 비율)
 * - 파일 크기: 2MB 이하
 * - 폰트 크기: 최소 30px (모바일 가독성)
 * - 텍스트 길이: 최대 15자 권장
 *
 * @example
 * ```typescript
 * const thumbnailPath = await graphicsService.addTextEmphasis(
 *   './input.jpg',
 *   {
 *     text: '긴급 속보',
 *     x: 640,
 *     y: 360,
 *     fontSize: 72,
 *     emphasisType: 'all',
 *     highlightColor: '#FF0000',
 *   }
 * );
 * ```
 */
@Injectable()
export class GraphicsService {
  private readonly logger = new Logger(GraphicsService.name);
  /** 임시 파일 저장 디렉토리 */
  private readonly tempDir = './temp';

  /**
   * GraphicsService 생성자
   *
   * 임시 디렉토리를 생성합니다.
   */
  constructor() {
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * 썸네일 이미지에 텍스트 강조 효과 추가
   *
   * 처리 단계:
   * 1. 원본 이미지 로드
   * 2. SVG 텍스트 오버레이 생성 (효과 포함)
   * 3. Sharp composite로 이미지 합성
   * 4. 최적화된 썸네일로 저장
   *
   * @param imagePath - 원본 이미지 경로
   * @param options - 텍스트 강조 옵션
   * @returns 처리된 썸네일 이미지 경로
   *
   * @example
   * ```typescript
   * const thumbnail = await graphicsService.addTextEmphasis(
   *   './original.jpg',
   *   {
   *     text: '핵심 뉴스',
   *     x: 640,
   *     y: 360,
   *     fontSize: 60,
   *     emphasisType: 'highlight',
   *     highlightColor: '#FF0000'
   *   }
   * );
   * ```
   */
  async addTextEmphasis(
    imagePath: string,
    options: TextEmphasisOptions,
  ): Promise<string> {
    try {
      this.logger.log(`Adding text emphasis to ${imagePath}`);

      // 기본값 설정
      const fontSize = options.fontSize || 48;
      const fontFamily = options.fontFamily || 'NanumGothic Bold';
      const textColor = options.textColor || '#FFFFFF';
      const highlightColor = options.highlightColor || '#FF0000';
      const shadowColor = options.shadowColor || '#000000';
      const underlineColor = options.underlineColor || '#FFFF00';
      const shadowOffset = options.shadowOffset || 4;
      const underlineThickness = options.underlineThickness || 4;

      // 이미지 메타데이터 가져오기
      const imageMetadata = await sharp(imagePath).metadata();
      const imageWidth = imageMetadata.width || 1280;
      const imageHeight = imageMetadata.height || 720;

      // SVG 오버레이 생성
      const svgOverlay = this.generateSvgOverlay({
        text: options.text,
        x: options.x,
        y: options.y,
        fontSize,
        fontFamily,
        textColor,
        emphasisType: options.emphasisType,
        highlightColor,
        shadowColor,
        underlineColor,
        shadowOffset,
        underlineThickness,
        imageWidth,
        imageHeight,
      });

      // 출력 파일 경로
      const outputPath = path.join(
        this.tempDir,
        `thumbnail_emphasized_${Date.now()}.jpg`,
      );

      // Sharp를 사용하여 텍스트 오버레이 합성
      await sharp(imagePath)
        .composite([
          {
            input: Buffer.from(svgOverlay),
            top: 0,
            left: 0,
          },
        ])
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      this.logger.log(`Text emphasis added: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to add text emphasis:', error.message);
      throw error;
    }
  }

  /**
   * 여러 텍스트 강조 효과를 한 이미지에 추가
   *
   * 하나의 썸네일에 여러 텍스트 강조를 적용할 때 사용합니다.
   * 예: 상단에 "긴급", 하단에 "속보" 등
   *
   * @param imagePath - 원본 이미지 경로
   * @param textOptions - 텍스트 강조 옵션 배열
   * @returns 처리된 썸네일 이미지 경로
   *
   * @example
   * ```typescript
   * const thumbnail = await graphicsService.addMultipleTextEmphasis(
   *   './original.jpg',
   *   [
   *     { text: '긴급', x: 100, y: 100, emphasisType: 'highlight' },
   *     { text: '속보', x: 1100, y: 100, emphasisType: 'shadow' }
   *   ]
   * );
   * ```
   */
  async addMultipleTextEmphasis(
    imagePath: string,
    textOptions: TextEmphasisOptions[],
  ): Promise<string> {
    try {
      this.logger.log(
        `Adding ${textOptions.length} text emphasis effects to ${imagePath}`,
      );

      // 이미지 메타데이터
      const imageMetadata = await sharp(imagePath).metadata();
      const imageWidth = imageMetadata.width || 1280;
      const imageHeight = imageMetadata.height || 720;

      // 모든 텍스트에 대한 SVG 오버레이 생성
      const svgElements: string[] = [];

      for (const options of textOptions) {
        const fontSize = options.fontSize || 48;
        const fontFamily = options.fontFamily || 'NanumGothic Bold';
        const textColor = options.textColor || '#FFFFFF';
        const highlightColor = options.highlightColor || '#FF0000';
        const shadowColor = options.shadowColor || '#000000';
        const underlineColor = options.underlineColor || '#FFFF00';
        const shadowOffset = options.shadowOffset || 4;
        const underlineThickness = options.underlineThickness || 4;

        const svgElement = this.generateSvgElement({
          text: options.text,
          x: options.x,
          y: options.y,
          fontSize,
          fontFamily,
          textColor,
          emphasisType: options.emphasisType,
          highlightColor,
          shadowColor,
          underlineColor,
          shadowOffset,
          underlineThickness,
        });

        svgElements.push(svgElement);
      }

      // 전체 SVG 오버레이 조합
      const combinedSvg = `
        <svg width="${imageWidth}" height="${imageHeight}">
          ${svgElements.join('\n')}
        </svg>
      `;

      // 출력 파일 경로
      const outputPath = path.join(
        this.tempDir,
        `thumbnail_multi_${Date.now()}.jpg`,
      );

      // Sharp를 사용하여 합성
      await sharp(imagePath)
        .composite([
          {
            input: Buffer.from(combinedSvg),
            top: 0,
            left: 0,
          },
        ])
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      this.logger.log(`Multiple text emphasis added: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to add multiple text emphasis:', error.message);
      throw error;
    }
  }

  /**
   * SVG 오버레이 생성 (단일 텍스트)
   *
   * @private
   */
  private generateSvgOverlay(params: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    textColor: string;
    emphasisType: 'highlight' | 'shadow' | 'underline' | 'all';
    highlightColor: string;
    shadowColor: string;
    underlineColor: string;
    shadowOffset: number;
    underlineThickness: number;
    imageWidth: number;
    imageHeight: number;
  }): string {
    const svgElement = this.generateSvgElement(params);

    return `
      <svg width="${params.imageWidth}" height="${params.imageHeight}">
        ${svgElement}
      </svg>
    `;
  }

  /**
   * SVG 텍스트 요소 생성 (효과 포함)
   *
   * @private
   */
  private generateSvgElement(params: {
    text: string;
    x: number;
    y: number;
    fontSize: number;
    fontFamily: string;
    textColor: string;
    emphasisType: 'highlight' | 'shadow' | 'underline' | 'all';
    highlightColor: string;
    shadowColor: string;
    underlineColor: string;
    shadowOffset: number;
    underlineThickness: number;
  }): string {
    const {
      text,
      x,
      y,
      fontSize,
      fontFamily,
      textColor,
      emphasisType,
      highlightColor,
      shadowColor,
      underlineColor,
      shadowOffset,
      underlineThickness,
    } = params;

    // 텍스트 너비 추정 (대략적, 정확도는 낮음)
    const estimatedTextWidth = text.length * fontSize * 0.6;
    const padding = 10;

    let svgElements = '';

    // 1. Highlight (배경 박스)
    if (emphasisType === 'highlight' || emphasisType === 'all') {
      svgElements += `
        <rect
          x="${x - padding}"
          y="${y - fontSize + padding}"
          width="${estimatedTextWidth + padding * 2}"
          height="${fontSize + padding}"
          fill="${highlightColor}"
          opacity="0.8"
        />
      `;
    }

    // 2. Shadow (그림자 텍스트)
    if (emphasisType === 'shadow' || emphasisType === 'all') {
      svgElements += `
        <text
          x="${x + shadowOffset}"
          y="${y + shadowOffset}"
          font-family="${fontFamily}"
          font-size="${fontSize}"
          fill="${shadowColor}"
          opacity="0.6"
        >${text}</text>
      `;
    }

    // 3. Underline (밑줄)
    if (emphasisType === 'underline' || emphasisType === 'all') {
      svgElements += `
        <line
          x1="${x}"
          y1="${y + 5}"
          x2="${x + estimatedTextWidth}"
          y2="${y + 5}"
          stroke="${underlineColor}"
          stroke-width="${underlineThickness}"
        />
      `;
    }

    // 4. 메인 텍스트
    svgElements += `
      <text
        x="${x}"
        y="${y}"
        font-family="${fontFamily}"
        font-size="${fontSize}"
        fill="${textColor}"
        font-weight="bold"
      >${text}</text>
    `;

    return svgElements;
  }

  /**
   * 썸네일 이미지 크기 조정 및 최적화
   *
   * YouTube 썸네일 권장 사양에 맞춰 이미지를 최적화합니다.
   * - 해상도: 1280x720 (16:9)
   * - 파일 크기: 2MB 이하
   * - 형식: JPEG
   *
   * @param imagePath - 원본 이미지 경로
   * @param width - 목표 너비 (기본: 1280)
   * @param height - 목표 높이 (기본: 720)
   * @returns 최적화된 썸네일 경로
   *
   * @example
   * ```typescript
   * const optimized = await graphicsService.optimizeThumbnail('./large.jpg');
   * ```
   */
  async optimizeThumbnail(
    imagePath: string,
    width = 1280,
    height = 720,
  ): Promise<string> {
    try {
      this.logger.log(`Optimizing thumbnail: ${imagePath}`);

      const outputPath = path.join(
        this.tempDir,
        `thumbnail_optimized_${Date.now()}.jpg`,
      );

      await sharp(imagePath)
        .resize(width, height, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);

      this.logger.log(`Thumbnail optimized: ${outputPath}`);
      return outputPath;
    } catch (error) {
      this.logger.error('Failed to optimize thumbnail:', error.message);
      throw error;
    }
  }

  /**
   * 임시 파일 삭제
   *
   * @param filepath - 삭제할 파일 경로
   */
  async deleteFile(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete file ${filepath}:`, error.message);
    }
  }
}
