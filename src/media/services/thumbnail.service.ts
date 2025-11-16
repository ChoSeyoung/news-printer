import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ThumbnailOptions {
  title: string;
  category: string;
  date?: Date;
  imageUrl?: string;
}

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly tempDir = './temp';
  private readonly width = 1280;
  private readonly height = 720;

  // 카테고리별 색상 테마
  private readonly categoryColors: Record<string, { start: string; end: string; emoji: string }> = {
    '정치': { start: '#2563eb', end: '#1e40af', emoji: '🏛️' },
    '경제': { start: '#059669', end: '#047857', emoji: '💰' },
    '사회': { start: '#dc2626', end: '#b91c1c', emoji: '👥' },
    '국제': { start: '#7c3aed', end: '#6d28d9', emoji: '🌍' },
    '과학기술': { start: '#ea580c', end: '#c2410c', emoji: '💻' },
    '문화': { start: '#db2777', end: '#be185d', emoji: '🎭' },
    '스포츠': { start: '#0891b2', end: '#0e7490', emoji: '⚽' },
    default: { start: '#1f2937', end: '#111827', emoji: '📢' },
  };

  constructor() {
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * 썸네일 자동 생성
   */
  async generateThumbnail(options: ThumbnailOptions): Promise<string> {
    try {
      this.logger.log(`Generating thumbnail for: ${options.title}`);

      const outputPath = path.join(
        this.tempDir,
        `thumbnail_${Date.now()}.jpg`,
      );

      // 카테고리별 색상 가져오기
      const colors = this.categoryColors[options.category] || this.categoryColors.default;

      // 배경 생성
      const background = await this.createBackground(colors.start, colors.end);

      // 텍스트 SVG 생성
      const textSvg = this.createTextSvg(options.title, options.date, colors.emoji);

      // 배경 + 텍스트 합성
      await sharp(background)
        .composite([
          {
            input: Buffer.from(textSvg),
            top: 0,
            left: 0,
          },
        ])
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
   * 그라데이션 배경 생성
   */
  private async createBackground(startColor: string, endColor: string): Promise<Buffer> {
    // SVG 그라데이션 배경
    const svg = `
      <svg width="${this.width}" height="${this.height}">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${startColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${endColor};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="${this.width}" height="${this.height}" fill="url(#grad)" />
      </svg>
    `;

    return sharp(Buffer.from(svg))
      .png()
      .toBuffer();
  }

  /**
   * 텍스트 SVG 오버레이 생성
   */
  private createTextSvg(title: string, date: Date = new Date(), emoji: string): string {
    // 제목 줄바꿈 처리 (40자마다)
    const maxCharsPerLine = 35;
    const titleLines = this.wrapText(title, maxCharsPerLine);

    // 날짜 포맷
    const dateStr = `${date.getMonth() + 1}월 ${date.getDate()}일 ${date.getHours()}시`;

    // 텍스트 위치 계산
    const startY = 150;
    const lineHeight = 100;

    // SVG 텍스트 생성
    let textElements = '';

    // 날짜/시간 (상단) - emoji 제거하고 날짜만 표시
    textElements += `
      <text x="640" y="150"
            font-size="48"
            text-anchor="middle"
            fill="#fbbf24"
            font-weight="bold">
        ${dateStr} 속보
      </text>
    `;

    // 제목 (중앙, 여러 줄)
    titleLines.forEach((line, index) => {
      const y = 300 + (index * lineHeight);
      const fontSize = titleLines.length > 2 ? 60 : 70;

      textElements += `
        <text x="640" y="${y}"
              font-size="${fontSize}"
              text-anchor="middle"
              fill="white"
              font-weight="bold"
              stroke="black"
              stroke-width="3">
          ${this.escapeXml(line)}
        </text>
      `;
    });

    // "뉴스프린터" 브랜딩 (하단)
    textElements += `
      <text x="640" y="650"
            font-size="36"
            text-anchor="middle"
            fill="#d1d5db"
            font-weight="bold">
        AI 뉴스프린터
      </text>
    `;

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
