# YouTube 브라우저 자동화 업로드 가이드

## ⚠️ 중요 경고

**이 기능은 YouTube ToS 위반 가능성이 있으며, 계정 정지 위험이 있습니다.**

- **공식 API 사용 권장**: 프로덕션 환경에서는 YouTube Data API v3 사용을 강력히 권장합니다.
- **비상 대안**: 이 기능은 API 할당량 소진 시 **임시 대안**으로만 사용하세요.
- **책임**: 이 기능 사용으로 인한 모든 결과는 사용자 책임입니다.

---

## 📖 개요

Playwright를 활용한 브라우저 자동화로 YouTube Studio 웹 인터페이스를 통해 비디오를 업로드합니다.

### 장점
- ✅ YouTube API 할당량 제한 없음
- ✅ OAuth 인증 불필요 (세션 재사용)
- ✅ API로 불가능한 기능도 접근 가능

### 단점
- ❌ YouTube ToS 위반 가능성
- ❌ 계정 정지 위험
- ❌ UI 변경 시 스크립트 깨짐
- ❌ 느림 (API보다 5-10배)
- ❌ CAPTCHA/봇 감지 위험

---

## 🚀 설치

### 1. Playwright 설치

```bash
npm install playwright
```

### 2. Playwright 브라우저 설치

```bash
npx playwright install chromium
```

---

## 🔐 초기 설정 (최초 1회만)

브라우저 자동화는 YouTube 로그인 세션을 재사용합니다. 최초 1회만 수동 로그인이 필요합니다.

### 수동 로그인 프로세스

1. **`youtube-browser-upload.service.ts` 수정**

```typescript
// Line 43: headless 모드 비활성화
this.browser = await chromium.launch({
  headless: false, // false로 변경 (브라우저 창이 보임)
  args: [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ],
});
```

2. **테스트 스크립트 실행**

브라우저 창이 열리면서 YouTube Studio로 이동합니다.

3. **수동으로 로그인**

- Google 계정으로 로그인
- 2단계 인증 완료 (필요 시)
- YouTube Studio 접근 권한 허용

4. **로그인 완료 후 자동 세션 저장**

로그인이 완료되면 세션이 `temp/youtube-auth-state.json`에 자동 저장됩니다.

5. **headless 모드 재활성화**

```typescript
// Line 43: 다시 headless 모드로 변경
this.browser = await chromium.launch({
  headless: true, // true로 변경 (백그라운드 실행)
  ...
});
```

이제 이후 모든 업로드는 자동으로 저장된 세션을 사용합니다.

---

## 📝 사용법

### 서비스 주입

```typescript
import { YoutubeBrowserUploadService } from './services/youtube-browser-upload.service';

constructor(
  private readonly browserUploadService: YoutubeBrowserUploadService,
) {}
```

### 기본 업로드

```typescript
const result = await this.browserUploadService.uploadVideo({
  videoPath: '/path/to/video.mp4',
  title: '뉴스 제목',
  description: '뉴스 설명\n\n#태그1 #태그2',
  tags: ['뉴스', '속보', '정치'],
  privacyStatus: 'public',
  thumbnailPath: '/path/to/thumbnail.jpg', // 선택
  categoryId: '25', // News & Politics
});

if (result.success) {
  console.log(`✅ 업로드 성공: ${result.videoUrl}`);
} else {
  console.error(`❌ 업로드 실패: ${result.error}`);
}
```

### 업로드 결과

```typescript
interface BrowserUploadResult {
  success: boolean;      // 성공 여부
  videoUrl?: string;     // YouTube 비디오 URL
  videoId?: string;      // YouTube 비디오 ID
  error?: string;        // 에러 메시지
}
```

---

## 🧠 인간 행동 패턴 시뮬레이션

봇 감지를 회피하기 위해 다음과 같은 인간 행동 패턴을 시뮬레이션합니다:

### 1. **랜덤 지연 (Random Delays)**

```typescript
await this.randomDelay(1000, 5000); // 1-5초 랜덤 대기
```

- 각 액션 사이 1-5초 랜덤 지연
- 페이지 전환 후 2-4초 대기
- 버튼 클릭 후 1-3초 대기

### 2. **인간처럼 타이핑**

```typescript
// 한 글자씩 50-200ms 간격으로 타이핑
for (const char of text) {
  await element.type(char, { delay: Math.random() * 150 + 50 });
}
```

### 3. **부드러운 스크롤**

```typescript
window.scrollBy({
  top: scrollDistance,
  behavior: 'smooth', // 부드러운 스크롤
});
```

### 4. **실제 User-Agent**

```typescript
userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
```

### 5. **자동화 감지 우회**

```typescript
args: ['--disable-blink-features=AutomationControlled']
```

---

## 🔄 업로드 프로세스

### 전체 프로세스 (7단계)

```
1️⃣ YouTube Studio 로그인 확인 (세션 재사용)
   ↓
2️⃣ Create 버튼 클릭
   ↓
3️⃣ Upload videos 클릭
   ↓
4️⃣ 비디오 파일 업로드
   ↓
5️⃣ 메타데이터 입력 (제목, 설명, 썸네일)
   ↓
6️⃣ Next 버튼 3번 클릭 (Details → Elements → Checks → Visibility)
   ↓
7️⃣ 공개 설정 선택 → Publish
```

### 예상 소요 시간

- **짧은 영상 (< 1분)**: 약 2-3분
- **중간 영상 (1-5분)**: 약 3-5분
- **긴 영상 (> 5분)**: 약 5-10분

(API 업로드: 30초-2분)

---

## 🛠️ pending-uploads 재업로드 통합

### 자동 재업로드 시스템 구축

`FailedUploadStorageService`에서 저장된 실패 영상을 브라우저 업로드로 재시도:

```typescript
import { YoutubeBrowserUploadService } from './youtube-browser-upload.service';

async retryWithBrowser(savedVideoPath: string, metadataPath: string) {
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));

  const result = await this.browserUploadService.uploadVideo({
    videoPath: savedVideoPath,
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags || [],
    privacyStatus: metadata.privacyStatus || 'unlisted',
    thumbnailPath: metadata.thumbnailPath,
    categoryId: metadata.categoryId,
  });

  if (result.success) {
    // 업로드 성공 시 pending-uploads에서 삭제
    await fs.unlink(savedVideoPath);
    await fs.unlink(metadataPath);

    this.logger.log(`✅ Retry successful: ${result.videoUrl}`);
  }

  return result;
}
```

### Cron 스케줄러로 자동 재시도

```typescript
import { Cron } from '@nestjs/schedule';

@Cron('0 18 * * *') // 매일 18:00 (할당량 리셋 후)
async retryFailedUploads() {
  const pendingFiles = await this.getPendingUploads();

  for (const file of pendingFiles) {
    this.logger.log(`Retrying upload: ${file.title}`);
    await this.retryWithBrowser(file.videoPath, file.metadataPath);

    // 각 업로드 간 10-15초 대기 (봇 감지 회피)
    await new Promise(resolve => setTimeout(resolve, 10000 + Math.random() * 5000));
  }
}
```

---

## ⚙️ 설정 옵션

### 브라우저 설정

```typescript
// headless 모드 (백그라운드 실행)
headless: true,

// 디버깅 모드 (브라우저 창 보이기)
headless: false,

// 화면 해상도
viewport: { width: 1920, height: 1080 },
```

### 타임아웃 설정

```typescript
// 로그인 대기 시간 (기본: 2분)
await page.waitForSelector('[aria-label="Create"]', { timeout: 120000 });

// 업로드 완료 대기 시간 (기본: 5분)
await page.waitForSelector('ytcp-video-share-url', { timeout: 300000 });
```

---

## 🐛 문제 해결

### 1. **"Browser not installed" 에러**

```bash
npx playwright install chromium
```

### 2. **"Login required" 에러**

- `headless: false`로 변경
- 수동 로그인 후 `temp/youtube-auth-state.json` 생성 확인
- `headless: true`로 복원

### 3. **CAPTCHA 출현**

- 업로드 간격을 더 길게 설정 (15-30초)
- 하루 업로드 횟수 제한 (10-20개)
- 다른 IP/계정 사용 검토

### 4. **계정 정지 위험**

- 브라우저 업로드는 **비상 대안**으로만 사용
- 가능하면 **YouTube API 할당량 증가 신청** 권장
- 업로드 빈도를 사람처럼 유지 (하루 5-10개)

---

## 📊 성능 비교

| 항목 | YouTube API | 브라우저 자동화 |
|------|-------------|----------------|
| **속도** | ⚡ 빠름 (30초-2분) | 🐌 느림 (2-10분) |
| **안정성** | ✅ 높음 | ⚠️ 보통 |
| **할당량** | ❌ 10,000 units/day | ✅ 무제한 |
| **ToS 준수** | ✅ 안전 | ❌ 위험 |
| **유지보수** | ✅ 안정적 | ⚠️ UI 변경 시 깨짐 |

---

## 📋 체크리스트

### 초기 설정
- [ ] Playwright 설치 완료
- [ ] 브라우저 설치 완료 (`npx playwright install chromium`)
- [ ] 수동 로그인 완료 (`temp/youtube-auth-state.json` 생성 확인)
- [ ] headless 모드 재활성화

### 안전 사용
- [ ] 업로드 간격 10-15초 이상 유지
- [ ] 하루 업로드 제한 (5-20개)
- [ ] API 할당량 증가 신청 진행
- [ ] 정기적으로 계정 상태 확인

---

## 🎯 권장 사용 시나리오

### ✅ 사용 가능

1. **API 할당량 소진 후 긴급 업로드**
   - 하루 할당량 10,000 units 소진
   - 다음날 17:00 (할당량 리셋) 전까지 업로드 필요

2. **테스트/개발 환경**
   - 프로덕션 전 기능 테스트
   - 소량 업로드 (< 5개/day)

### ❌ 사용 지양

1. **대규모 자동화**
   - 하루 100개 이상 업로드
   - 24시간 연속 업로드

2. **프로덕션 기본 방식**
   - YouTube API가 기본 업로드 방식
   - 브라우저 자동화는 비상 대안

---

## 📚 참고 자료

- [Playwright 공식 문서](https://playwright.dev)
- [YouTube Studio](https://studio.youtube.com)
- [YouTube ToS](https://www.youtube.com/t/terms)
- [YouTube Data API v3](https://developers.google.com/youtube/v3)

---

## 🤝 기여

버그 발견 시 이슈 등록 또는 PR 제출 환영합니다!

---

## 📄 라이선스

이 코드는 교육/연구 목적으로만 사용하세요. 상업적 사용 시 법적 책임은 사용자에게 있습니다.
