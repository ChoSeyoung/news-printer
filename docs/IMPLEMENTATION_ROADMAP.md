# 📊 조회수 & 체류 시간 증대 로드맵 - 구현 완료 보고서

> **프로젝트**: News Printer - AI 뉴스 영상 자동 생성 시스템
> **목표**: YouTube 조회수 +50%, 체류 시간 +40%, CTR +30%
> **기간**: 10주 (Phase 1-4 순차 구현)

---

## ✅ **완료된 작업 (Phase 1 + Phase 2 일부)**

### **Phase 1: Quick Wins** ✅ **완료**

#### **1.1 인트로 생략 + 훅 오프닝**
- **파일**: `src/news/services/gemini.service.ts:119-148`
- **변경 내용**: Gemini AI 프롬프트에 Hook Opening 전략 추가
- **효과**:
  - 초반 15초 이탈률 -15% 예상
  - 앵커 스크립트가 즉시 핵심 전달
  - 예시: "오늘의 핵심 뉴스는 [요약]입니다"

**구현 코드**:
```typescript
앵커 대본 작성 규칙 (Hook Opening 전략 적용):
- **필수: 첫 3-5초에 핵심 내용을 먼저 전달하여 시청자의 이탈을 방지하세요**
- 예시: "오늘의 핵심 뉴스는 [핵심 요약]입니다. 자세한 내용 전해드리겠습니다."
- 긴 인트로 멘트 없이 바로 본론 시작
- YouTube 알고리즘은 초반 15초 이탈률을 중요하게 여기므로, 앵커 스크립트는 즉시 핵심을 전달해야 합니다.
```

---

#### **1.2 얼굴 감지 우선 이미지 선택**
- **파일**: `src/media/services/face-detection.service.ts` (NEW)
- **기술**: `@techstark/opencv-js` (순수 JS OpenCV)
- **기능**:
  - Haar Cascade 분류기로 얼굴 감지
  - 얼굴 개수 및 크기 기반 점수 산정
  - URL 및 로컬 이미지 모두 지원
  - ImageSearchService와 연동 준비 완료

**핵심 메서드**:
```typescript
async detectFacesInImages(imageSources: string[]): Promise<FaceDetectionResult[]>
async getBestImageIndex(imageSources: string[]): Promise<number>
```

**점수 산정 방식**:
- 기본: 얼굴 개수 × 100
- 보너스: 큰 얼굴 (이미지 면적 10% 이상) +50
- 결과: 점수 기준 내림차순 정렬

**효과**: CTR +10-15% 예상

---

### **Phase 2: High Priority** ⚡ **진행 중**

#### **2.1 자막 오버레이 하이브리드 시스템**
- **파일**: `src/media/services/subtitle.service.ts` (NEW)
- **기능**:
  - TTS 음성 기반 SRT 자막 파일 자동 생성
  - 문장 단위 타이밍 계산 (글자 수 비율)
  - FFmpeg 번인 자막 지원
  - YouTube Captions API 호환

**핵심 메서드**:
```typescript
async generateSubtitle(options: SubtitleOptions): Promise<string>
async convertSrtToVtt(srtPath: string): Promise<string>
```

**SRT 생성 로직**:
```
앵커 스크립트 → 문장 분할 → 글자 수 계산 → 시간 배분
리포터 스크립트 → 문장 분할 → 글자 수 계산 → 시간 배분
→ SRT 파일 생성 (00:00:00,000 형식)
```

**효과**: 체류 시간 +20%, 모바일 접근성 +15% 예상

---

## 📋 **남은 작업 (Phase 2-4)**

### **Phase 2: High Priority** (3-4주 소요)

#### **2.2 YouTube Analytics 연동** 🔜 **다음 우선순위**

**구현 필요 사항**:
1. **새 서비스**: `src/media/services/analytics.service.ts`
2. **주요 메트릭**:
   - 체류 시간 & 이탈률 (구간별)
   - CTR (클릭률)
   - 검색 유입 키워드
   - 연령/지역 데모그래픽

**구현 코드 예시**:
```typescript
import { google } from 'googleapis';

@Injectable()
export class AnalyticsService {
  private youtube;
  private analytics;

  constructor() {
    this.youtube = google.youtube('v3');
    this.analytics = google.youtubeAnalytics('v2');
  }

  /**
   * 영상별 성과 메트릭 수집
   */
  async getVideoMetrics(videoId: string) {
    const response = await this.analytics.reports.query({
      ids: 'channel==MINE',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      metrics: 'views,likes,dislikes,averageViewDuration,averageViewPercentage',
      dimensions: 'video',
      filters: `video==${videoId}`,
    });

    return response.data;
  }

  /**
   * 검색 유입 키워드 분석
   */
  async getSearchTerms(videoId: string) {
    const response = await this.analytics.reports.query({
      ids: 'channel==MINE',
      startDate: '2024-01-01',
      endDate: '2024-12-31',
      metrics: 'views',
      dimensions: 'insightTrafficSourceDetail',
      filters: `video==${videoId};insightTrafficSourceType==YT_SEARCH`,
      sort: '-views',
      maxResults: 25,
    });

    return response.data.rows;
  }
}
```

**저장 구조**: `analytics/metrics_YYYY-MM-DD.json`

---

### **Phase 3: Medium Priority** (5-6주 소요)

#### **3.1 텍스트 강조 효과 (GraphicsService)**

**구현 필요 사항**:
1. **새 서비스**: `src/media/services/graphics.service.ts`
2. **기술**: Sharp SVG 확장
3. **효과**: 형광펜, 그림자, 밑줄

**구현 코드 예시**:
```typescript
@Injectable()
export class GraphicsService {
  /**
   * 강조 효과가 적용된 텍스트 SVG 생성
   */
  createHighlightedText(title: string, category: string): string {
    const highlightColor = this.getCategoryHighlightColor(category);

    return `
      <svg width="1280" height="720">
        <!-- 형광펜 효과 (반투명 배경) -->
        <rect x="100" y="250" width="1080" height="80"
              fill="${highlightColor}" opacity="0.3"/>

        <!-- 텍스트 그림자 -->
        <text x="120" y="300"
              font-size="60" font-weight="bold"
              fill="black" opacity="0.5">
          ${title}
        </text>

        <!-- 실제 텍스트 -->
        <text x="120" y="300"
              font-size="60" font-weight="bold"
              fill="white">
          ${title}
        </text>
      </svg>
    `;
  }

  private getCategoryHighlightColor(category: string): string {
    const colors = {
      '정치': '#ff0000', // 빨간색
      '경제': '#ffd700', // 금색
      '사회': '#00bfff', // 하늘색
    };
    return colors[category] || '#ffffff';
  }
}
```

**효과**: CTR +5-10% 추가

---

#### **3.2 카테고리별 최적화 전략**

**구현 필요 사항**:
1. **설정 파일**: `config/category-strategies.json`
2. **SeoOptimizerService 확장**

**설정 파일 예시**:
```json
{
  "정치": {
    "tone": "긴박감",
    "keywords": ["긴급", "속보", "중요", "결정"],
    "thumbnailStyle": {
      "highlightColor": "#e94560",
      "fontWeight": "bold",
      "emoji": "🏛️"
    },
    "titlePattern": "[긴급] {핵심 키워드} | {상세 내용}"
  },
  "경제": {
    "tone": "분석적",
    "keywords": ["급등", "급락", "전망", "분석", "예측"],
    "thumbnailStyle": {
      "highlightColor": "#ffd700",
      "fontWeight": "600",
      "emoji": "💰"
    },
    "titlePattern": "{수치/통계} {핵심 키워드} | {영향 분석}"
  },
  "속보": {
    "tone": "즉시성",
    "keywords": ["속보", "방금", "현장", "실시간"],
    "thumbnailStyle": {
      "highlightColor": "#ff0000",
      "fontWeight": "bold",
      "emoji": "🚨",
      "animation": "blink"
    },
    "titlePattern": "[속보] {핵심 사건} | {즉각 영향}"
  }
}
```

**SeoOptimizerService 확장**:
```typescript
async generateSeoMetadata(input: SeoInput, category?: string): Promise<SeoMetadata> {
  // 카테고리별 전략 로드
  const strategy = await this.loadCategoryStrategy(category);

  // 전략 기반 프롬프트 조정
  const prompt = `
    ${strategy.tone} 톤으로 작성하세요.
    필수 키워드: ${strategy.keywords.join(', ')}
    제목 패턴: ${strategy.titlePattern}
  `;

  // ... 기존 로직
}
```

**효과**: 카테고리별 타겟 정확도 +20%

---

### **Phase 4: Long-term** (7-10주 소요)

#### **4.1 성과 기반 프롬프트 자동 조정**

**구현 필요 사항**:
1. **새 서비스**: `src/media/services/optimization.service.ts`
2. **ML 파이프라인**: 성과 패턴 학습 → 프롬프트 자동 개선

**구현 코드 예시**:
```typescript
@Injectable()
export class OptimizationService {
  constructor(
    private analyticsService: AnalyticsService,
    private geminiService: GeminiService,
  ) {}

  /**
   * 고성과 영상 패턴 분석 및 프롬프트 최적화
   */
  async optimizePrompts() {
    // 1. 고성과 영상 식별 (CTR > 평균 150%)
    const highPerformers = await this.analyticsService.getHighPerformingVideos();

    // 2. 패턴 추출
    const patterns = this.extractPatterns(highPerformers);

    // 3. Gemini에게 패턴 학습시키기
    const optimizedPrompt = await this.generateOptimizedPrompt(patterns);

    // 4. 프롬프트 저장 (주간 자동 업데이트)
    await this.savePrompt(optimizedPrompt);

    return optimizedPrompt;
  }

  private extractPatterns(videos: any[]) {
    return {
      titleStructures: this.analyzeTitleStructures(videos),
      keywordFrequency: this.analyzeKeywords(videos),
      optimalLength: this.analyzeLength(videos),
      thumbnailPatterns: this.analyzeThumbnails(videos),
    };
  }

  private async generateOptimizedPrompt(patterns: any): Promise<string> {
    return `
      고성과 영상 패턴 분석 결과:
      - 제목 구조: ${patterns.titleStructures.topPattern}
      - 효과적 키워드: ${patterns.keywordFrequency.top10.join(', ')}
      - 최적 영상 길이: ${patterns.optimalLength.average}초

      이 패턴을 기반으로 스크립트를 생성하세요.
    `;
  }
}
```

**Cron 자동화**:
```typescript
@Cron('0 0 * * 0') // 매주 일요일 00:00
async weeklyOptimization() {
  await this.optimizationService.optimizePrompts();
  this.logger.log('Weekly prompt optimization completed');
}
```

**효과**: 지속적 성과 개선 +10-15%/월

---

## 🛠️ **통합 작업 가이드**

### **SubtitleService → MediaPipelineService 통합**

**1. MediaModule에 등록**:
```typescript
import { SubtitleService } from './services/subtitle.service';

@Module({
  providers: [
    // ... 기존 서비스들
    SubtitleService,
  ],
})
export class MediaModule {}
```

**2. MediaPipelineService에서 사용**:
```typescript
constructor(
  private subtitleService: SubtitleService,
  private videoService: VideoService,
  private youtubeService: YoutubeService,
) {}

async processNews(newsItem: any) {
  // ... TTS 생성
  const anchorAudio = await this.ttsService.synthesize(newsItem.anchor);
  const reporterAudio = await this.ttsService.synthesize(newsItem.reporter);

  // 1. 자막 생성
  const srtPath = await this.subtitleService.generateSubtitle({
    anchorScript: newsItem.anchor,
    reporterScript: newsItem.reporter,
    anchorDuration: await this.getAudioDuration(anchorAudio),
    reporterDuration: await this.getAudioDuration(reporterAudio),
  });

  // 2. FFmpeg 번인 자막
  await this.videoService.createVideoWithSubtitles({
    audioFiles: [anchorAudio, reporterAudio],
    subtitlePath: srtPath,
  });

  // 3. YouTube 자막 업로드
  await this.youtubeService.uploadCaptions(videoId, srtPath);

  // 4. 정리
  await this.subtitleService.deleteSubtitle(srtPath);
}
```

**3. VideoService 확장 (FFmpeg 번인 자막)**:
```typescript
async createVideoWithSubtitles(options: {
  audioFiles: string[];
  subtitlePath: string;
  backgroundImages?: string[];
}) {
  // ... 기존 영상 생성 로직

  // 자막 번인 추가
  const command = `ffmpeg -i "${tempVideoPath}" -i "${options.audioFiles.join('+')}" -vf "subtitles=${options.subtitlePath}:force_style='FontName=NanumGothic,FontSize=24,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2'" -c:v libx264 -c:a aac -y "${outputPath}"`;

  await execAsync(command);
}
```

**4. YouTubeService 확장 (자막 업로드)**:
```typescript
async uploadCaptions(videoId: string, srtPath: string) {
  const youtube = google.youtube('v3');

  await youtube.captions.insert({
    part: ['snippet'],
    requestBody: {
      snippet: {
        videoId: videoId,
        language: 'ko',
        name: '한국어 자막',
        isDraft: false,
      },
    },
    media: {
      mimeType: 'application/x-subrip',
      body: fs.createReadStream(srtPath),
    },
  });
}
```

---

### **FaceDetectionService → ImageSearchService 통합**

**ImageSearchService 수정**:
```typescript
constructor(
  private faceDetectionService: FaceDetectionService,
) {}

async searchImages(keywords: string[]): Promise<string[]> {
  // ... 기존 이미지 검색 로직
  const images = await this.searchFromPexels(keywords);

  // 얼굴 감지로 최적 이미지 선택
  const bestIndex = await this.faceDetectionService.getBestImageIndex(images);

  // 얼굴이 있는 이미지를 첫 번째로 정렬
  if (bestIndex > 0) {
    const bestImage = images[bestIndex];
    images.splice(bestIndex, 1);
    images.unshift(bestImage);
  }

  return images;
}
```

---

## 📈 **예상 성과 타임라인**

| 주차 | Phase | 완료 기능 | CTR | 체류 시간 | 조회수 |
|------|-------|-----------|-----|-----------|--------|
| 1-2 | Phase 1 | 훅 오프닝 + 얼굴 감지 | +15% | +10% | +12% |
| 3-4 | Phase 2 | 자막 + Analytics | +25% | +30% | +28% |
| 5-6 | Phase 3 | 텍스트 강조 + 카테고리 최적화 | +30% | +35% | +40% |
| 7-10 | Phase 4 | 자동 최적화 시스템 | +30% | +40% | +50% |

---

## 🚀 **즉시 테스트 가능한 기능**

### **1. 훅 오프닝 테스트**
```bash
# 뉴스 가져오기 (프롬프트 개선 적용됨)
curl http://localhost:3000/news?limit=1&fullContent=true

# 결과 확인: anchorScript의 첫 문장이 핵심 요약인지 확인
```

### **2. 얼굴 감지 테스트**
```typescript
// 테스트 코드 작성 (test/face-detection.spec.ts)
describe('FaceDetectionService', () => {
  it('should detect faces and score images', async () => {
    const images = [
      './test/images/with_face.jpg',
      './test/images/no_face.jpg',
    ];

    const results = await faceDetectionService.detectFacesInImages(images);

    expect(results[0].faceCount).toBeGreaterThan(0);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});
```

### **3. 자막 생성 테스트**
```typescript
// 테스트 코드
describe('SubtitleService', () => {
  it('should generate SRT file', async () => {
    const srtPath = await subtitleService.generateSubtitle({
      anchorScript: '안녕하세요. 뉴스입니다.',
      reporterScript: '현장의 김철수 기자입니다.',
      anchorDuration: 3.5,
      reporterDuration: 2.8,
    });

    const exists = await fs.pathExists(srtPath);
    expect(exists).toBe(true);

    const content = await fs.readFile(srtPath, 'utf-8');
    expect(content).toContain('00:00:00,000');
  });
});
```

---

## 📝 **다음 단계 권장 사항**

### **우선순위 1: Phase 1 기능 실전 테스트**
1. 실제 뉴스 10개로 훅 오프닝 효과 측정
2. 얼굴 감지 정확도 검증 (수동 비교)
3. 초기 성과 데이터 수집

### **우선순위 2: Phase 2 완성**
1. YouTube Analytics API 연동
2. 자막 시스템 MediaPipelineService 통합
3. 실제 영상 업로드 테스트

### **우선순위 3: 점진적 Phase 3-4 구현**
1. GraphicsService 프로토타입
2. 카테고리별 전략 파일 작성
3. 성과 데이터 축적 후 OptimizationService 구현

---

## ⚠️ **주의사항**

1. **OpenCV.js 설치 이슈**:
   - 네이티브 바인딩 실패 시 `opencv.js` (WebAssembly) 대체
   - 또는 별도 Docker 컨테이너에서 실행

2. **YouTube API 할당량**:
   - Analytics API: 일일 10,000 쿼리 (충분함)
   - Captions API: 영상당 1회 업로드

3. **자막 타이밍 정확도**:
   - 현재는 글자 수 기반 추정
   - 향후 음성 분석 라이브러리로 개선 가능 (예: `wav-duration`)

4. **성과 측정 주기**:
   - 최소 2주 데이터 수집 후 패턴 분석
   - A/B 테스트는 최소 20개 영상 필요

---

## 🎉 **결론**

**완료된 작업**:
- ✅ Phase 1: Quick Wins (100% 완료)
- ✅ Phase 2: SubtitleService (50% 완료)

**예상 즉시 효과**:
- CTR +15% (얼굴 감지)
- 초반 이탈률 -15% (훅 오프닝)

**전체 로드맵 완료 시**:
- CTR +30%
- 체류 시간 +40%
- 조회수 +50%

**다음 스텝**: Phase 2 완성 → Analytics 데이터 수집 → Phase 3-4 점진적 구현

---

**Built with ❤️ using NestJS, OpenCV.js, and Google Gemini AI**
