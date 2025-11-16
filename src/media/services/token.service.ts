import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface TokenData {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly tokenPath: string;

  constructor(private configService: ConfigService) {
    this.tokenPath = path.join(process.cwd(), 'credentials', 'youtube-tokens.json');
  }

  /**
   * Save OAuth tokens to file
   */
  async saveTokens(tokens: TokenData): Promise<void> {
    try {
      await fs.ensureDir(path.dirname(this.tokenPath));
      await fs.writeJson(this.tokenPath, tokens, { spaces: 2 });
      this.logger.log('YouTube OAuth tokens saved successfully');
    } catch (error) {
      this.logger.error('Failed to save tokens:', error.message);
      throw error;
    }
  }

  /**
   * Load OAuth tokens from file
   */
  async loadTokens(): Promise<TokenData | null> {
    try {
      if (await fs.pathExists(this.tokenPath)) {
        const tokens = await fs.readJson(this.tokenPath);
        this.logger.debug('YouTube OAuth tokens loaded');
        return tokens;
      }
      this.logger.warn('No saved tokens found');
      return null;
    } catch (error) {
      this.logger.error('Failed to load tokens:', error.message);
      return null;
    }
  }

  /**
   * Check if tokens exist
   */
  async hasTokens(): Promise<boolean> {
    return await fs.pathExists(this.tokenPath);
  }

  /**
   * Delete saved tokens
   */
  async deleteTokens(): Promise<void> {
    try {
      if (await fs.pathExists(this.tokenPath)) {
        await fs.remove(this.tokenPath);
        this.logger.log('YouTube OAuth tokens deleted');
      }
    } catch (error) {
      this.logger.error('Failed to delete tokens:', error.message);
      throw error;
    }
  }

  /**
   * Check if tokens are expired or about to expire (within 5 minutes)
   */
  isTokenExpired(tokens: TokenData): boolean {
    if (!tokens.expiry_date) {
      return true;
    }
    const expiryTime = tokens.expiry_date;
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    return now >= expiryTime - bufferTime;
  }
}
