/**
 * YouTube 브라우저 자동화 테스트 스크립트
 *
 * 이 스크립트는 YouTube 로그인 세션을 저장하기 위한 초기 설정용입니다.
 *
 * 실행 방법:
 * 1. youtube-browser-upload.service.ts에서 headless: false로 변경
 * 2. npx ts-node scripts/test-browser-upload.ts 실행
 * 3. 브라우저 창에서 수동으로 YouTube 로그인
 * 4. 로그인 완료되면 세션이 temp/youtube-auth-state.json에 저장됨
 * 5. youtube-browser-upload.service.ts에서 headless: true로 복원
 */

import { chromium, Browser, BrowserContext } from 'playwright';
import { promises as fs } from 'fs';
import * as path from 'path';

const AUTH_STATE_PATH = './temp/youtube-auth-state.json';

async function testBrowserLogin() {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    console.log('🚀 Starting browser automation test...\n');

    // 1. temp 디렉토리 생성
    const tempDir = path.dirname(AUTH_STATE_PATH);
    try {
      await fs.access(tempDir);
    } catch {
      console.log('📁 Creating temp directory...');
      await fs.mkdir(tempDir, { recursive: true });
    }

    // 2. 브라우저 실행 (headless: false - 창이 보임)
    console.log('🌐 Launching browser (visible mode)...');
    browser = await chromium.launch({
      headless: false, // 브라우저 창이 보이도록 설정
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--no-sandbox',
      ],
    });

    // 3. 기존 세션 확인
    let contextOptions: any = {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    try {
      await fs.access(AUTH_STATE_PATH);
      console.log('✅ Found existing auth session, loading...');
      contextOptions.storageState = AUTH_STATE_PATH;
    } catch {
      console.log('⚠️  No existing session found, will create new one');
    }

    context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    // 4. YouTube Studio로 이동
    console.log('\n📺 Navigating to YouTube Studio...');
    await page.goto('https://studio.youtube.com');
    console.log('✅ Page loaded\n');

    // 5. 사용자에게 로그인 안내
    console.log('═══════════════════════════════════════════════════════');
    console.log('👤 MANUAL LOGIN REQUIRED');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('브라우저 창에서 다음 작업을 완료해주세요:');
    console.log('');
    console.log('1. Google 계정으로 로그인');
    console.log('2. 2단계 인증 완료 (필요한 경우)');
    console.log('3. YouTube Studio 접근 권한 허용');
    console.log('4. YouTube Studio 메인 화면이 보이면 완료');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // 6. 로그인 완료 대기 (Create 버튼 확인)
    console.log('⏳ Waiting for login completion...');
    console.log('   (YouTube Studio의 "만들기" 또는 "Create" 버튼이 나타날 때까지 대기)');

    try {
      // 최대 5분 대기
      await page.waitForSelector('[aria-label="만들기"], [aria-label="Create"]', {
        timeout: 300000, // 5분
        state: 'visible'
      });

      console.log('\n✅ Login successful! Create button detected.\n');
    } catch (error) {
      console.log('\n⚠️  Timeout waiting for login (5 minutes expired)');
      console.log('   If you have logged in, the session will still be saved.\n');
    }

    // 7. 세션 저장
    console.log('💾 Saving authentication session...');
    await context.storageState({ path: AUTH_STATE_PATH });
    console.log(`✅ Session saved to: ${AUTH_STATE_PATH}\n`);

    // 8. 세션 파일 확인
    const stats = await fs.stat(AUTH_STATE_PATH);
    console.log('📊 Session file info:');
    console.log(`   - Size: ${stats.size} bytes`);
    console.log(`   - Created: ${stats.birthtime.toLocaleString()}\n`);

    // 9. 완료 메시지
    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 SETUP COMPLETE!');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('다음 단계:');
    console.log('');
    console.log('1. youtube-browser-upload.service.ts 파일 수정:');
    console.log('   headless: false → headless: true (백그라운드 실행 모드)');
    console.log('');
    console.log('2. 이제 브라우저 자동화 업로드를 사용할 수 있습니다!');
    console.log('   - API 할당량 초과 시 자동으로 브라우저 업로드 사용');
    console.log('   - 또는 수동으로 YoutubeBrowserUploadService 호출');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');

    // 10. 브라우저 창 유지 (사용자가 확인할 수 있도록)
    console.log('\n⏸  Press Ctrl+C to close the browser and exit...\n');
    await new Promise(() => {}); // 무한 대기 (Ctrl+C로 종료)

  } catch (error) {
    console.error('\n❌ Error during browser test:', error.message);
    throw error;
  } finally {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  }
}

// 스크립트 실행
testBrowserLogin()
  .then(() => {
    console.log('\n✅ Test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });
