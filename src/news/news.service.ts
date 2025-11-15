import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import { NewsItemDto } from './dto/news-item.dto';
import { RssFeed, RssItem } from './interfaces/rss-feed.interface';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly baseUrl = 'https://www.chosun.com/arc/outboundfeeds/rss/category';
  private readonly timeout = 10000;

  async fetchNews(category: string = 'politics', limit: number = 10): Promise<NewsItemDto[]> {
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

      return newsItems.slice(0, limit);
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

      return items
        .filter((item) => item && item.title && item.link)
        .map((item: RssItem) => this.mapToNewsItemDto(item, category));
    } catch (error) {
      this.logger.error('Failed to extract news items', error);
      throw new HttpException(
        'Failed to extract news items',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private mapToNewsItemDto(item: RssItem, category: string): NewsItemDto {
    return {
      title: this.cleanText(item.title),
      link: item.link,
      description: item.description ? this.cleanText(item.description) : '',
      pubDate: item.pubDate || new Date().toISOString(),
      category: category,
      guid: item.guid || item.link,
    };
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
