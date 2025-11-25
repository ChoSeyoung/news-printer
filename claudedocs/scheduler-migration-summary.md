# 스케줄러 마이그레이션 요약

## 변경 사항

### 기존 스케줄러 (비활성화됨)

#### 1. DaumNewsScheduleService
- **위치**: `src/news/services/daum-news-schedule.service.ts`
- **기능**: 1시간마다 Daum 뉴스 크롤링 및 업로드
- **상태**: `@Cron` 데코레이터 주석 처리로 **비활성화**
- **이유**: 새로운 통합 스케줄러로 대체

#### 2. PendingUploadScheduleService
- **위치**: `src/media/services/pending-upload-schedule.service.ts`
- **기능**: 매 시간 30분에 pending 영상 재업로드 시도
- **상태**: `@Cron` 데코레이터 주석 처리로 **비활성화**
- **이유**: 새로운 통합 스케줄러가 직접 브라우저 업로드를 수행하므로 불필요

### 새로운 스케줄러 (활성)

#### HourlyBrowserUploadScheduleService
- **위치**: `src/news/services/hourly-browser-upload-schedule.service.ts`
- **스케줄**: 매 시간 정각 (예: 1:00, 2:00, 3:00...)
- **실행 주기**: `@Cron(CronExpression.EVERY_HOUR)`

## 통합 스케줄러 동작 방식

### 1. 뉴스 스크래핑
```typescript
// Daum 국회 뉴스 크롤링 (기본 5개)
const articles = await daumScraper.fetchAllNews(maxArticlesPerRun);
```

### 2. 중복 체크 (자동)
```typescript
// 이미 업로드된 기사 자동 제외
const newArticles = articles.filter(
  (article) => !publishedTracking.isAlreadyPublished(article.url)
);
```

**중복 방지 로직**:
- ✅ URL 기반 중복 체크
- ✅ 제목 정규화 후 중복 체크
- ✅ 영구 저장 파일 기반 (`published-news-tracking.json`)
- ✅ 재시작 후에도 중복 방지 유지

### 3. 각 기사별 처리

#### 단계 1: AI 스크립트 생성
```typescript
const scripts = await geminiService.generateScripts(fullContent);
```

#### 단계 2: 숏폼 영상 업로드
```typescript
const shortsResult = await shortsPipeline.createAndUploadShorts({
  title: article.title,
  reporterScript: article.content,
  newsUrl: article.url,
  imageUrls: article.imageUrls,
});
```

#### 단계 3: 3초 대기 (API 부하 분산)

#### 단계 4: 롱폼 영상 업로드
```typescript
const longformResult = await mediaPipeline.publishNews({
  title: article.title,
  newsContent: article.content,
  anchorScript: scripts.anchor,
  reporterScript: scripts.reporter,
  newsUrl: article.url,
  imageUrls: article.imageUrls,
  privacyStatus: 'public',
});
```

#### 단계 5: 5초 대기 (다음 기사 전)

### 4. 업로드 추적 및 정리
```typescript
// 업로드 성공 시 자동으로 추적 기록 저장됨 (MediaPipelineService, ShortsPipelineService 내부)
await publishedNewsTrackingService.markAsPublished(url, title, videoId, videoUrl);

// 임시 이미지 파일 정리
await daumScraper.cleanupAllImages();
```

## 중복 방지 메커니즘 상세

### PublishedNewsTrackingService

#### 체크 메서드
```typescript
isAlreadyPublished(url: string, title?: string): boolean {
  // 1. URL 체크
  if (this.publishedNews.has(url)) return true;

  // 2. 제목 체크 (정규화 후)
  if (title) {
    const normalizedTitle = this.normalizeTitle(title);
    if (this.publishedTitles.has(normalizedTitle)) return true;
  }

  return false;
}
```

#### 저장 메서드
```typescript
async markAsPublished(url, title, videoId?, videoUrl?): Promise<void> {
  const record = {
    url,
    title,
    publishedAt: new Date().toISOString(),
    videoId,
    videoUrl,
  };

  // URL 인덱스에 추가
  this.publishedNews.set(url, record);

  // 제목 인덱스에도 추가
  this.publishedTitles.add(this.normalizeTitle(title));

  // 파일에 영구 저장
  await this.savePublishedNews();
}
```

### 저장 위치
- **파일**: `published-news-tracking.json`
- **형식**: JSON
- **내용**: URL, 제목, 업로드 시간, 비디오 ID/URL

## 장점

### 1. 완전 자동화
- ✅ 1시간마다 자동 실행
- ✅ 뉴스 스크래핑 → AI 처리 → 영상 생성 → 업로드까지 완전 자동
- ✅ 중복 방지 자동 처리

### 2. 브라우저 업로드
- ✅ YouTube API 할당량 절약
- ✅ Playwright 자동화로 안정적 업로드
- ✅ 실패 시 Telegram 알림

### 3. 롱폼 + 숏폼 통합
- ✅ 한 번에 두 가지 형식 모두 업로드
- ✅ 중복 처리 로직 단순화
- ✅ 관리 편의성 향상

### 4. 중복 방지
- ✅ URL 기반 정확한 중복 체크
- ✅ 제목 정규화로 유사 제목 체크
- ✅ 영구 저장으로 재시작 후에도 유지

## 실행 확인

### 로그 확인
```bash
# 서비스 시작 시
HourlyBrowserUploadScheduleService initialized
Schedule: Every hour at :00 (Scrape + Upload both longform & shortform)

# 매 시간 실행 시
=== Starting Hourly Browser Upload Job ===
📰 Fetched 5 articles from Daum News
✅ 3 new articles after duplicate check
[1/3] Processing: 기사 제목...
   🎬 Creating and uploading shortform video...
   ✅ Shortform uploaded: https://youtube.com/...
   🎬 Creating and uploading longform video...
   ✅ Longform uploaded: https://youtube.com/...
=== Hourly Job Completed: 6 success, 0 failed ===
```

### 수동 실행 (테스트용)
```typescript
// NewsController 또는 직접 서비스 호출
const scheduler = app.get(HourlyBrowserUploadScheduleService);
await scheduler.triggerManually();
```

## 설정

### 조정 가능한 파라미터

```typescript
// src/news/services/hourly-browser-upload-schedule.service.ts

// 각 실행당 최대 처리 기사 수
private readonly maxArticlesPerRun = 5;

// 공개 상태
private readonly privacyStatus: 'public' | 'private' | 'unlisted' = 'public';
```

### 스케줄 변경
```typescript
// 매 시간 정각 (현재 설정)
@Cron(CronExpression.EVERY_HOUR)

// 다른 옵션 예시:
// @Cron('0 */2 * * *')  // 2시간마다
// @Cron('0 9-18 * * *') // 9시~18시 사이 매 시간
// @Cron('0 9,12,15,18 * * *') // 9시, 12시, 15시, 18시
```

## 주의사항

### 1. 중복 실행 방지
- 이전 작업이 아직 실행 중이면 자동으로 스킵됨
- `isProcessing` 플래그로 관리

### 2. API Rate Limiting
- Gemini API: 분당 15회 제한 (GeminiService에서 관리)
- 기사 간 5초 대기
- 숏폼/롱폼 간 3초 대기

### 3. 에러 처리
- 개별 기사 실패 시 다음 기사 계속 처리
- 전체 작업 실패 시 로그 기록 후 다음 스케줄 대기

## 마이그레이션 체크리스트

- ✅ 기존 스케줄러 비활성화 완료
- ✅ 새 스케줄러 생성 완료
- ✅ news.module.ts에 등록 완료
- ✅ 중복 방지 로직 확인 완료
- ✅ 브라우저 업로드 통합 완료
- ✅ 롱폼 + 숏폼 통합 완료
- ✅ 에러 처리 및 로깅 완료

## 관련 파일

### 새로 생성
- `src/news/services/hourly-browser-upload-schedule.service.ts`

### 수정됨
- `src/news/news.module.ts` (새 스케줄러 등록)
- `src/news/services/daum-news-schedule.service.ts` (@Cron 주석 처리)
- `src/media/services/pending-upload-schedule.service.ts` (@Cron 주석 처리)

### 확인됨 (변경 없음)
- `src/media/services/published-news-tracking.service.ts` (중복 방지)
- `src/media/services/media-pipeline.service.ts` (롱폼 파이프라인)
- `src/media/services/shorts-pipeline.service.ts` (숏폼 파이프라인)
