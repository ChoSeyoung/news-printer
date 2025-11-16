import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface ImageSearchResult {
  url: string;
  photographer?: string;
  source: 'pexels' | 'unsplash';
}

@Injectable()
export class ImageSearchService {
  private readonly logger = new Logger(ImageSearchService.name);
  private readonly tempDir = './temp';
  private readonly pexelsApiKey: string;
  private readonly unsplashAccessKey: string;

  constructor(private configService: ConfigService) {
    this.pexelsApiKey = this.configService.get<string>('PEXELS_API_KEY') || '';
    this.unsplashAccessKey = this.configService.get<string>('UNSPLASH_ACCESS_KEY') || '';

    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Search for images using keywords with automatic fallback
   * @param keywords - Search keywords (comma-separated)
   * @returns Path to downloaded image
   */
  async searchAndDownloadImage(keywords: string): Promise<string> {
    try {
      this.logger.log(`Searching for image with keywords: ${keywords}`);

      // Try Pexels first
      let imageResult = await this.searchPexels(keywords);

      // Fallback to Unsplash if Pexels fails
      if (!imageResult) {
        this.logger.warn('Pexels search failed, trying Unsplash');
        imageResult = await this.searchUnsplash(keywords);
      }

      // Final fallback: search with generic "news" keyword
      if (!imageResult) {
        this.logger.warn('No results found, trying generic "news" keyword');
        imageResult = await this.searchPexels('news');

        if (!imageResult) {
          imageResult = await this.searchUnsplash('news');
        }
      }

      if (!imageResult) {
        throw new Error('Failed to find any suitable image');
      }

      // Download the image
      const imagePath = await this.downloadImage(imageResult.url);
      this.logger.log(`Image downloaded from ${imageResult.source}: ${imagePath}`);

      return imagePath;
    } catch (error) {
      this.logger.error('Failed to search and download image:', error.message);
      throw error;
    }
  }

  /**
   * Search for images on Pexels
   * @param keywords - Search keywords
   * @returns Image URL or null if failed
   */
  private async searchPexels(keywords: string): Promise<ImageSearchResult | null> {
    if (!this.pexelsApiKey) {
      this.logger.warn('Pexels API key not configured');
      return null;
    }

    try {
      this.logger.debug(`Searching Pexels for: ${keywords}`);

      const response = await axios.get('https://api.pexels.com/v1/search', {
        params: {
          query: keywords,
          per_page: 1,
          orientation: 'landscape',
        },
        headers: {
          Authorization: this.pexelsApiKey,
        },
        timeout: 10000,
      });

      if (response.data.photos && response.data.photos.length > 0) {
        const photo = response.data.photos[0];
        this.logger.debug(`Found image on Pexels: ${photo.photographer}`);

        return {
          url: photo.src.large2x || photo.src.large || photo.src.original,
          photographer: photo.photographer,
          source: 'pexels',
        };
      }

      this.logger.warn('No images found on Pexels');
      return null;
    } catch (error) {
      if (error.response?.status === 429) {
        this.logger.warn('Pexels rate limit exceeded');
      } else {
        this.logger.error('Pexels search error:', error.message);
      }
      return null;
    }
  }

  /**
   * Search for images on Unsplash
   * @param keywords - Search keywords
   * @returns Image URL or null if failed
   */
  private async searchUnsplash(keywords: string): Promise<ImageSearchResult | null> {
    if (!this.unsplashAccessKey) {
      this.logger.warn('Unsplash access key not configured');
      return null;
    }

    try {
      this.logger.debug(`Searching Unsplash for: ${keywords}`);

      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query: keywords,
          per_page: 1,
          orientation: 'landscape',
        },
        headers: {
          Authorization: `Client-ID ${this.unsplashAccessKey}`,
        },
        timeout: 10000,
      });

      if (response.data.results && response.data.results.length > 0) {
        const photo = response.data.results[0];
        this.logger.debug(`Found image on Unsplash: ${photo.user.name}`);

        return {
          url: photo.urls.regular || photo.urls.full,
          photographer: photo.user.name,
          source: 'unsplash',
        };
      }

      this.logger.warn('No images found on Unsplash');
      return null;
    } catch (error) {
      if (error.response?.status === 429) {
        this.logger.warn('Unsplash rate limit exceeded');
      } else {
        this.logger.error('Unsplash search error:', error.message);
      }
      return null;
    }
  }

  /**
   * Download image from URL
   * @param imageUrl - URL of the image to download
   * @returns Path to downloaded image
   */
  private async downloadImage(imageUrl: string): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      const filename = `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
      const filepath = path.join(this.tempDir, filename);

      await fs.writeFile(filepath, response.data);

      this.logger.debug(`Image downloaded: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error('Failed to download image:', error.message);
      throw error;
    }
  }

  /**
   * Delete temporary image file
   * @param filepath - Path to file to delete
   */
  async deleteImageFile(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted image file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete image file ${filepath}:`, error.message);
    }
  }
}
