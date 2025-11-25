import { Injectable, Logger } from '@nestjs/common';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import * as path from 'path';
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

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

  // 업로드 중복 실행 방지를 위한 락
  private isUploading: boolean = false;
  private uploadQueue: Array<{
    options: BrowserUploadOptions;
    resolve: (result: BrowserUploadResult) => void;
    reject: (error: any) => void;
  }> = [];

  // 인증 정보 저장 경로
  private readonly AUTH_STATE_PATH = './temp/youtube-auth-state.json';

  /**
   * 브라우저 초기화 (매 업로드마다 새로운 브라우저 생성)
   */
  private async initBrowser(): Promise<void> {
    this.logger.log('Initializing new browser instance...');

    this.browser = await chromium.launch({
      headless: false,
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
   * 인간처럼 타이핑 (랜덤 속도, 실수, 휴지시간 포함)
   * YouTube 자동화 탐지를 우회하기 위해 더욱 정교한 휴먼 시뮬레이션
   * @param page Playwright Page 객체
   * @param selector 입력 필드 셀렉터
   * @param text 입력할 텍스트
   */
  private async humanLikeType(page: Page, selector: string, text: string): Promise<void> {
    const element = await page.locator(selector);

    // 기존 텍스트 삭제
    await element.click();
    await this.randomDelay(100, 300); // 클릭 후 잠깐 대기
    await page.keyboard.press('Meta+A'); // Cmd+A (Mac) / Ctrl+A (Windows)
    await this.randomDelay(50, 150);
    await page.keyboard.press('Backspace');
    await this.randomDelay(200, 500); // 삭제 후 생각하는 시간

    // 인간처럼 한 글자씩 타이핑 (더 느리고 변칙적으로)
    const words = text.split(' ');
    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      // 각 단어의 글자를 타이핑
      for (let j = 0; j < word.length; j++) {
        const char = word[j];

        // 5% 확률로 오타 시뮬레이션
        if (Math.random() < 0.05 && j < word.length - 1) {
          // 잘못된 키 입력
          const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
          await page.keyboard.type(wrongChar, { delay: Math.random() * 100 + 100 });
          await this.randomDelay(100, 300); // 오타 발견
          await page.keyboard.press('Backspace');
          await this.randomDelay(50, 150); // 수정 준비
        }

        // 정상 타이핑 (100-300ms, 더 느리게)
        await page.keyboard.type(char, { delay: Math.random() * 200 + 100 });

        // 10% 확률로 짧은 휴지시간 (생각하는 시간)
        if (Math.random() < 0.1) {
          await this.randomDelay(200, 600);
        }
      }

      // 단어 사이 스페이스 (마지막 단어가 아니면)
      if (i < words.length - 1) {
        await page.keyboard.type(' ', { delay: Math.random() * 100 + 100 });
        // 단어 사이 휴지시간 (20% 확률로 더 긴 휴지)
        if (Math.random() < 0.2) {
          await this.randomDelay(500, 1500); // 문장 생각하는 시간
        } else {
          await this.randomDelay(100, 400); // 일반 단어 사이 휴지
        }
      }
    }

    await this.randomDelay(500, 1500); // 타이핑 완료 후 확인하는 시간
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
      await page.goto('https://studio.youtube.com', {
        waitUntil: 'domcontentloaded', // networkidle보다 더 빠르고 안정적
        timeout: 120000 // 타임아웃 2분으로 증가
      });

      // 페이지가 완전히 로드될 때까지 추가 대기
      await this.randomDelay(3000, 5000);

      // 로그인 확인 - 여러 선택자 시도
      const createButtonSelectors = [
        '[aria-label="만들기"]',
        '[aria-label="Create"]',
        'button[aria-label="만들기"]',
        'button[aria-label="Create"]',
        'ytcp-button#create-icon',
      ];

      let isLoggedIn = false;
      for (const selector of createButtonSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          this.logger.log(`Already logged in to YouTube Studio (found: ${selector})`);
          isLoggedIn = true;
          break;
        }
      }

      if (isLoggedIn) {
        return true;
      }

      this.logger.warn('Not logged in. Please run this with headless: false and manually login.');
      this.logger.warn('After login, the session will be saved for future use.');

      // 수동 로그인 대기 (headless: false 모드에서)
      await page.waitForSelector('[aria-label="만들기"], [aria-label="Create"]', { timeout: 180000 });

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
  /**
   * YouTube 비디오 업로드 (큐 시스템으로 한 번에 하나씩만 실행)
   */
  async uploadVideo(options: BrowserUploadOptions): Promise<BrowserUploadResult> {
    // 이미 업로드 중이면 큐에 추가
    if (this.isUploading) {
      this.logger.log(`Upload in progress, queuing: ${options.title}`);
      return new Promise((resolve, reject) => {
        this.uploadQueue.push({ options, resolve, reject });
      });
    }

    // 업로드 시작
    this.isUploading = true;
    this.logger.log(`Starting upload (queue size: ${this.uploadQueue.length}): ${options.title}`);

    try {
      const result = await this._uploadVideoInternal(options);

      // 다음 큐 아이템 처리
      this.processNextInQueue();

      return result;
    } catch (error) {
      // 에러 발생 시에도 다음 큐 처리
      this.processNextInQueue();
      throw error;
    }
  }

  /**
   * 큐에서 다음 업로드 처리
   */
  private processNextInQueue(): void {
    const next = this.uploadQueue.shift();
    if (next) {
      this.logger.log(`Processing next queued upload: ${next.options.title}`);
      this._uploadVideoInternal(next.options)
        .then(next.resolve)
        .catch(next.reject)
        .finally(() => {
          this.processNextInQueue();
        });
    } else {
      this.isUploading = false;
      this.logger.log('Upload queue empty, ready for next upload');
    }
  }

  /**
   * 실제 업로드 로직 (내부용)
   */
  private async _uploadVideoInternal(options: BrowserUploadOptions): Promise<BrowserUploadResult> {
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

      // ytcp-button-shape 내부의 실제 button 요소를 찾아서 클릭
      const createButtonSelectors = [
        'ytcp-button-shape button[aria-label="만들기"]',
        'button.ytcpButtonShapeImplHost[aria-label="만들기"]',
        '[aria-label="만들기"]',
        'ytcp-button-shape button[aria-label="Create"]',
        'button.ytcpButtonShapeImplHost[aria-label="Create"]',
        '[aria-label="Create"]',
      ];

      let clicked = false;
      for (const selector of createButtonSelectors) {
        try {
          const button = page.locator(selector).first();
          const count = await button.count();
          if (count > 0) {
            this.logger.log(`Found Create button with selector: ${selector}`);
            await button.click({ timeout: 10000 });
            clicked = true;
            this.logger.log('Create button clicked successfully');
            break;
          }
        } catch (e) {
          this.logger.debug(`Selector ${selector} failed: ${e.message}`);
        }
      }

      if (!clicked) {
        throw new Error('Failed to click Create button with any selector');
      }

      await this.randomDelay(1000, 2000);

      // 3️⃣ Upload videos 클릭
      this.logger.log('Step 3/7: Clicking Upload videos...');
      try {
        // 한국어 먼저 시도
        await page.click('text=동영상 업로드', { timeout: 10000 });
      } catch {
        // 실패 시 영어 시도
        await page.click('text=Upload videos', { timeout: 10000 });
      }
      await this.randomDelay(1500, 3000);

      // 4️⃣ 파일 업로드
      this.logger.log(`Step 4/7: Uploading video file: ${options.videoPath}`);
      const fileInput = await page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(options.videoPath);

      // 파일 업로드 처리 중 대기 (인간처럼)
      await this.randomDelay(3000, 6000);

      // 5️⃣ 메타데이터 입력
      this.logger.log('Step 5/7: Entering metadata...');

      // 제목과 설명 입력 - div[id="textbox"]를 모두 찾아서 순서대로 입력
      const textboxes = await page.locator('div[id="textbox"]').all();

      if (textboxes.length < 2) {
        throw new Error(`Expected at least 2 textboxes, found ${textboxes.length}`);
      }

      // 첫 번째 textbox에 제목 입력 (YouTube 탐지 회피를 위한 개선된 타이핑)
      this.logger.log('Entering title with human-like typing...');
      await textboxes[0].click();
      await this.randomDelay(200, 500); // 클릭 후 생각하는 시간
      await page.keyboard.press('Meta+A');
      await this.randomDelay(50, 150);
      await page.keyboard.press('Backspace');
      await this.randomDelay(300, 700); // 기존 내용 삭제 후 생각하는 시간

      // 제목 전처리 (한자/이니셜 치환)
      const preprocessedTitle = TextPreprocessor.preprocessText(options.title);

      // 한 글자씩 타이핑 (keyboard.type 사용 - element.type보다 더 자연스러움)
      const titleWords = preprocessedTitle.split(' ');
      for (let i = 0; i < titleWords.length; i++) {
        const word = titleWords[i];

        for (let j = 0; j < word.length; j++) {
          const char = word[j];

          // 5% 확률로 오타 + 수정
          if (Math.random() < 0.05 && j < word.length - 1) {
            const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
            await page.keyboard.type(wrongChar, { delay: Math.random() * 100 + 100 });
            await this.randomDelay(150, 400); // 오타 발견
            await page.keyboard.press('Backspace');
            await this.randomDelay(50, 200); // 수정 준비
          }

          // 정상 타이핑 (50-100ms)
          await page.keyboard.type(char, { delay: Math.random() * 50 + 50 });
        }

        // 단어 사이 스페이스
        if (i < titleWords.length - 1) {
          await page.keyboard.type(' ', { delay: Math.random() * 100 + 100 });
          await this.randomDelay(150, 500);
        }
      }
      await this.randomDelay(700, 1500); // 제목 입력 완료 후 확인

      // 두 번째 textbox에 설명 입력 (동일한 human-like 패턴)
      this.logger.log('Entering description with human-like typing...');
      await textboxes[1].click();
      await this.randomDelay(200, 500);
      await page.keyboard.press('Meta+A');
      await this.randomDelay(50, 150);
      await page.keyboard.press('Backspace');
      await this.randomDelay(300, 700);

      // 설명 전처리 (한자/이니셜 치환)
      const preprocessedDescription = TextPreprocessor.preprocessText(options.description);

      const descWords = preprocessedDescription.split(' ');
      for (let i = 0; i < descWords.length; i++) {
        const word = descWords[i];

        for (let j = 0; j < word.length; j++) {
          const char = word[j];

          // 5% 확률로 오타 + 수정
          if (Math.random() < 0.05 && j < word.length - 1) {
            const wrongChar = String.fromCharCode(char.charCodeAt(0) + 1);
            await page.keyboard.type(wrongChar, { delay: Math.random() * 100 + 100 });
            await this.randomDelay(150, 400);
            await page.keyboard.press('Backspace');
            await this.randomDelay(50, 200);
          }

          // 정상 타이핑 (50-100ms)
          await page.keyboard.type(char, { delay: Math.random() * 50 + 50 });
        }

        // 단어 사이 스페이스
        if (i < descWords.length - 1) {
          await page.keyboard.type(' ', { delay: Math.random() * 100 + 100 });
          // 20% 확률로 더 긴 휴지 (문장 생각하는 시간)
          if (Math.random() < 0.2) {
            await this.randomDelay(700, 1800);
          } else {
            await this.randomDelay(150, 500);
          }
        }
      }
      await this.randomDelay(700, 1500); // 설명 입력 완료 후 확인

      // 썸네일은 자동 생성되므로 업로드 스킵

      // 스크롤하여 "아동용" 섹션 보이게 하기
      this.logger.log('Scrolling to audience section...');
      await this.humanLikeScroll(page, 300);
      await this.randomDelay(1000, 2000);

      // "No, it's not made for kids" 선택 (자동 선택)
      this.logger.log('Selecting "Not made for kids"...');
      await this.randomDelay(1000, 2000);

      // 여러 selector 시도
      const kidsSelectorClicked = await page.click('tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]').catch(async () => {
        // 실패 시 한국어 label로 시도
        await page.click('text=아동용이 아닙니다').catch(async () => {
          // 그것도 실패 시 radio button의 다른 형태 시도
          await page.click('[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]');
        });
      });

      // 6️⃣ Next 버튼 클릭 및 최종 화면 설정
      this.logger.log('Step 6/7: Navigating through upload steps...');

      // 첫 번째 Next: Details → Video elements
      await this.randomDelay(2000, 4000);
      this.logger.log(`Clicking Next button (1/3)...`);

      // Next 버튼을 여러 방식으로 시도 (ytcp-button 내부의 실제 button 요소)
      const nextButtonSelectors = [
        'ytcp-button#next-button button',
        'ytcp-button[id="next-button"] button',
        'button.ytcpButtonShapeImplHost[aria-label="다음"]',
        'button.ytcpButtonShapeImplHost[aria-label="Next"]',
        '#next-button button',
        'button[aria-label="다음"]',
        'button[aria-label="Next"]',
      ];

      let firstNextClicked = false;
      for (const selector of nextButtonSelectors) {
        try {
          const count = await page.locator(selector).count();
          if (count > 0) {
            this.logger.log(`Found Next button with selector: ${selector}`);
            await page.locator(selector).first().click({ timeout: 10000 });
            firstNextClicked = true;
            break;
          }
        } catch (e) {
          this.logger.debug(`Selector ${selector} failed: ${e.message}`);
        }
      }

      if (!firstNextClicked) {
        throw new Error(`Failed to click Next button 1/3`);
      }

      this.logger.log(`Next button 1/3 clicked successfully`);

      // Video elements 페이지에서 최종 화면 추가
      this.logger.log('Adding end screen...');
      await this.randomDelay(2000, 3000);

      // "추가" 버튼 클릭 (최종 화면 추가)
      try {
        const addEndScreenButton = page.locator('ytcp-button#endscreens-button button');
        const count = await addEndScreenButton.count();
        if (count > 0) {
          this.logger.log('Clicking "Add" button for end screen...');
          await addEndScreenButton.first().click({ timeout: 10000 });
          await this.randomDelay(2000, 3000);

          // 최종 화면 템플릿 선택 (첫 번째 템플릿: 동영상 1개, 구독 1개)
          this.logger.log('Selecting end screen template...');
          const templateCard = page.locator('div.card.style-scope.ytve-endscreen-template-picker').first();
          await templateCard.click({ timeout: 10000 });
          await this.randomDelay(2000, 3000);

          // "저장" 버튼 클릭하여 최종 화면 저장
          this.logger.log('Clicking Save button for end screen...');
          const saveButton = page.locator('ytcp-button#save-button button');
          await saveButton.waitFor({ state: 'visible', timeout: 10000 });

          // 버튼이 활성화될 때까지 대기
          await page.waitForFunction(() => {
            const btn = document.querySelector('ytcp-button#save-button button');
            return btn && !btn.hasAttribute('disabled');
          }, { timeout: 10000 });

          await saveButton.click({ timeout: 10000 });
          await this.randomDelay(1000, 2000);

          this.logger.log('End screen saved successfully');
        }
      } catch (e) {
        this.logger.warn('Failed to add end screen, skipping...', e.message);
      }

      // 나머지 Next 버튼 2번 클릭 (Video elements → Checks → Visibility)
      for (let i = 1; i < 3; i++) {
        await this.randomDelay(2000, 4000);
        this.logger.log(`Clicking Next button (${i + 1}/3)...`);

        // Next 버튼을 여러 방식으로 시도 (ytcp-button 내부의 실제 button 요소)
        const nextButtonSelectors = [
          'ytcp-button#next-button button',
          'ytcp-button[id="next-button"] button',
          'button.ytcpButtonShapeImplHost[aria-label="다음"]',
          'button.ytcpButtonShapeImplHost[aria-label="Next"]',
          '#next-button button',
          'button[aria-label="다음"]',
          'button[aria-label="Next"]',
        ];

        let clicked = false;
        for (const selector of nextButtonSelectors) {
          try {
            const count = await page.locator(selector).count();
            if (count > 0) {
              this.logger.log(`Found Next button with selector: ${selector}`);
              await page.locator(selector).first().click({ timeout: 10000 });
              clicked = true;
              break;
            }
          } catch (e) {
            this.logger.debug(`Selector ${selector} failed: ${e.message}`);
          }
        }

        if (!clicked) {
          throw new Error(`Failed to click Next button ${i + 1}/3`);
        }

        this.logger.log(`Next button ${i + 1}/3 clicked successfully`);
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
      this.logger.log(`Selecting privacy: ${options.privacyStatus} (${privacyValue})`);
      await page.click(`tp-yt-paper-radio-button[name="${privacyValue}"]`);

      await this.randomDelay(2000, 3000);

      // "저장" 버튼 클릭 (공개 설정 후)
      this.logger.log('Clicking Save button after privacy selection...');
      const saveButtonSelectors = [
        'ytcp-button#save-button button',
        'ytcp-button[id="save-button"] button',
        'button[aria-label="저장"]',
        'button[aria-label="Save"]',
      ];

      let saveClicked = false;
      for (const selector of saveButtonSelectors) {
        try {
          const count = await page.locator(selector).count();
          if (count > 0) {
            this.logger.log(`Found Save button with selector: ${selector}`);

            // 버튼이 활성화될 때까지 대기
            await page.waitForFunction((sel) => {
              const btn = document.querySelector(sel);
              return btn && !btn.hasAttribute('disabled');
            }, selector, { timeout: 10000 });

            await page.locator(selector).first().click({ timeout: 10000 });
            saveClicked = true;
            this.logger.log('Save button clicked successfully');
            break;
          }
        } catch (e) {
          this.logger.debug(`Selector ${selector} failed: ${e.message}`);
        }
      }

      if (!saveClicked) {
        this.logger.warn('Failed to click Save button, attempting to proceed...');
      }

      await this.randomDelay(2000, 4000);

      // Publish 버튼 클릭
      this.logger.log('Publishing video...');

      await page.click('ytcp-button[id="done-button"]');

      // 업로드 완료 대기
      await page.waitForSelector('a#share-url', { timeout: 60000 });

      // 업로드된 비디오 URL 추출
      const videoUrlElement = await page.locator('a#share-url').first();
      const videoUrl = await videoUrlElement.getAttribute('href');

      // videoId 추출 (일반 비디오와 shorts 모두 처리)
      let videoId: string | undefined;
      if (videoUrl) {
        // shorts URL: https://youtube.com/shorts/VIDEO_ID
        const shortsMatch = videoUrl.match(/shorts\/([^?]+)/);
        if (shortsMatch) {
          videoId = shortsMatch[1];
        } else {
          // 일반 비디오 URL: https://youtube.com/watch?v=VIDEO_ID
          const urlParams = new URLSearchParams(videoUrl.split('?')[1]);
          videoId = urlParams.get('v') || undefined;
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(`✅ Browser upload completed in ${duration}s: ${videoUrl}`);

      // 페이지 닫기
      await page.close();

      // 브라우저 완전 종료 (다음 업로드 시 새 브라우저 생성)
      this.logger.log('Closing browser for clean state...');
      await this.cleanup();

      await this.randomDelay(1000, 2000);

      return {
        success: true,
        videoUrl: videoUrl || undefined,
        videoId: videoId,
      };

    } catch (error) {
      this.logger.error('❌ Browser upload failed:', error.message);

      // 에러 발생 시에도 브라우저 종료
      await this.cleanup();

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
