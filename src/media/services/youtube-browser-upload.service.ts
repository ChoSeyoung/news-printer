import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * 브라우저 업로드 옵션
 */
export interface BrowserUploadOptions {
  /** 비디오 파일 경로 */
  videoPath: string;

  /** 비디오 제목 */
  title: string;

  /** 비디오 설명 */
  description: string;

  /** 태그 목록 */
  tags?: string[];

  /** 공개 설정 */
  privacyStatus: 'public' | 'private' | 'unlisted';

  /** 썸네일 파일 경로 (선택) */
  thumbnailPath?: string;

  /** 카테고리 ID */
  categoryId?: string;
}

/**
 * 브라우저 업로드 결과
 */
export interface BrowserUploadResult {
  success: boolean;
  videoUrl?: string;
  videoId?: string;
  error?: string;
}

/**
 * YouTube 브라우저 자동화 업로드 서비스
 *
 * ⚠️ 주의사항:
 * - YouTube ToS 위반 가능성 존재
 * - 계정 정지 위험 있음
 * - 프로덕션 환경에서는 공식 API 사용 권장
 * - 이 코드는 API 할당량 소진 시 임시 대안으로만 사용
 *
 * 인간 행동 패턴 시뮬레이션:
 * - 랜덤 지연 (1-5초)
 * - 마우스 움직임 시뮬레이션
 * - 타이핑 속도 랜덤화
 * - 페이지 로딩 대기
 * - 스크롤 행동 모방
 */
@Injectable()
export class YoutubeBrowserUploadService {
  private readonly logger = new Logger(YoutubeBrowserUploadService.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  // 인증 정보 저장 경로
  private readonly AUTH_STATE_PATH = './temp/youtube-auth-state.json';

  /**
   * 브라우저 초기화 (한 번만 실행, 세션 재사용)
   */
  private async initBrowser(): Promise<void> {
    if (!this.browser) {
      this.logger.log('Initializing headless browser...');

      this.browser = await chromium.launch({
        headless: false, // headless: false로 변경하면 디버깅 가능
        channel: 'chrome', // 시스템에 설치된 Chrome 사용
        args: [
          '--disable-blink-features=AutomationControlled', // 자동화 감지 회피
          '--disable-dev-shm-usage',
          '--no-sandbox',
        ],
      });

      // 인증 상태 복원 (이미 로그인된 세션 재사용)
      const authStateExists = await this.checkAuthStateExists();

      if (authStateExists) {
        this.logger.log('Restoring previous authentication session...');
        this.context = await this.browser.newContext({
          storageState: this.AUTH_STATE_PATH,
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
      } else {
        this.logger.warn('No previous auth session found. Manual login required.');
        this.context = await this.browser.newContext({
          viewport: { width: 1920, height: 1080 },
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
      }
    }
  }

  /**
   * 인증 상태 파일 존재 여부 확인
   */
  private async checkAuthStateExists(): Promise<boolean> {
    try {
      await fs.access(this.AUTH_STATE_PATH);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 랜덤 지연 (인간처럼 행동)
   * @param min 최소 지연 (ms)
   * @param max 최대 지연 (ms)
   */
  private async randomDelay(min: number = 1000, max: number = 5000): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    this.logger.debug(`Waiting ${delay}ms (human-like delay)...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 인간처럼 타이핑 (랜덤 속도)
   * @param page Playwright Page 객체
   * @param selector 입력 필드 셀렉터
   * @param text 입력할 텍스트
   */
  private async humanLikeType(page: Page, selector: string, text: string): Promise<void> {
    const element = await page.locator(selector);

    // 기존 텍스트 삭제
    await element.click();
    await page.keyboard.press('Meta+A'); // Cmd+A (Mac) / Ctrl+A (Windows)
    await page.keyboard.press('Backspace');

    // 인간처럼 한 글자씩 타이핑
    for (const char of text) {
      await element.type(char, { delay: Math.random() * 150 + 50 }); // 50-200ms 딜레이
    }

    await this.randomDelay(500, 1500); // 타이핑 후 잠깐 대기
  }

  /**
   * 페이지 스크롤 (인간처럼 행동)
   * @param page Playwright Page 객체
   * @param distance 스크롤 거리 (픽셀)
   */
  private async humanLikeScroll(page: Page, distance: number = 300): Promise<void> {
    await page.evaluate((scrollDistance) => {
      window.scrollBy({
        top: scrollDistance,
        behavior: 'smooth', // 부드러운 스크롤
      });
    }, distance);

    await this.randomDelay(800, 2000);
  }

  /**
   * YouTube Studio 로그인 (최초 1회만)
   * @param page Playwright Page 객체
   */
  private async loginToYouTubeStudio(page: Page): Promise<boolean> {
    try {
      this.logger.log('Navigating to YouTube Studio...');
      await page.goto('https://studio.youtube.com', { waitUntil: 'networkidle' });

      // 이미 로그인되어 있는지 확인
      const isLoggedIn = await page.locator('ytcp-uploads-dialog').count() > 0 ||
                          await page.locator('[aria-label="Create"]').count() > 0;

      if (isLoggedIn) {
        this.logger.log('Already logged in to YouTube Studio');
        return true;
      }

      this.logger.warn('Not logged in. Please run this with headless: false and manually login.');
      this.logger.warn('After login, the session will be saved for future use.');

      // 수동 로그인 대기 (headless: false 모드에서)
      // 실제 사용 시: headless: false로 변경 → 수동 로그인 → 세션 저장
      await page.waitForSelector('[aria-label="Create"]', { timeout: 120000 }); // 2분 대기

      // 로그인 성공 후 세션 저장
      await this.saveAuthState();

      return true;
    } catch (error) {
      this.logger.error('Login failed:', error.message);
      return false;
    }
  }

  /**
   * 인증 세션 저장
   */
  private async saveAuthState(): Promise<void> {
    if (!this.context) return;

    await this.context.storageState({ path: this.AUTH_STATE_PATH });
    this.logger.log('Authentication session saved for future use');
  }

  /**
   * 브라우저 자동화로 YouTube 업로드
   * @param options 업로드 옵션
   * @returns 업로드 결과
   */
  async uploadVideo(options: BrowserUploadOptions): Promise<BrowserUploadResult> {
    const startTime = Date.now();

    try {
      // 브라우저 초기화
      await this.initBrowser();

      if (!this.context) {
        throw new Error('Browser context not initialized');
      }

      const page = await this.context.newPage();

      // 1️⃣ YouTube Studio 로그인 확인
      this.logger.log('Step 1/7: Checking authentication...');
      const isLoggedIn = await this.loginToYouTubeStudio(page);

      if (!isLoggedIn) {
        throw new Error('YouTube login required. Run with headless: false for manual login.');
      }

      await this.randomDelay(2000, 4000); // 로그인 후 대기

      // 2️⃣ Create 버튼 클릭
      this.logger.log('Step 2/7: Clicking Create button...');
      await page.click('[aria-label="Create"]');
      await this.randomDelay(1000, 2000);

      // 3️⃣ Upload videos 클릭
      this.logger.log('Step 3/7: Clicking Upload videos...');
      await page.click('text=Upload videos');
      await this.randomDelay(1500, 3000);

      // 4️⃣ 파일 업로드
      this.logger.log(`Step 4/7: Uploading video file: ${options.videoPath}`);
      const fileInput = await page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(options.videoPath);

      // 파일 업로드 처리 중 대기 (인간처럼)
      await this.randomDelay(3000, 6000);

      // 5️⃣ 메타데이터 입력
      this.logger.log('Step 5/7: Entering metadata...');

      // 제목 입력
      const titleSelector = 'ytcp-social-suggestions-textbox[label="Title"] #textbox';
      await page.waitForSelector(titleSelector, { timeout: 30000 });
      await this.humanLikeType(page, titleSelector, options.title);

      // 설명 입력
      const descriptionSelector = 'ytcp-social-suggestions-textbox[label="Description"] #textbox';
      await this.humanLikeType(page, descriptionSelector, options.description);

      // 썸네일 업로드 (선택)
      if (options.thumbnailPath) {
        this.logger.log('Uploading thumbnail...');
        const thumbnailInput = await page.locator('input[type="file"][accept="image/*"]').first();
        await thumbnailInput.setInputFiles(options.thumbnailPath);
        await this.randomDelay(2000, 4000);
      }

      // "No, it's not made for kids" 선택 (자동 선택)
      await this.randomDelay(1000, 2000);
      await page.click('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');

      // 6️⃣ Next 버튼 3번 클릭 (Details → Video elements → Checks → Visibility)
      this.logger.log('Step 6/7: Navigating through upload steps...');

      for (let i = 0; i < 3; i++) {
        await this.randomDelay(2000, 4000);
        await page.click('ytcp-button[id="next-button"]');
      }

      // 7️⃣ 공개 설정 선택
      this.logger.log('Step 7/7: Setting privacy status...');
      await this.randomDelay(1500, 3000);

      const privacyMap = {
        'public': 'PUBLIC',
        'unlisted': 'UNLISTED',
        'private': 'PRIVATE',
      };

      const privacyValue = privacyMap[options.privacyStatus];
      await page.click(`tp-yt-paper-radio-button[name="${privacyValue}"]`);

      await this.randomDelay(2000, 4000);

      // Publish 버튼 클릭
      this.logger.log('Publishing video...');
      await page.click('ytcp-button[id="done-button"]');

      // 업로드 완료 대기
      await page.waitForSelector('ytcp-video-share-url', { timeout: 300000 }); // 5분 대기

      // 업로드된 비디오 URL 추출
      const videoUrlElement = await page.locator('ytcp-video-share-url a').first();
      const videoUrl = await videoUrlElement.getAttribute('href');
      const videoId = videoUrl?.split('v=')[1] || undefined;

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`✅ Browser upload completed in ${duration}s: ${videoUrl}`);

      // 페이지 닫기
      await page.close();

      return {
        success: true,
        videoUrl: videoUrl || undefined,
        videoId: videoId,
      };

    } catch (error) {
      this.logger.error('❌ Browser upload failed:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 브라우저 정리 (세션 종료 시)
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.logger.log('Browser closed');
    }
  }

  /**
   * 서비스 종료 시 브라우저 정리
   */
  async onModuleDestroy() {
    await this.cleanup();
  }
}
