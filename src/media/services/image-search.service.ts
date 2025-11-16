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
   * Search for multiple images using keywords with automatic fallback
   * @param keywords - Search keywords (comma-separated)
   * @param count - Number of images to download (default: 4)
   * @returns Array of paths to downloaded images
   */
  async searchAndDownloadImages(keywords: string, count: number = 4): Promise<string[]> {
    try {
      this.logger.log(`Searching for ${count} images with keywords: ${keywords}`);

      // Try Pexels first
      let imageResults = await this.searchPexelsMultiple(keywords, count);

      // Fallback to Unsplash if Pexels fails
      if (!imageResults || imageResults.length === 0) {
        this.logger.warn('Pexels search failed, trying Unsplash');
        imageResults = await this.searchUnsplashMultiple(keywords, count);
      }

      // Final fallback: search with generic "news" keyword
      if (!imageResults || imageResults.length === 0) {
        this.logger.warn('No results found, trying generic "news" keyword');
        imageResults = await this.searchPexelsMultiple('news', count);

        if (!imageResults || imageResults.length === 0) {
          imageResults = await this.searchUnsplashMultiple('news', count);
        }
      }

      if (!imageResults || imageResults.length === 0) {
        throw new Error('Failed to find any suitable images');
      }

      // Download all images
      const imagePaths: string[] = [];
      for (let i = 0; i < imageResults.length; i++) {
        const imagePath = await this.downloadImage(imageResults[i].url, i);
        imagePaths.push(imagePath);
      }

      this.logger.log(`Downloaded ${imagePaths.length} images from ${imageResults[0].source}`);
      return imagePaths;
    } catch (error) {
      this.logger.error('Failed to search and download images:', error.message);
      throw error;
    }
  }

  /**
   * Search for images on Pexels
   * @param keywords - Search keywords
   * @returns Image URL or null if failed
   */
  private async searchPexels(keywords: string): Promise<ImageSearchResult | null> {
    const results = await this.searchPexelsMultiple(keywords, 1);
    return results && results.length > 0 ? results[0] : null;
  }

  /**
   * Search for multiple images on Pexels
   * @param keywords - Search keywords
   * @param count - Number of images to retrieve
   * @returns Array of image results or null if failed
   */
  private async searchPexelsMultiple(keywords: string, count: number): Promise<ImageSearchResult[] | null> {
    if (!this.pexelsApiKey) {
      this.logger.warn('Pexels API key not configured');
      return null;
    }

    try {
      this.logger.debug(`Searching Pexels for ${count} images: ${keywords}`);

      const response = await axios.get('https://api.pexels.com/v1/search', {
        params: {
          query: keywords,
          per_page: count,
          orientation: 'landscape',
        },
        headers: {
          Authorization: this.pexelsApiKey,
        },
        timeout: 10000,
      });

      if (response.data.photos && response.data.photos.length > 0) {
        const results: ImageSearchResult[] = response.data.photos.map((photo: any) => ({
          url: photo.src.large2x || photo.src.large || photo.src.original,
          photographer: photo.photographer,
          source: 'pexels' as const,
        }));

        this.logger.debug(`Found ${results.length} images on Pexels`);
        return results;
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
    const results = await this.searchUnsplashMultiple(keywords, 1);
    return results && results.length > 0 ? results[0] : null;
  }

  /**
   * Search for multiple images on Unsplash
   * @param keywords - Search keywords
   * @param count - Number of images to retrieve
   * @returns Array of image results or null if failed
   */
  private async searchUnsplashMultiple(keywords: string, count: number): Promise<ImageSearchResult[] | null> {
    if (!this.unsplashAccessKey) {
      this.logger.warn('Unsplash access key not configured');
      return null;
    }

    try {
      this.logger.debug(`Searching Unsplash for ${count} images: ${keywords}`);

      const response = await axios.get('https://api.unsplash.com/search/photos', {
        params: {
          query: keywords,
          per_page: count,
          orientation: 'landscape',
        },
        headers: {
          Authorization: `Client-ID ${this.unsplashAccessKey}`,
        },
        timeout: 10000,
      });

      if (response.data.results && response.data.results.length > 0) {
        const results: ImageSearchResult[] = response.data.results.map((photo: any) => ({
          url: photo.urls.regular || photo.urls.full,
          photographer: photo.user.name,
          source: 'unsplash' as const,
        }));

        this.logger.debug(`Found ${results.length} images on Unsplash`);
        return results;
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
   * Download images from URLs (e.g., from RSS feed)
   * @param imageUrls - Array of image URLs to download
   * @returns Array of paths to downloaded images
   */
  async downloadImagesFromUrls(imageUrls: string[]): Promise<string[]> {
    try {
      this.logger.log(`Downloading ${imageUrls.length} images from RSS feed`);

      const imagePaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const imagePath = await this.downloadImage(imageUrls[i], i);
          imagePaths.push(imagePath);
        } catch (error) {
          this.logger.warn(`Failed to download image from ${imageUrls[i]}:`, error.message);
          // Continue with other images even if one fails
        }
      }

      this.logger.log(`Successfully downloaded ${imagePaths.length} out of ${imageUrls.length} images from URLs`);
      return imagePaths;
    } catch (error) {
      this.logger.error('Failed to download images from URLs:', error.message);
      return [];
    }
  }

  /**
   * Download image from URL
   * @param imageUrl - URL of the image to download
   * @param index - Optional index for multiple images (for unique filenames)
   * @returns Path to downloaded image
   */
  private async downloadImage(imageUrl: string, index?: number): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      // Extract file extension from URL, default to .jpg if not found
      const urlParts = imageUrl.split('.');
      const urlExtension = urlParts.length > 1 ? urlParts[urlParts.length - 1].split('?')[0].toLowerCase() : 'jpg';
      const extension = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExtension) ? urlExtension : 'jpg';

      const indexSuffix = index !== undefined ? `_${index}` : '';
      const filename = `bg_${Date.now()}${indexSuffix}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
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
