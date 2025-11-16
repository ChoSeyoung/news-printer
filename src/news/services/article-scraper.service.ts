import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface ArticleData {
  content: string;
  imageUrls: string[];
}

@Injectable()
export class ArticleScraperService {
  private readonly logger = new Logger(ArticleScraperService.name);
  private readonly timeout = 10000;
  private readonly maxConcurrent = 5;

  /**
   * Fetch full article content and images from a Chosun.com article URL
   * @param url - Article URL
   * @returns Article data with content and image URLs
   */
  async fetchArticleContent(url: string): Promise<ArticleData> {
    try {
      this.logger.debug(`Fetching article content from: ${url}`);

      const html = await this.fetchHtml(url);
      const articleData = this.parseArticleContent(html);

      if (!articleData.content || articleData.content.length === 0) {
        this.logger.warn(`No content found for URL: ${url}`);
        return { content: '', imageUrls: [] };
      }

      this.logger.debug(`Successfully fetched ${articleData.content.length} characters and ${articleData.imageUrls.length} images from ${url}`);
      return articleData;
    } catch (error) {
      this.logger.error(`Failed to fetch article content from ${url}:`, error.message);
      return { content: '', imageUrls: [] };
    }
  }

  /**
   * Fetch multiple articles in parallel with concurrency limit
   * @param urls - Array of article URLs
   * @returns Array of article data (same order as input)
   */
  async fetchMultipleArticles(urls: string[]): Promise<ArticleData[]> {
    const results: ArticleData[] = new Array(urls.length).fill(null).map(() => ({ content: '', imageUrls: [] }));

    // Process in batches to limit concurrent requests
    for (let i = 0; i < urls.length; i += this.maxConcurrent) {
      const batch = urls.slice(i, i + this.maxConcurrent);
      const batchResults = await Promise.all(
        batch.map((url) => this.fetchArticleContent(url)),
      );

      // Store results in correct positions
      batchResults.forEach((articleData, index) => {
        results[i + index] = articleData;
      });
    }

    return results;
  }

  /**
   * Fetch HTML content from URL
   * @param url - URL to fetch
   * @returns HTML string
   */
  private async fetchHtml(url: string): Promise<string> {
    const response = await axios.get(url, {
      timeout: this.timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    return response.data;
  }

  /**
   * Parse article content from HTML
   * Method 1 (Primary): Extract Fusion.globalContent from JavaScript
   * Method 2 (Fallback): Extract text from <p class="article-body__content-text">
   * @param html - HTML string
   * @returns Article data with content and image URLs
   */
  private parseArticleContent(html: string): ArticleData {
    // Method 1: Try to extract Fusion.globalContent from JavaScript
    const fusionData = this.extractFusionGlobalContent(html);
    if (fusionData.content) {
      this.logger.debug('Successfully extracted content from Fusion.globalContent');
      return fusionData;
    }

    // Method 2: Fallback to cheerio HTML parsing
    this.logger.debug('Fusion.globalContent not found, falling back to HTML parsing');
    return this.parseHtmlContent(html);
  }

  /**
   * Extract article content and images from Fusion.globalContent JavaScript object
   * @param html - HTML string
   * @returns Article data with content and image URLs
   */
  private extractFusionGlobalContent(html: string): ArticleData {
    try {
      // Regex to match: Fusion.globalContent = {...};
      const regex = /Fusion\.globalContent\s*=\s*(\{[\s\S]*?\});/;
      const match = html.match(regex);

      if (!match || !match[1]) {
        return { content: '', imageUrls: [] };
      }

      // Parse JSON
      const globalContent = JSON.parse(match[1]);

      // Extract content from content_elements array
      if (!Array.isArray(globalContent.content_elements)) {
        return { content: '', imageUrls: [] };
      }

      const contentParts: string[] = [];
      const imageUrls: string[] = [];

      globalContent.content_elements.forEach((item: any) => {
        // Extract text content
        if (item.type === 'text' && item.content) {
          const cleanContent = this.removeEscapeCharacters(item.content.trim());
          if (cleanContent) {
            contentParts.push(cleanContent);
          }
        }

        // Extract image URLs (skip GIFs as FFmpeg doesn't handle them well with -loop option)
        if (item.type === 'image' && item.url) {
          const urlLower = item.url.toLowerCase();
          if (!urlLower.endsWith('.gif')) {
            imageUrls.push(item.url);
            this.logger.debug(`Extracted image URL: ${item.url}`);
          } else {
            this.logger.debug(`Skipped GIF image: ${item.url}`);
          }
        }
      });

      this.logger.debug(`Extracted ${contentParts.length} text parts and ${imageUrls.length} images from Fusion.globalContent`);

      return {
        content: contentParts.join('\n\n'),
        imageUrls,
      };
    } catch (error) {
      this.logger.warn('Failed to parse Fusion.globalContent:', error.message);
      return { content: '', imageUrls: [] };
    }
  }

  /**
   * Parse article content from HTML using cheerio (fallback method)
   * Extracts text from <p class="article-body__content-text">
   * @param html - HTML string
   * @returns Article data with content (no images in fallback mode)
   */
  private parseHtmlContent(html: string): ArticleData {
    const $ = cheerio.load(html);

    // Find all paragraphs with article-body__content-text class
    const paragraphs: string[] = [];

    $('.article-body__content-text').each((_, element) => {
      const text = this.removeEscapeCharacters($(element).text().trim());
      if (text) {
        paragraphs.push(text);
      }
    });

    if (paragraphs.length === 0) {
      this.logger.debug('No paragraphs found with .article-body__content-text class');
      return { content: '', imageUrls: [] };
    }

    // Join paragraphs with double newline
    return {
      content: paragraphs.join('\n\n'),
      imageUrls: [], // Fallback method doesn't extract images
    };
  }

  /**
   * Remove escape characters from content
   * @param content - Content string with potential escape characters
   * @returns Cleaned content string
   */
  private removeEscapeCharacters(content: string): string {
    return content
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
  }
}
