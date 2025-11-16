import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ThumbnailOptions {
  title: string;
  category: string;
  date?: Date;
  imageUrl?: string;
  backgroundImagePath?: string; // Path to background image file
}

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly tempDir = './temp';
  private readonly width = 1280;
  private readonly height = 720;

  // BBC 스타일 카테고리별 색상 테마 (단색 배경)
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

  constructor() {
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * BBC 스타일 썸네일 자동 생성
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

      // 배경 이미지가 있으면 검정색 반투명 오버레이 추가
      const compositeInputs: Array<{ input: Buffer; top: number; left: number }> = [];

      if (options.backgroundImagePath) {
        // 검정색 반투명 오버레이 (opacity 60%)
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
   */
  private async createImageBackground(imagePath: string): Promise<Buffer> {
    try {
      // 이미지를 썸네일 크기로 리사이즈하고 크롭
      return await sharp(imagePath)
        .resize(this.width, this.height, {
          fit: 'cover',
          position: 'center',
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
   * 검정색 반투명 오버레이 생성 (텍스트 가독성 향상)
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
   * 텍스트 줄바꿈 처리
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
