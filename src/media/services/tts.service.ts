import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TextToSpeechClient } from '@google-cloud/text-to-speech';
import { google } from '@google-cloud/text-to-speech/build/protos/protos';
import * as fs from 'fs-extra';
import * as path from 'path';

export interface TtsOptions {
  text: string;
  voice?: 'MALE' | 'FEMALE';
  speakingRate?: number;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly client: TextToSpeechClient;
  private readonly tempDir = './temp';

  constructor(private configService: ConfigService) {
    const credentialsPath = this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');

    if (!credentialsPath) {
      this.logger.error('GOOGLE_APPLICATION_CREDENTIALS is not configured');
      throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
    }

    this.client = new TextToSpeechClient({
      keyFilename: credentialsPath,
    });

    // Ensure temp directory exists
    fs.ensureDirSync(this.tempDir);
  }

  /**
   * Generate speech from text using Google Cloud TTS
   * @param options - TTS configuration
   * @returns Path to generated audio file
   */
  async generateSpeech(options: TtsOptions): Promise<string> {
    try {
      this.logger.debug(`Generating speech for text: ${options.text.substring(0, 50)}...`);

      const request: google.cloud.texttospeech.v1.ISynthesizeSpeechRequest = {
        input: { text: options.text },
        voice: {
          languageCode: 'ko-KR',
          name: options.voice === 'MALE' ? 'ko-KR-Standard-C' : 'ko-KR-Standard-A',
        },
        audioConfig: {
          audioEncoding: 'LINEAR16',
          sampleRateHertz: 44100,
          speakingRate: options.speakingRate || 1.15,
          volumeGainDb: 0.0,
        },
      };

      const [response] = await this.client.synthesizeSpeech(request);

      if (!response.audioContent) {
        throw new Error('No audio content received from TTS service');
      }

      // Generate unique filename
      const filename = `tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.wav`;
      const filepath = path.join(this.tempDir, filename);

      // Write audio content to file
      await fs.writeFile(filepath, response.audioContent, 'binary');

      this.logger.debug(`Speech generated successfully: ${filepath}`);
      return filepath;
    } catch (error) {
      this.logger.error('Failed to generate speech:', error.message);
      throw error;
    }
  }

  /**
   * Generate speech for anchor and reporter scripts
   * @param anchorText - Anchor script text
   * @param reporterText - Reporter script text
   * @returns Paths to generated audio files
   */
  async generateNewsScripts(
    anchorText: string,
    reporterText: string,
  ): Promise<{ anchorPath: string; reporterPath: string }> {
    try {
      this.logger.log('Generating news scripts audio files');

      // Generate anchor audio (female voice)
      const anchorPath = await this.generateSpeech({
        text: anchorText,
        voice: 'FEMALE',
        speakingRate: 1.15,
      });

      // Generate reporter audio (male voice)
      const reporterPath = await this.generateSpeech({
        text: reporterText,
        voice: 'MALE',
        speakingRate: 1.15,
      });

      this.logger.log('News scripts audio files generated successfully');
      return { anchorPath, reporterPath };
    } catch (error) {
      this.logger.error('Failed to generate news scripts:', error.message);
      throw error;
    }
  }

  /**
   * Delete temporary audio file
   * @param filepath - Path to file to delete
   */
  async deleteAudioFile(filepath: string): Promise<void> {
    try {
      await fs.remove(filepath);
      this.logger.debug(`Deleted audio file: ${filepath}`);
    } catch (error) {
      this.logger.warn(`Failed to delete audio file ${filepath}:`, error.message);
    }
  }
}
