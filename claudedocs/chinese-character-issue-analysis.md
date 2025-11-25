# 한자 치환 미적용 원인 분석 보고서

## 🔍 문제 상황

유튜브 업로드 시 제목에 한자가 그대로 노출되는 문제 발생

**예시**:
- "李, 與野 합의 강조" → "이재명, 여야 합의 강조" (치환되어야 함)
- "尹 대통령, 檢 개혁 발표" → "윤석열 대통령, 검찰 개혁 발표" (치환되어야 함)

## 🎯 근본 원인 (Root Cause)

### 문제점: 파이프라인 순서 오류

```
현재 흐름:
뉴스 제목 (한자 포함)
  ↓
SEO 최적화 (한자 그대로 유지) ❌
  ↓
YouTube API/Browser 업로드 (한자 치환) ✅
  ↓
하지만 이미 SEO 최적화된 제목 사용됨 ❌
```

**핵심 문제**: SEO 최적화 단계에서 한자 치환을 하지 않고, 업로드 단계에서만 치환하지만, **SEO 최적화된 제목을 먼저 사용**하기 때문에 치환이 반영되지 않음.

## 📋 상세 분석

### 1. 한자 치환 로직 위치

#### ✅ 정상 작동 중: TextPreprocessor 유틸리티
**파일**: `src/common/utils/text-preprocessor.util.ts`

```typescript
static preprocessText(text: string): string {
  return text
    // 현직 대통령 이름 치환 (한자)
    .replace(/李/g, '이재명')
    .replace(/尹/g, '윤석열')
    // 전직 대통령 치환 (한자)
    .replace(/盧/g, '노무현')
    // 정치 관련 한자 치환
    .replace(/與/g, '여당')
    .replace(/野/g, '야당')
    .replace(/靑/g, '청와대')
    .replace(/檢/g, '검찰')
    .replace(/黨/g, '당')
    .replace(/親/g, '친')
    .replace(/非/g, '비')
    .replace(/發/g, '발')
    .replace(/號/g, '호');
}
```

**사용 위치**:
1. ✅ `youtube.service.ts:214` - YouTube API 업로드 시
2. ✅ `youtube-browser-upload.service.ts:429` - 브라우저 업로드 시

### 2. 문제의 파이프라인 흐름

#### A. 롱폼 영상 (MediaPipelineService)
**파일**: `src/media/services/media-pipeline.service.ts`

```typescript
// Step 3: SEO 최적화 (한자 치환 없음) ❌
const seoMetadata = await this.seoOptimizerService.generateSeoMetadata({
  originalTitle: options.title, // "李, 與野 합의 강조" (한자 그대로)
  newsContent: options.newsContent,
  anchorScript: options.anchorScript,
  reporterScript: options.reporterScript,
});

// Step 6: YouTube 업로드
const uploadResult = await this.youtubeService.uploadVideo({
  title: seoMetadata.optimizedTitle, // ❌ SEO 최적화된 제목 사용 (한자 포함)
  description: seoMetadata.optimizedDescription,
  // ...
});
```

**SEO Optimizer 내부** (`src/media/services/seo-optimizer.service.ts:276`):
```typescript
private optimizeTitle(
  originalTitle: string,
  keywords: string[],
  category: string,
): string {
  // ❌ 원본 제목 그대로 사용 (한자 치환 없음)
  let title = originalTitle;

  // 100자 제한만 적용
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }

  return title; // "李, 與野 합의 강조" 그대로 반환
}
```

#### B. 숏폼 영상 (ShortsPipelineService)
**파일**: `src/media/services/shorts-pipeline.service.ts`

```typescript
// Step 4: Shorts 메타데이터 준비
const shortsTitle = this.optimizeShortsTitle(options.title); // ❌ 한자 치환 없음

// Step 5: YouTube 업로드
const uploadResult = await this.youtubeService.uploadVideo({
  title: shortsTitle, // ❌ 최적화된 제목 사용 (한자 포함)
  description: shortsDescription,
  // ...
});
```

**Shorts Title 최적화** (`src/media/services/shorts-pipeline.service.ts:337`):
```typescript
private optimizeShortsTitle(originalTitle: string): string {
  // ❌ 원본 제목에 해시태그만 추가 (한자 치환 없음)
  let title = originalTitle;

  // #Shorts 해시태그 추가
  if (!title.includes('#Shorts')) {
    title = `${title} #Shorts`;
  }

  return title; // "李, 與野 합의 강조 #Shorts" (한자 그대로)
}
```

### 3. YouTube 업로드 단계 (너무 늦음)

#### YouTube API 업로드
**파일**: `src/media/services/youtube.service.ts:214`

```typescript
// ✅ 여기서 한자 치환이 이루어지지만...
const preprocessedTitle = TextPreprocessor.preprocessText(options.title);
const preprocessedDescription = TextPreprocessor.preprocessText(options.description);

// ⚠️ 하지만 options.title은 이미 SEO 최적화된 제목
// 즉, "李, 與野 합의 강조"가 아니라
// SeoOptimizerService에서 넘어온 제목이 이미 여기 들어옴
```

**문제**: `options.title`에는 이미 SEO 최적화된 제목이 들어오기 때문에, 여기서 치환해도 **이미 파이프라인 앞단에서 제목이 결정됨**.

## 🔧 해결 방법

### 옵션 1: SEO 최적화 단계에서 한자 치환 (권장)

**수정 파일**: `src/media/services/seo-optimizer.service.ts`

```typescript
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

private optimizeTitle(
  originalTitle: string,
  keywords: string[],
  category: string,
): string {
  // ✅ 1. 먼저 한자 치환
  let title = TextPreprocessor.preprocessText(originalTitle);

  // 2. 100자 제한
  if (title.length > 100) {
    title = title.substring(0, 97) + '...';
  }

  return title;
}
```

**장점**:
- ✅ 모든 파이프라인에서 일관되게 적용
- ✅ SEO 메타데이터에도 한글 제목 포함
- ✅ 최소한의 수정으로 해결

### 옵션 2: Shorts Title 최적화에서도 치환

**수정 파일**: `src/media/services/shorts-pipeline.service.ts`

```typescript
import { TextPreprocessor } from '../../common/utils/text-preprocessor.util';

private optimizeShortsTitle(originalTitle: string): string {
  // ✅ 1. 먼저 한자 치환
  let title = TextPreprocessor.preprocessText(originalTitle);

  // 2. #Shorts 해시태그 추가
  if (!title.includes('#Shorts')) {
    title = `${title} #Shorts`;
  }

  return title;
}
```

### 옵션 3: 파이프라인 시작 단계에서 전처리 (가장 안전)

**수정 파일**:
1. `src/media/services/media-pipeline.service.ts`
2. `src/media/services/shorts-pipeline.service.ts`

```typescript
async publishNews(options: PublishNewsOptions): Promise<PublishNewsResult> {
  try {
    // ✅ 파이프라인 시작 시 제목 전처리
    const preprocessedTitle = TextPreprocessor.preprocessText(options.title);

    // 전처리된 제목으로 모든 작업 수행
    const processedOptions = {
      ...options,
      title: preprocessedTitle,
    };

    // 나머지 파이프라인 로직...
    const seoMetadata = await this.seoOptimizerService.generateSeoMetadata({
      originalTitle: processedOptions.title, // 이미 한자 치환됨
      // ...
    });
  }
}
```

**장점**:
- ✅ 한 곳에서 전처리 완료
- ✅ 파이프라인 전체에 자동 적용
- ✅ 중복 치환 방지

## 📊 영향 범위

### 영향받는 파일
1. ❌ `src/media/services/seo-optimizer.service.ts` (현재 치환 없음)
2. ❌ `src/media/services/shorts-pipeline.service.ts` (현재 치환 없음)
3. ✅ `src/media/services/youtube.service.ts` (치환 있지만 너무 늦음)
4. ✅ `src/media/services/youtube-browser-upload.service.ts` (치환 있지만 너무 늦음)

### 영향받는 기능
- ❌ 롱폼 영상 업로드 제목
- ❌ 숏폼 영상 업로드 제목
- ❌ SEO 메타데이터 (제목, 설명)
- ✅ YouTube API 직접 업로드 (하지만 SEO 제목 사용하므로 무용)
- ✅ 브라우저 업로드 (하지만 SEO 제목 사용하므로 무용)

## ⚠️ 추가 발견 사항

### 1. 중복 치환 가능성
현재 `youtube.service.ts`와 `youtube-browser-upload.service.ts`에서 모두 치환하고 있음.
→ 옵션 1 또는 3 적용 시 이 부분은 제거해도 됨 (중복 방지)

### 2. 설명(description)도 동일한 문제
제목뿐만 아니라 설명에도 한자가 포함될 수 있음.
→ `optimizeDescription()` 메서드에도 동일한 수정 필요

```typescript
// src/media/services/seo-optimizer.service.ts:313
private async optimizeDescription(
  newsContent: string,
  anchorScript: string,
  reporterScript: string,
  keywords: string[],
): Promise<string> {
  // ✅ 생성된 설명도 한자 치환 필요
  const summary = await this.createCompleteSummary(newsContent, anchorScript, reporterScript);
  const preprocessedSummary = TextPreprocessor.preprocessText(summary);
  // ...
}
```

## 🎯 권장 수정 방안

### 최종 권장: 옵션 1 + 설명 치환

**이유**:
1. 최소한의 수정으로 해결 가능
2. SEO 최적화 로직 내부에서 완결
3. 파이프라인 전체에 자동 적용
4. 중복 치환 없음

**수정 필요 파일**:
1. `src/media/services/seo-optimizer.service.ts`
   - `optimizeTitle()` 메서드에 치환 추가
   - `optimizeDescription()` 메서드에 치환 추가

2. `src/media/services/shorts-pipeline.service.ts`
   - `optimizeShortsTitle()` 메서드에 치환 추가

**제거 가능 (선택사항)**:
- `youtube.service.ts:214-215`의 치환 로직
- `youtube-browser-upload.service.ts:429, 470`의 치환 로직

→ SEO 단계에서 이미 치환했으므로 중복 방지 가능

## 📝 테스트 시나리오

### 테스트 케이스
1. **한자 포함 제목**
   - 입력: "李, 與野 합의 강조"
   - 기대: "이재명, 여야 합의 강조"

2. **영문 이니셜 포함 제목**
   - 입력: "MB 정부의 DJ 추모식"
   - 기대: "이명박 정부의 김대중 추모식"

3. **혼합 제목**
   - 입력: "尹 대통령, 與野 청문회 참석"
   - 기대: "윤석열 대통령, 여야 청문회 참석"

4. **치환 불필요 제목**
   - 입력: "국회 본회의 개최"
   - 기대: "국회 본회의 개최" (변화 없음)

## 🚀 구현 우선순위

1. **높음**: `SeoOptimizerService.optimizeTitle()` 수정
2. **높음**: `ShortsPipelineService.optimizeShortsTitle()` 수정
3. **중간**: `SeoOptimizerService.optimizeDescription()` 수정
4. **낮음**: 중복 치환 로직 제거 (youtube.service, youtube-browser-upload.service)

## 📌 결론

**원인**: SEO 최적화 단계에서 한자를 치환하지 않고 원본 제목을 그대로 사용함

**해결**: SEO 최적화 메서드에 `TextPreprocessor.preprocessText()` 호출 추가

**예상 효과**: 모든 업로드 영상 제목에서 한자가 자동으로 한글로 치환됨
