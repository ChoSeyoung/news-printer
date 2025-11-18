import { Controller, Get, Query, Res, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { TokenService } from '../services/token.service';
import * as fs from 'fs-extra';
import * as path from 'path';

@Controller('auth/youtube')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private oauth2Client: any;

  constructor(
    private configService: ConfigService,
    private tokenService: TokenService,
  ) {
    this.initializeOAuthClient();
  }

  /**
   * Initialize OAuth2 client with credentials
   */
  private async initializeOAuthClient() {
    try {
      const credentialsPath = path.join(
        process.cwd(),
        'credentials',
        'youtube-oauth-credentials.json',
      );
      const credentials = await fs.readJson(credentialsPath);
      const { client_id, client_secret, redirect_uris } = credentials.web;

      this.oauth2Client = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0],
      );

      this.logger.log('OAuth2 client initialized');
    } catch (error) {
      this.logger.error('Failed to initialize OAuth2 client:', error.message);
      throw error;
    }
  }

  /**
   * Start OAuth flow - redirect user to Google consent screen
   * GET /auth/youtube/authorize
   */
  @Get('authorize')
  authorize(@Res() res: Response) {
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube',
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ],
      prompt: 'consent', // Force consent screen to get refresh token
    });

    this.logger.log('Redirecting to Google OAuth consent screen');
    res.redirect(authUrl);
  }

  /**
   * OAuth callback - handle the authorization code
   * GET /auth/youtube/callback?code=xxx
   */
  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    try {
      if (!code) {
        throw new HttpException(
          'Authorization code not provided',
          HttpStatus.BAD_REQUEST,
        );
      }

      this.logger.log('Received authorization code, exchanging for tokens');

      // Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      // Save tokens
      await this.tokenService.saveTokens(tokens);

      this.logger.log('YouTube OAuth tokens obtained and saved successfully');

      // Send success response
      res.send(`
        <html>
          <head>
            <title>YouTube Authorization Success</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                text-align: center;
              }
              h1 { color: #4CAF50; margin-bottom: 20px; }
              p { color: #666; line-height: 1.6; }
              .success-icon { font-size: 64px; margin-bottom: 20px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success-icon">✅</div>
              <h1>Authorization Successful!</h1>
              <p>YouTube OAuth tokens have been saved successfully.</p>
              <p>You can now close this window and use the YouTube upload feature.</p>
              <p style="margin-top: 30px; font-size: 12px; color: #999;">
                Tokens are securely stored in credentials/youtube-tokens.json
              </p>
            </div>
          </body>
        </html>
      `);
    } catch (error) {
      this.logger.error('OAuth callback error:', error.message);
      res.status(500).send(`
        <html>
          <head>
            <title>YouTube Authorization Failed</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 10px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                text-align: center;
              }
              h1 { color: #f44336; margin-bottom: 20px; }
              p { color: #666; line-height: 1.6; }
              .error-icon { font-size: 64px; margin-bottom: 20px; }
              .error-details {
                background: #f5f5f5;
                padding: 15px;
                border-radius: 5px;
                margin-top: 20px;
                font-family: monospace;
                font-size: 12px;
                color: #d32f2f;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error-icon">❌</div>
              <h1>Authorization Failed</h1>
              <p>Failed to obtain YouTube OAuth tokens.</p>
              <div class="error-details">${error.message}</div>
              <p style="margin-top: 30px;">
                Please try again: <a href="/auth/youtube/authorize">Re-authorize</a>
              </p>
            </div>
          </body>
        </html>
      `);
    }
  }

  /**
   * Check authorization status
   * GET /auth/youtube/status
   */
  @Get('status')
  async status() {
    const hasTokens = await this.tokenService.hasTokens();

    if (!hasTokens) {
      return {
        authorized: false,
        message: 'No tokens found. Please authorize first.',
        authorizeUrl: '/auth/youtube/authorize',
      };
    }

    const tokens = await this.tokenService.loadTokens();
    if (!tokens) {
      return {
        authorized: false,
        message: 'Failed to load tokens. Please authorize again.',
        authorizeUrl: '/auth/youtube/authorize',
      };
    }

    const isExpired = this.tokenService.isTokenExpired(tokens);

    return {
      authorized: true,
      tokenExpired: isExpired,
      message: isExpired
        ? 'Tokens expired. Will be refreshed on next upload.'
        : 'Tokens are valid and ready to use.',
    };
  }

  /**
   * Revoke authorization and delete tokens
   * GET /auth/youtube/revoke
   */
  @Get('revoke')
  async revoke() {
    try {
      await this.tokenService.deleteTokens();
      this.logger.log('YouTube authorization revoked');
      return {
        success: true,
        message: 'Authorization revoked successfully',
      };
    } catch (error) {
      throw new HttpException(
        'Failed to revoke authorization',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
