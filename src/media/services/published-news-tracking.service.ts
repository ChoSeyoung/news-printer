import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface PublishedNewsRecord {
  url: string;
  title: string;
  publishedAt: string;
  videoId?: string;
  videoUrl?: string;
}

@Injectable()
export class PublishedNewsTrackingService {
  private readonly logger = new Logger(PublishedNewsTrackingService.name);
  private readonly trackingFilePath: string;
  private publishedNews: Map<string, PublishedNewsRecord>;

  constructor() {
    this.trackingFilePath = path.join(process.cwd(), 'temp', 'published-news.json');
    this.publishedNews = new Map();
    this.loadPublishedNews();
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
   * @returns true if already published
   */
  isAlreadyPublished(url: string): boolean {
    return this.publishedNews.has(url);
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
   * @param videoId - YouTube video ID (optional)
   * @param videoUrl - YouTube video URL (optional)
   */
  async markAsPublished(
    url: string,
    title: string,
    videoId?: string,
    videoUrl?: string,
  ): Promise<void> {
    try {
      const record: PublishedNewsRecord = {
        url,
        title,
        publishedAt: new Date().toISOString(),
        videoId,
        videoUrl,
      };

      this.publishedNews.set(url, record);
      await this.savePublishedNews();

      this.logger.log(`Marked as published: ${title}`);
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
