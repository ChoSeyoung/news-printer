import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

/**
 * 텔레그램 알림 메시지 옵션
 */
export interface TelegramNotificationOptions {
  /** 메시지 제목 */
  title: string;

  /** YouTube 비디오 URL */
  videoUrl: string;

  /** 비디오 타입 */
  videoType?: 'longform' | 'shortform';

  /** 업로드 방식 */
  uploadMethod?: 'API' | 'Browser';

  /** 추가 정보 (선택) */
  additionalInfo?: string;
}

/**
 * 텔레그램 봇 알림 서비스
 *
 * YouTube 업로드 성공 시 텔레그램으로 알림 전송
 *
 * 설정 방법:
 * 1. @BotFather에게 /newbot 명령으로 봇 생성
 * 2. 받은 Bot Token을 .env에 저장: TELEGRAM_BOT_TOKEN=your_token
 * 3. 봇을 채팅방에 추가
 * 4. 채팅방 ID 확인: https://api.telegram.org/bot<TOKEN>/getUpdates
 * 5. Chat ID를 .env에 저장: TELEGRAM_CHAT_ID=your_chat_id
 */
@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name);

  private readonly botToken: string;
  private readonly chatId: string;
  private readonly apiBase: string;

  constructor() {
    // 환경 변수에서 텔레그램 설정 로드
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.apiBase = `https://api.telegram.org/bot${this.botToken}`;

    // 설정 확인
    if (!this.botToken || !this.chatId) {
      this.logger.warn('Telegram Bot Token or Chat ID not configured. Notifications disabled.');
      this.logger.warn('Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env to enable notifications.');
    } else {
      this.logger.log('Telegram notifications enabled');
    }
  }

  /**
   * 텔레그램이 설정되어 있는지 확인
   */
  private isConfigured(): boolean {
    return !!this.botToken && !!this.chatId;
  }

  /**
   * YouTube 업로드 성공 알림 전송
   * @param options 알림 옵션
   */
  async sendUploadSuccess(options: TelegramNotificationOptions): Promise<boolean> {
    if (!this.isConfigured()) {
      this.logger.debug('Telegram not configured, skipping notification');
      return false;
    }

    try {
      const emoji = options.videoType === 'shortform' ? '📱' : '🎬';
      const method = options.uploadMethod || 'API';
      const methodEmoji = method === 'API' ? '🚀' : '🤖';

      // 메시지 포맷팅
      const message = this.formatMessage(emoji, methodEmoji, method, options);

      // 텔레그램 API 호출
      const response = await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false, // 링크 미리보기 활성화
      });

      if (response.data.ok) {
        this.logger.log(`📨 Telegram notification sent: ${options.title}`);
        return true;
      } else {
        this.logger.error(`Telegram API error: ${response.data.description}`);
        return false;
      }

    } catch (error) {
      this.logger.error(`Failed to send Telegram notification: ${error.message}`);
      return false;
    }
  }

  /**
   * 메시지 포맷팅
   */
  private formatMessage(
    emoji: string,
    methodEmoji: string,
    method: string,
    options: TelegramNotificationOptions
  ): string {
    let message = `${emoji} *YouTube 업로드 성공*\n\n`;
    message += `${methodEmoji} *방식:* ${method}\n`;
    message += `📝 *제목:* ${this.escapeMarkdown(options.title)}\n`;
    message += `🔗 *링크:* ${options.videoUrl}\n`;

    if (options.videoType) {
      const typeText = options.videoType === 'shortform' ? 'Shorts' : 'Long-form';
      message += `📊 *타입:* ${typeText}\n`;
    }

    if (options.additionalInfo) {
      message += `\n💡 ${this.escapeMarkdown(options.additionalInfo)}`;
    }

    return message;
  }

  /**
   * Markdown 특수 문자 이스케이프 (Legacy Markdown 방식)
   *
   * Telegram Bot API의 parse_mode: 'Markdown'에서는
   * _ (underscore)와 * (asterisk)만 이스케이프하면 됩니다.
   */
  private escapeMarkdown(text: string): string {
    // Legacy Markdown에서는 _ 와 * 만 이스케이프
    return text.replace(/([_*])/g, '\\$1');
  }

  /**
   * YouTube 업로드 실패 알림 전송
   * @param title 비디오 제목
   * @param error 에러 메시지
   */
  async sendUploadFailure(title: string, error: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const message =
        `❌ *YouTube 업로드 실패*\n\n` +
        `📝 *제목:* ${this.escapeMarkdown(title)}\n` +
        `⚠️ *오류:* ${this.escapeMarkdown(error)}`;

      const response = await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });

      if (response.data.ok) {
        this.logger.log(`📨 Telegram failure notification sent: ${title}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to send failure notification: ${error.message}`);
      return false;
    }
  }

  /**
   * 커스텀 메시지 전송
   * @param message 메시지 내용
   */
  async sendCustomMessage(message: string): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await axios.post(`${this.apiBase}/sendMessage`, {
        chat_id: this.chatId,
        text: message,
        parse_mode: 'Markdown',
      });

      return response.data.ok;
    } catch (error) {
      this.logger.error(`Failed to send custom message: ${error.message}`);
      return false;
    }
  }

  /**
   * 봇 상태 확인
   */
  async checkBotStatus(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const response = await axios.get(`${this.apiBase}/getMe`);

      if (response.data.ok) {
        this.logger.log(`Telegram Bot is active: @${response.data.result.username}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to check bot status: ${error.message}`);
      return false;
    }
  }
}
