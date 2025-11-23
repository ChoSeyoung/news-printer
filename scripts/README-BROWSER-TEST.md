# 브라우저 자동화 테스트 가이드

## 📋 목적

YouTube 로그인 세션을 저장하여, 브라우저 자동화 업로드를 사용할 수 있도록 초기 설정하는 테스트 스크립트입니다.

## 🚀 실행 단계

### 1단계: Playwright 브라우저 설치

```bash
# Chromium 브라우저 설치 (최초 1회만)
npx playwright install chromium
```

### 2단계: youtube-browser-upload.service.ts 수정

파일 경로: `src/media/services/youtube-browser-upload.service.ts`

```typescript
// Line 43 수정:

// BEFORE (headless 모드)
this.browser = await chromium.launch({
  headless: true,  // ← 이 부분을 false로 변경
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});

// AFTER (visible 모드)
this.browser = await chromium.launch({
  headless: false,  // ← false로 변경 (브라우저 창이 보임)
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});
```

### 3단계: 테스트 스크립트 실행

```bash
npx ts-node scripts/test-browser-upload.ts
```

### 4단계: 수동 로그인

브라우저 창이 자동으로 열리면 다음 작업을 수행:

1. **Google 계정으로 로그인**
2. **2단계 인증 완료** (필요한 경우)
3. **YouTube Studio 접근 권한 허용**
4. **YouTube Studio 메인 화면**이 보이면 완료

### 5단계: 세션 저장 확인

로그인이 완료되면 자동으로 세션이 저장됩니다:
- 저장 경로: `temp/youtube-auth-state.json`
- 콘솔에서 "✅ Session saved" 메시지 확인

### 6단계: youtube-browser-upload.service.ts 복원

```typescript
// Line 43을 다시 headless: true로 변경:

this.browser = await chromium.launch({
  headless: true,  // ← true로 복원 (백그라운드 실행)
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});
```

## ✅ 완료!

이제 브라우저 자동화 업로드를 사용할 수 있습니다.

## 🔧 사용 방법

### 자동 사용 (API 할당량 초과 시)

YouTube Data API 할당량이 초과되면 자동으로 브라우저 업로드로 전환됩니다.

### 수동 사용

```typescript
import { YoutubeBrowserUploadService } from './services/youtube-browser-upload.service';

const result = await browserUploadService.uploadVideo({
  videoPath: '/path/to/video.mp4',
  title: '뉴스 제목',
  description: '뉴스 설명',
  tags: ['뉴스', '속보'],
  privacyStatus: 'public',
  thumbnailPath: '/path/to/thumbnail.jpg',
  categoryId: '25', // News & Politics
});

if (result.success) {
  console.log(`업로드 성공: ${result.videoUrl}`);
}
```

## 🐛 문제 해결

### 브라우저가 열리지 않음

```bash
# Playwright 브라우저 재설치
npx playwright install chromium
```

### 로그인 후 세션이 저장되지 않음

- 스크립트를 Ctrl+C로 강제 종료하지 마세요
- "만들기" 또는 "Create" 버튼이 나타날 때까지 대기
- 최대 5분 대기 후 자동 저장

### CAPTCHA 또는 봇 감지

- 정상적인 속도로 로그인 진행
- VPN 사용 중이면 비활성화
- 다른 브라우저/IP에서 시도

## 📝 참고 사항

- 세션은 `temp/youtube-auth-state.json`에 저장됩니다
- 이 파일은 `.gitignore`에 포함되어 있어 커밋되지 않습니다
- 세션은 일정 기간 후 만료될 수 있으며, 만료 시 다시 로그인 필요
- 보안을 위해 세션 파일을 공유하지 마세요

## ⚠️ 보안 경고

- `temp/youtube-auth-state.json` 파일은 **절대 공유하지 마세요**
- 이 파일에는 YouTube 계정 접근 권한이 포함되어 있습니다
- Git에 커밋되지 않도록 `.gitignore`에 포함되어 있습니다
