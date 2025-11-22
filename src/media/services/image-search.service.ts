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
   * Download images from URLs or copy from local paths
   * @param imageUrls - Array of image URLs or local file paths to process
   * @returns Array of paths to downloaded/copied images
   */
  async downloadImagesFromUrls(imageUrls: string[]): Promise<string[]> {
    try {
      this.logger.log(`Processing ${imageUrls.length} images`);

      const imagePaths: string[] = [];
      for (let i = 0; i < imageUrls.length; i++) {
        try {
          const source = imageUrls[i];

          // Check if it's a local file path (starts with / or contains /tmp/)
          if (source.startsWith('/') || source.startsWith('./')) {
            // Local file path - check if exists and copy/use directly
            const localPath = await this.handleLocalFile(source, i);
            if (localPath) {
              imagePaths.push(localPath);
            }
          } else {
            // Remote URL - download
            const imagePath = await this.downloadImage(source, i);
            imagePaths.push(imagePath);
          }
        } catch (error) {
          this.logger.warn(`Failed to process image from ${imageUrls[i]}:`, error.message);
          // Continue with other images even if one fails
        }
      }

      this.logger.log(`Successfully processed ${imagePaths.length} out of ${imageUrls.length} images`);
      return imagePaths;
    } catch (error) {
      this.logger.error('Failed to process images:', error.message);
      return [];
    }
  }

  /**
   * Handle local file path - copy to temp directory
   * @param localPath - Local file path
   * @param index - Index for unique filename
   * @returns Path to copied file in temp directory
   */
  private async handleLocalFile(localPath: string, index: number): Promise<string | null> {
    try {
      // Check if file exists
      const exists = await fs.pathExists(localPath);
      if (!exists) {
        this.logger.warn(`Local file not found: ${localPath}`);
        return null;
      }

      // Get file extension
      const ext = path.extname(localPath) || '.jpg';
      const filename = `local_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}${ext}`;
      const destPath = path.join(this.tempDir, filename);

      // Copy file to temp directory
      await fs.copy(localPath, destPath);
      this.logger.debug(`Local file copied: ${localPath} -> ${destPath}`);

      return destPath;
    } catch (error) {
      this.logger.error(`Failed to handle local file ${localPath}:`, error.message);
      return null;
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

      // 뉴스 이미지의 경우 하단 워터마크 제거 (언론사별 다른 크기)
      let cropPixels = 0;

      if (imageUrl.includes('mt.co.kr') || imageUrl.includes('moneytoday.co.kr')) {
        cropPixels = 50; // 머니투데이: 하단 50px 제거
      } else if (imageUrl.includes('edaily.co.kr')) {
        cropPixels = 60; // 이데일리: 하단 60px 제거
      } else if (imageUrl.includes('thefact.co.kr')) {
        cropPixels = 80; // 더 팩트: 하단 80px 제거
      } else if (imageUrl.includes('yna.co.kr') || imageUrl.includes('yonhapnews.co.kr')) {
        cropPixels = 100; // 연합뉴스: 하단 100px 제거
      } else if (imageUrl.includes('news1.kr')) {
        cropPixels = 150; // 뉴스1: 하단 150px 제거
      } else if (imageUrl.includes('daumcdn.net') || imageUrl.includes('newsis.com')) {
        cropPixels = 100; // 다음/뉴시스: 하단 100px 제거
      }

      if (cropPixels > 0) {
        this.logger.debug(`Cropping bottom ${cropPixels}px from image: ${filepath}`);
        await this.cropBottomPixels(filepath, cropPixels);
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
