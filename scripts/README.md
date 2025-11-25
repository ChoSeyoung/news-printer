# Scripts 디렉토리

YouTube 뉴스 자동화 시스템의 유틸리티 스크립트 모음

## 📜 사용 가능한 스크립트

### 1. 🆕 scrape-and-upload.ts

**Daum 뉴스 스크래핑 및 YouTube 업로드 스크립트**

현재 다음 뉴스(국회)에 올라와 있는 뉴스들을 스크래핑하고 YouTube에 자동 업로드합니다.

#### 사용법

```bash
# TypeScript 직접 실행
npx ts-node scripts/scrape-and-upload.ts [options]

# Shell 스크립트로 실행 (권장)
./scripts/scrape-and-upload.sh [options]
```

#### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--max <number>` | 최대 처리 기사 수 | `10` |
| `--type <type>` | 생성할 영상 타입 (`longform`, `shortform`) | `shortform` |

#### 예시

```bash
# 기본 실행 (10개 기사, shortform 영상)
./scripts/scrape-and-upload.sh

# 5개 기사만 처리
./scripts/scrape-and-upload.sh --max 5

# longform 영상으로 제작
./scripts/scrape-and-upload.sh --type longform

# 모든 옵션 조합
./scripts/scrape-and-upload.sh --max 3 --type longform
```

#### 동작 방식

1. **뉴스 스크래핑**: Daum 뉴스 국회 페이지에서 기사 크롤링
2. **이미지 처리**: 기사 이미지 다운로드 및 하단 100px 크롭 (워터마크 제거)
3. **영상 생성**:
   - **Shortform**: TTS 음성 생성 → 이미지 슬라이드 영상 생성
   - **Longform**: 상세 뉴스 영상 생성
4. **YouTube 업로드**:
   - 우선 YouTube API로 업로드 시도
   - API 실패 시 즉시 브라우저 자동화(Playwright)로 fallback
   - 두 방법 모두 실패하면 `pending-uploads/` 디렉토리에 저장
5. **텔레그램 알림**: 업로드 성공 시 자동 알림 전송

---

### 2. 🔄 retry-pending-uploads.ts

**업로드 실패한 영상 재시도 스크립트**

`pending-uploads/` 디렉토리에 저장된 실패한 업로드들을 브라우저 자동화로 재시도합니다.

#### 사용법

```bash
# TypeScript 직접 실행
npx ts-node scripts/retry-pending-uploads.ts [options]

# Shell 스크립트로 실행 (권장)
./scripts/retry-pending.sh [options]
```

#### 옵션

| 옵션 | 설명 | 기본값 |
|------|------|--------|
| `--type <type>` | 처리할 영상 타입 (`shortform`, `longform`, `all`) | `all` |
| `--max <number>` | 최대 처리 개수 | 무제한 |

#### 예시

```bash
# 모든 대기 중인 영상 재업로드
./scripts/retry-pending.sh

# Shortform 영상만 재업로드
./scripts/retry-pending.sh --type shortform

# Longform 영상 중 최대 5개만 재업로드
./scripts/retry-pending.sh --type longform --max 5
```

---

### 3. 🧪 test-browser-upload.ts

**브라우저 업로드 테스트 스크립트**

Playwright 브라우저 자동화 업로드 기능을 테스트합니다.

#### 사용법

```bash
npx ts-node scripts/test-browser-upload.ts
```

---

## 🛠️ 개발 가이드

### 새 스크립트 추가하기

1. `scripts/` 디렉토리에 TypeScript 파일 생성
2. Shebang 추가: `#!/usr/bin/env ts-node`
3. 실행 권한 부여: `chmod +x scripts/your-script.ts`
4. (선택) Shell wrapper 스크립트 생성

### 예시 템플릿

```typescript
#!/usr/bin/env ts-node

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function main() {
  console.log('🚀 Starting script...');

  try {
    // NestJS 앱 초기화
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    // 서비스 가져오기
    const myService = app.get(MyService);

    // 작업 수행
    await myService.doSomething();

    // 앱 종료
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
```

---

## 📊 자동화 스케줄

시스템에는 다음과 같은 자동화 스케줄이 설정되어 있습니다:

- **뉴스 크롤링 및 업로드**: 매시간 정각 실행 - 국회 뉴스만 처리 (`DaumNewsScheduleService`)
- **Pending 영상 재업로드**: 매시간 30분 실행 (`PendingUploadScheduleService`)

스크립트는 이러한 자동화를 보완하거나 수동으로 실행할 때 사용합니다.

---

## 🔧 문제 해결

### TypeScript 실행 오류

```bash
# ts-node가 설치되지 않은 경우
npm install -D ts-node

# 타입 오류 무시하고 실행
npx ts-node --transpile-only scripts/your-script.ts
```

### 권한 오류

```bash
# 실행 권한 부여
chmod +x scripts/your-script.ts
chmod +x scripts/your-script.sh
```

### 환경 변수 누락

스크립트 실행 전 `.env` 파일이 올바르게 설정되어 있는지 확인하세요:

```bash
# 필수 환경 변수
YOUTUBE_API_KEY=your_key
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json
TELEGRAM_BOT_TOKEN=your_token
TELEGRAM_CHAT_ID=your_chat_id
```

---

## 📝 참고 사항

- 모든 스크립트는 프로젝트 루트에서 실행되어야 합니다
- 브라우저 업로드는 headless 모드로 실행됩니다
- 업로드 실패 시 자동으로 `pending-uploads/` 디렉토리에 저장됩니다
- 대량 업로드 시 YouTube 정책을 준수하기 위해 적절한 지연시간이 포함되어 있습니다
