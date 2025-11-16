import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import { NewsItemDto } from './dto/news-item.dto';
import { RssFeed, RssItem } from './interfaces/rss-feed.interface';
import { ArticleScraperService } from './services/article-scraper.service';
import { GeminiService } from './services/gemini.service';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly baseUrl = 'https://www.chosun.com/arc/outboundfeeds/rss/category';
  private readonly timeout = 10000;

  constructor(
    private readonly articleScraper: ArticleScraperService,
    private readonly geminiService: GeminiService,
  ) {}

  async fetchNews(
    category: string = 'politics',
    limit: number = 10,
    includeFullContent: boolean = false,
  ): Promise<NewsItemDto[]> {
    const rssUrl = `${this.baseUrl}/${category}/?outputType=xml`;

    this.logger.log(`Fetching RSS feed from: ${rssUrl}`);

    try {
      const response = await axios.get(rssUrl, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        },
      });

      const parsedData = await this.parseXmlToJson(response.data);
      const newsItems = this.extractNewsItems(parsedData, category);
      const limitedItems = newsItems.slice(0, limit);

      // Fetch full content if requested
      if (includeFullContent) {
        this.logger.log(`Fetching full content for ${limitedItems.length} articles`);
        const articleDataList = await this.articleScraper.fetchMultipleArticles(
          limitedItems.map((item) => item.link),
        );

        // Generate AI scripts for articles with content
        for (let i = 0; i < limitedItems.length; i++) {
          const item = limitedItems[i];
          const articleData = articleDataList[i];

          item.fullContent = articleData.content;
          item.imageUrls = articleData.imageUrls;

          // Generate anchor and reporter scripts if content exists
          if (articleData.content && articleData.content.length > 0) {
            this.logger.debug(`Generating scripts for article: ${item.title}`);
            const scripts = await this.geminiService.generateScripts(articleData.content);
            item.anchor = scripts.anchor;
            item.reporter = scripts.reporter;
          }
        }
      }

      return limitedItems;
    } catch (error) {
      this.handleError(error, rssUrl);
    }
  }

  private async parseXmlToJson(xmlData: string): Promise<RssFeed> {
    try {
      const result = await parseStringPromise(xmlData, {
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
      });

      if (!result || !result.rss || !result.rss.channel) {
        throw new Error('Invalid RSS feed structure');
      }

      return result;
    } catch (error) {
      this.logger.error('XML parsing failed', error);
      throw new HttpException(
        'Failed to parse RSS feed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private extractNewsItems(rssFeed: RssFeed, category: string): NewsItemDto[] {
    try {
      const channel = rssFeed.rss.channel;
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];

      if (!items || items.length === 0) {
        this.logger.warn('No items found in RSS feed');
        return [];
      }

      const todayKST = this.getTodayKST();

      return items
        .filter((item) => item && item.title && item.link)
        .map((item: RssItem) => this.mapToNewsItemDto(item, category))
        .filter((newsItem) => this.isTodayKST(newsItem.pubDate, todayKST));
    } catch (error) {
      this.logger.error('Failed to extract news items', error);
      throw new HttpException(
        'Failed to extract news items',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private mapToNewsItemDto(item: RssItem, category: string): NewsItemDto {
    const pubDateKST = this.convertUTCtoKST(item.pubDate);

    return {
      title: this.cleanText(item.title),
      link: item.link,
      description: item.description ? this.cleanText(item.description) : '',
      pubDate: pubDateKST,
      category: category,
      guid: item.guid || item.link,
    };
  }

  /**
   * Convert UTC date string to KST (UTC+9)
   * @param utcDateString - UTC date string from RSS feed
   * @returns ISO string in KST timezone
   */
  private convertUTCtoKST(utcDateString?: string): string {
    try {
      const date = utcDateString ? new Date(utcDateString) : new Date();

      // Convert to KST (UTC+9)
      const kstOffset = 9 * 60; // 9 hours in minutes
      const utcTime = date.getTime();
      const kstTime = new Date(utcTime + kstOffset * 60 * 1000);

      return kstTime.toISOString();
    } catch (error) {
      this.logger.warn(`Failed to parse date: ${utcDateString}, using current time`);
      const now = new Date();
      const kstOffset = 9 * 60;
      const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
      return kstTime.toISOString();
    }
  }

  /**
   * Get today's date in KST timezone (start of day)
   * @returns Date object representing start of today in KST
   */
  private getTodayKST(): Date {
    const now = new Date();
    const kstOffset = 9 * 60; // 9 hours in minutes
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);

    // Get start of day in KST
    const year = kstNow.getUTCFullYear();
    const month = kstNow.getUTCMonth();
    const day = kstNow.getUTCDate();

    return new Date(Date.UTC(year, month, day, -9, 0, 0, 0)); // -9 to adjust back to UTC
  }

  /**
   * Check if the given date is today in KST timezone
   * @param dateString - ISO date string
   * @param todayKST - Start of today in KST
   * @returns true if the date is today in KST
   */
  private isTodayKST(dateString: string, todayKST: Date): boolean {
    try {
      const date = new Date(dateString);
      const kstOffset = 9 * 60;
      const dateKST = new Date(date.getTime());

      const tomorrowKST = new Date(todayKST.getTime() + 24 * 60 * 60 * 1000);

      return dateKST >= todayKST && dateKST < tomorrowKST;
    } catch (error) {
      this.logger.warn(`Failed to check date: ${dateString}`);
      return false;
    }
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  private handleError(error: unknown, url: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      if (axiosError.code === 'ECONNABORTED') {
        this.logger.error(`Request timeout for URL: ${url}`);
        throw new HttpException(
          'Request timeout - RSS feed took too long to respond',
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      if (axiosError.response) {
        this.logger.error(
          `HTTP error ${axiosError.response.status} for URL: ${url}`,
        );
        throw new HttpException(
          `RSS feed returned error: ${axiosError.response.status}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (axiosError.request) {
        this.logger.error(`Network error for URL: ${url}`);
        throw new HttpException(
          'Network error - could not reach RSS feed',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    this.logger.error(`Unexpected error fetching RSS: ${error}`);
    throw new HttpException(
      'Failed to fetch news',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
