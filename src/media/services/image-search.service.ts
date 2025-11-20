import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import sharp from 'sharp';

@Injectable()
export class ImageSearchService {
  private readonly logger = new Logger(ImageSearchService.name);
  private readonly tempDir = './temp';

  constructor() {
    fs.ensureDirSync(this.tempDir);
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
      // HTTPS Agent with legacy SSL renegotiation support for yna.co.kr
      const httpsAgent = new https.Agent({
        secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
      });

      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        httpsAgent,
      });

      // Extract file extension from URL, default to .jpg if not found
      const urlParts = imageUrl.split('.');
      const urlExtension = urlParts.length > 1 ? urlParts[urlParts.length - 1].split('?')[0].toLowerCase() : 'jpg';
      const extension = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(urlExtension) ? urlExtension : 'jpg';

      const indexSuffix = index !== undefined ? `_${index}` : '';
      const filename = `bg_${Date.now()}${indexSuffix}_${Math.random().toString(36).substr(2, 9)}.${extension}`;
      const filepath = path.join(this.tempDir, filename);

      await fs.writeFile(filepath, response.data);

      // 연합뉴스 이미지의 경우 하단 100px 제거 (워터마크 제거)
      if (imageUrl.includes('yna.co.kr')) {
        this.logger.debug(`Cropping bottom 100px from Yonhap News image: ${filepath}`);
        await this.cropBottomPixels(filepath, 100);
      }

      this.logger.debug(`Image downloaded: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error('Failed to download image:', error.message);
      throw error;
    }
  }

  /**
   * Crop bottom pixels from image (워터마크 제거)
   * @param filepath - Path to image file
   * @param pixelsToRemove - Number of pixels to remove from bottom
   */
  private async cropBottomPixels(filepath: string, pixelsToRemove: number): Promise<void> {
    try {
      const image = sharp(filepath);
      const metadata = await image.metadata();

      if (!metadata.width || !metadata.height) {
        throw new Error('Unable to read image dimensions');
      }

      const newHeight = metadata.height - pixelsToRemove;

      if (newHeight <= 0) {
        throw new Error(`Image height (${metadata.height}px) is too small to remove ${pixelsToRemove}px`);
      }

      // Crop the image to exclude bottom pixels
      await image
        .extract({ left: 0, top: 0, width: metadata.width, height: newHeight })
        .toFile(filepath + '.tmp');

      // Replace original file with cropped version
      await fs.move(filepath + '.tmp', filepath, { overwrite: true });

      this.logger.debug(`Cropped ${pixelsToRemove}px from bottom of image: ${filepath} (${metadata.width}x${metadata.height} → ${metadata.width}x${newHeight})`);
    } catch (error) {
      this.logger.error(`Failed to crop image ${filepath}:`, error.message);
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
