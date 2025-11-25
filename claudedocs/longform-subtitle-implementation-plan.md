# 롱폼 영상 자막 적용 구현 계획

## 현황 분석

### ✅ 이미 구현된 기능

#### 1. TTS 서비스 - 자막 타이밍 생성
**파일**: `src/media/services/tts.service.ts`

**메서드**: `generateSpeechWithTimings()`
```typescript
async generateSpeechWithTimings(options: TtsOptions): Promise<TtsResult> {
  // TTS 음성 생성
  const [response] = await this.client.synthesizeSpeech(request);

  // 자막 타이밍 계산 (문장 기반 추정) ✅
  if (options.enableTimepoints && sentences.length > 0) {
    subtitles = await this.estimateSubtitleTimings(
      sentences,
      filepath,
      options.speakingRate || 1.15
    );
  }

  return {
    audioPath: filepath,
    subtitles,  // SubtitleTiming[] 반환 ✅
  };
}
```

**인터페이스**:
```typescript
export interface TtsResult {
  audioPath: string;
  subtitles?: SubtitleTiming[];  // 자막 타이밍 정보
}

export interface SubtitleTiming {
  text: string;          // 자막 텍스트
  startTime: number;     // 시작 시간 (초)
  endTime: number;       // 종료 시간 (초)
}
```

#### 2. VideoService - 자막 지원 인터페이스
**파일**: `src/media/services/video.service.ts`

**인터페이스**: `VideoOptions`
```typescript
export interface VideoOptions {
  audioFiles: string[];
  backgroundImagePaths?: string[];
  addEndScreen?: boolean;
  endScreenDuration?: number;
  title?: string;
  script?: string;
  subtitles?: SubtitleTiming[];  // ✅ 이미 정의되어 있음!
}
```

#### 3. Shorts 파이프라인 - 자막 적용 예시
**파일**: `src/media/services/shorts-pipeline.service.ts`

```typescript
// 2️⃣ Google TTS로 음성 생성 (타임포인트 포함)
const ttsResult = await this.ttsService.generateSpeechWithTimings({
  text: shortsScript,
  voice: 'FEMALE',
  speakingRate: 1.0,
  enableTimepoints: true,  // ✅ 자막 타이밍 생성 활성화
});
audioPath = ttsResult.audioPath;
const subtitles = ttsResult.subtitles;  // ✅ 자막 데이터 가져오기

// 3️⃣ 세로 영상 렌더링 (자막 포함)
videoPath = await this.shortsVideoService.createShortsVideo(
  audioPath,
  imagePath,
  options.title,
  shortsScript,
  subtitles,  // ✅ 자막 전달
);
```

---

## 🎯 구현 방안

### 옵션 1: 기존 TTS 메서드 확장 (권장)

#### 현재 상황
**파일**: `src/media/services/tts.service.ts`

```typescript
// 현재 롱폼용 TTS 생성 메서드 (자막 타이밍 미지원)
async generateNewsScripts(
  anchorScript: string,
  reporterScript: string,
): Promise<{ anchorPath: string; reporterPath: string }> {
  // 앵커 음성 생성
  const anchorPath = await this.generateSpeech({
    text: anchorScript,
    voice: 'FEMALE',
    speakingRate: 1.0,
  });

  // 리포터 음성 생성
  const reporterPath = await this.generateSpeech({
    text: reporterScript,
    voice: 'MALE',
    speakingRate: 1.0,
  });

  return { anchorPath, reporterPath };
}
```

#### 수정 방안 A: 기존 메서드에 자막 타이밍 추가
```typescript
// 자막 타이밍 포함하도록 반환 타입 변경
async generateNewsScripts(
  anchorScript: string,
  reporterScript: string,
): Promise<{
  anchorPath: string;
  reporterPath: string;
  anchorSubtitles?: SubtitleTiming[];
  reporterSubtitles?: SubtitleTiming[];
}> {
  // 앵커 음성 생성 (자막 타이밍 포함)
  const anchorResult = await this.generateSpeechWithTimings({
    text: anchorScript,
    voice: 'FEMALE',
    speakingRate: 1.0,
    enableTimepoints: true,  // ✅ 자막 활성화
  });

  // 리포터 음성 생성 (자막 타이밍 포함)
  const reporterResult = await this.generateSpeechWithTimings({
    text: reporterScript,
    voice: 'MALE',
    speakingRate: 1.0,
    enableTimepoints: true,  // ✅ 자막 활성화
  });

  return {
    anchorPath: anchorResult.audioPath,
    reporterPath: reporterResult.audioPath,
    anchorSubtitles: anchorResult.subtitles,
    reporterSubtitles: reporterResult.subtitles,
  };
}
```

#### 수정 방안 B: 새 메서드 추가 (하위 호환성 유지)
```typescript
// 기존 메서드는 유지
async generateNewsScripts(...): Promise<{ anchorPath, reporterPath }> {
  // 기존 로직 유지
}

// 새로운 메서드: 자막 포함
async generateNewsScriptsWithSubtitles(
  anchorScript: string,
  reporterScript: string,
): Promise<{
  anchorPath: string;
  reporterPath: string;
  anchorSubtitles: SubtitleTiming[];
  reporterSubtitles: SubtitleTiming[];
}> {
  const anchorResult = await this.generateSpeechWithTimings({
    text: anchorScript,
    voice: 'FEMALE',
    speakingRate: 1.0,
    enableTimepoints: true,
  });

  const reporterResult = await this.generateSpeechWithTimings({
    text: reporterScript,
    voice: 'MALE',
    speakingRate: 1.0,
    enableTimepoints: true,
  });

  return {
    anchorPath: anchorResult.audioPath,
    reporterPath: reporterResult.audioPath,
    anchorSubtitles: anchorResult.subtitles || [],
    reporterSubtitles: reporterResult.subtitles || [],
  };
}
```

---

### 옵션 2: MediaPipelineService 수정

#### 현재 코드 (Line 102-109)
```typescript
// Step 1: Generate TTS audio files
const { anchorPath, reporterPath } = await this.ttsService.generateNewsScripts(
  options.anchorScript,
  options.reporterScript,
);
```

#### 수정 후 (자막 포함)
```typescript
// Step 1: Generate TTS audio files with subtitles
const {
  anchorPath,
  reporterPath,
  anchorSubtitles,
  reporterSubtitles,
} = await this.ttsService.generateNewsScriptsWithSubtitles(
  options.anchorScript,
  options.reporterScript,
);
```

#### VideoService 호출 시 자막 전달 (Line 188-193)
**현재**:
```typescript
videoPath = await this.videoService.createVideo({
  audioFiles: [anchorPath, reporterPath],
  backgroundImagePaths: videoBackgroundImages,
  addEndScreen: isLongForm,
  endScreenDuration: 10,
});
```

**수정 후**:
```typescript
// 앵커와 리포터 자막 병합
const allSubtitles = this.mergeSubtitles(
  anchorSubtitles || [],
  reporterSubtitles || [],
  anchorPath,
  reporterPath,
);

videoPath = await this.videoService.createVideo({
  audioFiles: [anchorPath, reporterPath],
  backgroundImagePaths: videoBackgroundImages,
  addEndScreen: isLongForm,
  endScreenDuration: 10,
  subtitles: allSubtitles,  // ✅ 자막 전달
});
```

---

### 옵션 3: 자막 병합 헬퍼 메서드

#### MediaPipelineService에 추가
```typescript
/**
 * 앵커와 리포터 자막을 시간 순서대로 병합
 */
private async mergeSubtitles(
  anchorSubtitles: SubtitleTiming[],
  reporterSubtitles: SubtitleTiming[],
  anchorAudioPath: string,
  reporterAudioPath: string,
): Promise<SubtitleTiming[]> {
  // 앵커 음성 길이 가져오기
  const anchorDuration = await this.getAudioDuration(anchorAudioPath);

  // 리포터 자막 시작 시간 조정 (앵커 음성 길이만큼 offset)
  const adjustedReporterSubtitles = reporterSubtitles.map(sub => ({
    text: sub.text,
    startTime: sub.startTime + anchorDuration,
    endTime: sub.endTime + anchorDuration,
  }));

  // 병합 및 시간 순서대로 정렬
  return [...anchorSubtitles, ...adjustedReporterSubtitles].sort(
    (a, b) => a.startTime - b.startTime
  );
}

/**
 * 음성 파일 길이 가져오기
 */
private async getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}
```

---

## 🚀 구현 단계

### Phase 1: TTS 서비스 확장
1. ✅ `generateNewsScriptsWithSubtitles()` 메서드 추가
2. ✅ 기존 메서드 유지 (하위 호환성)

### Phase 2: MediaPipelineService 수정
1. ✅ TTS 호출 시 자막 데이터 받기
2. ✅ 자막 병합 헬퍼 메서드 추가
3. ✅ VideoService에 자막 전달

### Phase 3: VideoService 확인
1. ✅ 이미 `subtitles` 파라미터 지원 확인
2. ✅ FFmpeg 자막 렌더링 로직 확인 (이미 구현되어 있을 가능성 높음)

### Phase 4: 테스트
1. ⏳ 롱폼 영상 생성 테스트
2. ⏳ 자막 타이밍 검증
3. ⏳ 앵커/리포터 자막 병합 검증

---

## 📋 필요한 코드 변경

### 1. tts.service.ts
```typescript
// 새 메서드 추가
async generateNewsScriptsWithSubtitles(
  anchorScript: string,
  reporterScript: string,
): Promise<{
  anchorPath: string;
  reporterPath: string;
  anchorSubtitles: SubtitleTiming[];
  reporterSubtitles: SubtitleTiming[];
}> { ... }
```

### 2. media-pipeline.service.ts
```typescript
// Step 1 수정
const { anchorPath, reporterPath, anchorSubtitles, reporterSubtitles } =
  await this.ttsService.generateNewsScriptsWithSubtitles(...);

// 자막 병합 헬퍼 추가
private async mergeSubtitles(...): Promise<SubtitleTiming[]> { ... }
private async getAudioDuration(audioPath: string): Promise<number> { ... }

// Step 5 수정 (VideoService 호출)
const allSubtitles = await this.mergeSubtitles(...);
videoPath = await this.videoService.createVideo({
  ...,
  subtitles: allSubtitles,
});
```

---

## ⚙️ 설정 옵션

### 자막 활성화/비활성화
```typescript
// 환경 변수로 제어 가능하도록
const ENABLE_LONGFORM_SUBTITLES = process.env.ENABLE_LONGFORM_SUBTITLES === 'true';

if (ENABLE_LONGFORM_SUBTITLES) {
  // 자막 포함
  const result = await this.ttsService.generateNewsScriptsWithSubtitles(...);
} else {
  // 자막 미포함
  const result = await this.ttsService.generateNewsScripts(...);
}
```

---

## 🎨 자막 스타일

VideoService가 이미 자막을 지원한다면, 다음과 같은 스타일이 적용될 것:
- 폰트: 굵은 고딕체
- 크기: 가독성 좋은 크기
- 위치: 하단 중앙
- 배경: 반투명 검은색 박스
- 색상: 흰색 텍스트

---

## ✅ 장점

### 1. 가독성 향상
- 🎯 시청자가 내용을 더 쉽게 이해
- 🎯 청각 장애인 접근성 향상

### 2. SEO 효과
- 🎯 YouTube 자동 자막보다 정확
- 🎯 검색 노출 증가

### 3. 시청 유지율 향상
- 🎯 소리 없이도 시청 가능
- 🎯 집중력 향상

---

## 📊 예상 결과

### Before (자막 없음)
```
[배경 이미지]
앵커: "이재명 대표가 오늘..."
리포터: "국회에서는..."
```

### After (자막 적용)
```
[배경 이미지]
앵커: "이재명 대표가 오늘..."
[자막: 이재명 대표가 오늘...]

리포터: "국회에서는..."
[자막: 국회에서는...]
```

---

## 🔧 구현 우선순위

1. **높음**: `generateNewsScriptsWithSubtitles()` 메서드 추가
2. **높음**: MediaPipelineService 자막 병합 로직
3. **중간**: 환경 변수로 자막 on/off 제어
4. **낮음**: 자막 스타일 커스터마이징

---

## 💡 결론

**가능 여부**: ✅ **네, 가능합니다!**

**이유**:
1. TTS 서비스가 이미 자막 타이밍 생성 기능 보유
2. VideoService 인터페이스가 이미 자막 파라미터 지원
3. Shorts에서 이미 동일한 방식으로 구현됨

**필요 작업**:
1. TTS 서비스에 `generateNewsScriptsWithSubtitles()` 메서드 추가
2. MediaPipelineService에서 자막 병합 로직 추가
3. VideoService 호출 시 자막 전달

**예상 작업 시간**: 2-3시간
