import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class ArticleScraperService {
  private readonly logger = new Logger(ArticleScraperService.name);
  private readonly timeout = 10000;
  private readonly maxConcurrent = 5;

  /**
   * Fetch full article content from a Chosun.com article URL
   * @param url - Article URL
   * @returns Full article content as string
   */
  async fetchArticleContent(url: string): Promise<string> {
    try {
      this.logger.debug(`Fetching article content from: ${url}`);

      const html = await this.fetchHtml(url);
      const content = this.parseArticleContent(html);

      if (!content || content.length === 0) {
        this.logger.warn(`No content found for URL: ${url}`);
        return '';
      }

      this.logger.debug(`Successfully fetched ${content.length} characters from ${url}`);
      return content;
    } catch (error) {
      this.logger.error(`Failed to fetch article content from ${url}:`, error.message);
      return '';
    }
  }

  /**
   * Fetch multiple articles in parallel with concurrency limit
   * @param urls - Array of article URLs
   * @returns Array of article contents (same order as input)
   */
  async fetchMultipleArticles(urls: string[]): Promise<string[]> {
    const results: string[] = new Array(urls.length).fill('');

    // Process in batches to limit concurrent requests
    for (let i = 0; i < urls.length; i += this.maxConcurrent) {
      const batch = urls.slice(i, i + this.maxConcurrent);
      const batchResults = await Promise.all(
        batch.map((url) => this.fetchArticleContent(url)),
      );

      // Store results in correct positions
      batchResults.forEach((content, index) => {
        results[i + index] = content;
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
   * @returns Article content as string
   */
  private parseArticleContent(html: string): string {
    // Method 1: Try to extract Fusion.globalContent from JavaScript
    const fusionContent = this.extractFusionGlobalContent(html);
    if (fusionContent) {
      this.logger.debug('Successfully extracted content from Fusion.globalContent');
      return fusionContent;
    }

    // Method 2: Fallback to cheerio HTML parsing
    this.logger.debug('Fusion.globalContent not found, falling back to HTML parsing');
    return this.parseHtmlContent(html);
  }

  /**
   * Extract article content from Fusion.globalContent JavaScript object
   * @param html - HTML string
   * @returns Article content or empty string if not found
   */
  private extractFusionGlobalContent(html: string): string {
    try {
      // Regex to match: Fusion.globalContent = {...};
      const regex = /Fusion\.globalContent\s*=\s*(\{[\s\S]*?\});/;
      const match = html.match(regex);

      if (!match || !match[1]) {
        return '';
      }

      // Parse JSON
      const globalContent = JSON.parse(match[1]);

      // Extract content from content_elements array
      if (!Array.isArray(globalContent.content_elements)) {
        return '';
      }

      const contentParts: string[] = [];
      globalContent.content_elements.forEach((item: any) => {
        // Only include items with type "text" and non-empty content
        if (item.type === 'text' && item.content) {
          const cleanContent = this.removeEscapeCharacters(item.content.trim());
          if (cleanContent) {
            contentParts.push(cleanContent);
          }
        }
      });

      return contentParts.join('\n\n');
    } catch (error) {
      this.logger.warn('Failed to parse Fusion.globalContent:', error.message);
      return '';
    }
  }

  /**
   * Parse article content from HTML using cheerio (fallback method)
   * Extracts text from <p class="article-body__content-text">
   * @param html - HTML string
   * @returns Article content as string
   */
  private parseHtmlContent(html: string): string {
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
      return '';
    }

    // Join paragraphs with double newline
    return paragraphs.join('\n\n');
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
