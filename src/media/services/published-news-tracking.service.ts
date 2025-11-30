import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface PublishedNewsRecord {
  url: string;
  title: string;
  publishedAt: string;
  longform?: {
    videoId: string;
    videoUrl: string;
    uploadedAt: string;
  };
  shortform?: {
    videoId: string;
    videoUrl: string;
    uploadedAt: string;
  };
}

@Injectable()
export class PublishedNewsTrackingService {
  private readonly logger = new Logger(PublishedNewsTrackingService.name);
  private readonly trackingFilePath: string;
  private publishedNews: Map<string, PublishedNewsRecord>;
  private publishedTitles: Set<string>; // 정규화된 제목 인덱스

  constructor() {
    this.trackingFilePath = path.join(process.cwd(), 'temp', 'published-news.json');
    this.publishedNews = new Map();
    this.publishedTitles = new Set();
    this.loadPublishedNews();
  }

  /**
   * 제목 정규화 (비교용)
   * - 접두사 제거 ([속보], [단독] 등)
   * - 특수문자 및 공백 정규화
   * - 소문자 변환
   */
  private normalizeTitle(title: string): string {
    return title
      .replace(/^\[.*?\]\s*/g, '') // [속보], [단독] 등 접두사 제거
      .replace(/[^\w가-힣]/g, '') // 특수문자 제거
      .toLowerCase()
      .trim();
  }

  /**
   * Load published news records from file
   */
  private async loadPublishedNews(): Promise<void> {
    try {
      // Ensure temp directory exists
      await fs.ensureDir(path.dirname(this.trackingFilePath));

      if (await fs.pathExists(this.trackingFilePath)) {
        const data = await fs.readJson(this.trackingFilePath);

        if (Array.isArray(data)) {
          data.forEach((record: PublishedNewsRecord) => {
            this.publishedNews.set(record.url, record);
            // 제목 인덱스에도 추가
            if (record.title) {
              this.publishedTitles.add(this.normalizeTitle(record.title));
            }
          });
          this.logger.log(`Loaded ${this.publishedNews.size} published news records`);
        }
      } else {
        this.logger.log('No existing published news records found, starting fresh');
      }
    } catch (error) {
      this.logger.error('Failed to load published news records:', error.message);
      this.publishedNews = new Map();
    }
  }

  /**
   * Save published news records to file
   */
  private async savePublishedNews(): Promise<void> {
    try {
      const records = Array.from(this.publishedNews.values());
      await fs.writeJson(this.trackingFilePath, records, { spaces: 2 });
      this.logger.debug(`Saved ${records.length} published news records`);
    } catch (error) {
      this.logger.error('Failed to save published news records:', error.message);
    }
  }

  /**
   * Check if a news article has already been published
   * @param url - News article URL
   * @param title - News title (optional, for duplicate title check)
   * @returns true if already published (by URL or similar title)
   */
  isAlreadyPublished(url: string, title?: string): boolean {
    // URL 체크
    if (this.publishedNews.has(url)) {
      return true;
    }

    // 제목 체크 (제목이 제공된 경우)
    if (title) {
      const normalizedTitle = this.normalizeTitle(title);
      if (this.publishedTitles.has(normalizedTitle)) {
        this.logger.debug(`Duplicate title detected: ${title}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Get published news record
   * @param url - News article URL
   * @returns Published news record or undefined
   */
  getPublishedRecord(url: string): PublishedNewsRecord | undefined {
    return this.publishedNews.get(url);
  }

  /**
   * Mark a news article as published
   * @param url - News article URL
   * @param title - News title
   * @param videoType - 'longform' or 'shortform'
   * @param videoId - YouTube video ID
   * @param videoUrl - YouTube video URL
   */
  async markAsPublished(
    url: string,
    title: string,
    videoType: 'longform' | 'shortform',
    videoId: string,
    videoUrl: string,
  ): Promise<void> {
    try {
      // 기존 레코드 가져오기 또는 새로 생성
      let record = this.publishedNews.get(url);

      if (!record) {
        record = {
          url,
          title,
          publishedAt: new Date().toISOString(),
        };
      }

      // 비디오 타입에 따라 정보 업데이트
      const videoInfo = {
        videoId,
        videoUrl,
        uploadedAt: new Date().toISOString(),
      };

      if (videoType === 'longform') {
        record.longform = videoInfo;
      } else {
        record.shortform = videoInfo;
      }

      this.publishedNews.set(url, record);

      // 제목 인덱스에도 추가 (처음 등록 시에만)
      if (title && !this.publishedTitles.has(this.normalizeTitle(title))) {
        this.publishedTitles.add(this.normalizeTitle(title));
      }

      await this.savePublishedNews();

      this.logger.log(`Marked as published (${videoType}): ${title}`);
    } catch (error) {
      this.logger.error('Failed to mark as published:', error.message);
    }
  }

  /**
   * Get all published news records
   * @returns Array of published news records
   */
  getAllPublishedRecords(): PublishedNewsRecord[] {
    return Array.from(this.publishedNews.values());
  }

  /**
   * Get count of published news
   * @returns Number of published news articles
   */
  getPublishedCount(): number {
    return this.publishedNews.size;
  }

  /**
   * Clear all published news records (use with caution)
   */
  async clearAll(): Promise<void> {
    this.publishedNews.clear();
    await this.savePublishedNews();
    this.logger.warn('Cleared all published news records');
  }

  /**
   * Remove old records (older than specified days)
   * @param days - Number of days to keep records
   */
  async removeOldRecords(days: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let removedCount = 0;
      for (const [url, record] of this.publishedNews.entries()) {
        const publishedDate = new Date(record.publishedAt);
        if (publishedDate < cutoffDate) {
          this.publishedNews.delete(url);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        await this.savePublishedNews();
        this.logger.log(`Removed ${removedCount} old records (older than ${days} days)`);
      }
    } catch (error) {
      this.logger.error('Failed to remove old records:', error.message);
    }
  }
}
