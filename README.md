# 📰 News Printer

**AI 기반 뉴스 영상 자동 생성 및 유튜브 업로드 시스템**

조선일보 RSS 피드에서 뉴스를 가져와 AI로 앵커/리포터 스크립트를 생성하고, 음성 합성 및 영상 편집을 거쳐 자동으로 유튜브에 업로드하는 완전 자동화 시스템입니다.

## ✨ 주요 기능

### 📰 다중 언론사 RSS 통합 (균형 구성)
- **조선일보** - 보수 성향, 종합 일간지
- **연합뉴스** - 중도 성향, 통신사 (속보성 강함)
- **한겨레** - 진보 성향, 종합 일간지
- **KBS 뉴스** - 중립 성향, 공영방송
- **한국경제** - 경제 전문지
- **중복 제거**: 제목 유사도 기반 자동 중복 뉴스 필터링
- **출처 표시**: 각 뉴스에 언론사 정보 및 정치 성향 표시

### 🤖 AI 기반 콘텐츠 생성
- **Google Gemini AI**: 뉴스 기사를 분석하여 자연스러운 앵커/리포터 스크립트 자동 생성
- **Google Cloud TTS (Chirp3-HD)**: 고품질 한국어 음성 합성으로 자연스러운 발음 구현
- **AI 썸네일 선택**: Gemini AI가 뉴스에 가장 적합한 배경 이미지 자동 선택
- **AI 뉴스 요약**: 실제 기사 내용 기반 300자 이내 요약 자동 생성

### 🎨 영상 제작
- **RSS 이미지 우선 사용**: 뉴스 기사에서 추출한 이미지를 배경으로 우선 사용
- **자동 이미지 검색**: 부족한 이미지는 Pexels/Unsplash에서 키워드 기반 자동 보충
- **GIF 필터링**: FFmpeg 호환성을 위한 GIF 이미지 자동 필터링
- **BBC 스타일 썸네일**: Sharp 라이브러리로 전문적인 뉴스 썸네일 자동 생성
- **FFmpeg 영상 편집**: 고품질 MP4 영상 자동 생성

### 📺 유튜브 자동화
- **SEO 최적화**: AI 기반 제목, 설명, 태그 자동 생성으로 검색 노출 최적화
- **자동 업로드**: YouTube Data API v3를 통한 완전 자동 업로드
- **중복 방지**: 이미 업로드된 뉴스 추적으로 중복 업로드 방지
- **카테고리 자동 분류**: 뉴스 주제에 맞는 유튜브 카테고리 자동 선택

### ⏰ 자동화 워크플로우
- **Cron 기반 자동화**: 서버 cron으로 매일 자동 뉴스 수집 및 영상 업로드
- **간편한 설정**: `.env` 파일만 수정하면 되는 단순한 구조
- **스케줄링**: 원하는 시간에 자동 실행 가능 (기본: 매일 오후 12시)
- **에러 처리**: 실패 시 로그 기록 및 자동 정리

📖 **자세한 설정 방법**: [CRON_SETUP.md](./CRON_SETUP.md) 참고

## 🏗️ 기술 스택

### Backend Framework
- **NestJS**: 확장 가능한 Node.js 프레임워크
- **TypeScript**: 타입 안정성과 코드 품질 보장

### AI & ML
- **Google Gemini AI**: 스크립트 생성 및 이미지 선택
- **Google Cloud Text-to-Speech**: Chirp3-HD 모델 음성 합성

### 미디어 처리
- **FFmpeg**: 영상 편집 및 생성
- **Sharp**: 이미지 처리 및 썸네일 생성
- **Fluent-FFmpeg**: Node.js FFmpeg 래퍼

### 외부 API
- **YouTube Data API v3**: 영상 업로드 및 메타데이터 관리
- **Pexels API**: 무료 고품질 이미지 검색
- **Unsplash API**: 무료 고품질 이미지 검색

### 데이터 파싱
- **Cheerio**: HTML/XML 파싱
- **xml2js**: RSS 피드 파싱
- **Axios**: HTTP 클라이언트

## 📦 설치

```bash
# 저장소 클론
git clone https://github.com/your-username/news-printer.git
cd news-printer

# 의존성 설치
npm install
```

## ⚙️ 환경 설정

`.env` 파일을 프로젝트 루트에 생성하고 다음 내용을 입력하세요:

```env
# 서버 설정
PORT=3000

# RSS 피드 설정
RSS_BASE_URL=https://www.chosun.com/arc/outboundfeeds/rss/category
RSS_TIMEOUT=10000
RSS_DEFAULT_CATEGORY=politics
RSS_DEFAULT_LIMIT=10

# Google Cloud 설정
GOOGLE_APPLICATION_CREDENTIALS=./path/to/google-credentials.json
GCP_PROJECT_ID=your-gcp-project-id

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# YouTube API 설정
YOUTUBE_CLIENT_ID=your-youtube-client-id
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/callback

# 이미지 검색 API
PEXELS_API_KEY=your-pexels-api-key
UNSPLASH_ACCESS_KEY=your-unsplash-access-key
```

### API 키 발급 방법

#### 1. Google Cloud Platform
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 새 프로젝트 생성 또는 기존 프로젝트 선택
3. **Text-to-Speech API** 활성화
4. 서비스 계정 생성 및 JSON 키 다운로드

#### 2. Google Gemini API
1. [Google AI Studio](https://makersuite.google.com/app/apikey) 접속
2. API 키 생성

#### 3. YouTube Data API
1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. **YouTube Data API v3** 활성화
3. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
4. 리디렉션 URI 설정: `http://localhost:3000/auth/callback`

#### 4. Pexels API
1. [Pexels API](https://www.pexels.com/api/) 접속
2. 무료 계정 생성 및 API 키 발급

#### 5. Unsplash API
1. [Unsplash Developers](https://unsplash.com/developers) 접속
2. 애플리케이션 등록 및 Access Key 발급

## 🚀 실행

### 개발 모드
```bash
npm run start:dev
```

### 프로덕션 모드
```bash
# 빌드
npm run build

# 실행
npm run start:prod
```

## 📡 API 엔드포인트

### 1. 뉴스 조회
```http
GET /news?limit=10&category=politics&fullContent=true
```

**쿼리 파라미터:**
- `limit`: 조회할 뉴스 개수 (1-100, 기본값: 10)
- `category`: 뉴스 카테고리 (기본값: politics)
- `fullContent`: 전체 기사 내용 포함 여부 (기본값: false)

**응답 예시:**
```json
{
  "success": true,
  "data": [
    {
      "title": "뉴스 제목",
      "link": "https://www.chosun.com/...",
      "description": "뉴스 요약",
      "pubDate": "2025-11-17T10:30:00Z",
      "category": "politics",
      "guid": "unique-id",
      "source": {
        "id": "chosun",
        "name": "조선일보",
        "politicalStance": "conservative",
        "type": "general"
      },
      "fullContent": "전체 기사 내용...",
      "anchor": "앵커 스크립트...",
      "reporter": "리포터 스크립트...",
      "imageUrls": ["https://image1.jpg", "https://image2.jpg"]
    }
  ],
  "meta": {
    "total": 10,
    "sources": ["조선일보", "연합뉴스", "한겨레", "KBS 뉴스", "한국경제"],
    "fetchedAt": "2025-11-17T11:00:00Z",
    "category": "politics",
    "includesFullContent": true
  }
}
```

### 2. 뉴스 영상 일괄 업로드
```http
POST /news/publish-all
Content-Type: application/json

{
  "category": "politics",
  "limit": 10,
  "privacyStatus": "unlisted"
}
```

**요청 본문:**
- `category`: 뉴스 카테고리 (선택, 기본값: politics)
- `limit`: 처리할 뉴스 개수 (선택, 기본값: 10)
- `privacyStatus`: 유튜브 공개 설정 (public/private/unlisted, 기본값: unlisted)

**응답 예시:**
```json
{
  "totalProcessed": 10,
  "successful": 8,
  "failed": 2,
  "results": [
    {
      "title": "뉴스 제목",
      "success": true,
      "videoId": "abc123xyz",
      "videoUrl": "https://www.youtube.com/watch?v=abc123xyz"
    }
  ]
}
```

### 3. 뉴스 영상 미리보기
```http
GET /news/preview?limit=5&category=politics
```

**응답 예시:**
```json
{
  "total": 5,
  "items": [
    {
      "title": "SEO 최적화된 제목",
      "originalTitle": "원본 뉴스 제목",
      "description": "SEO 최적화된 설명...",
      "tags": ["정치", "국회", "법안"],
      "categoryId": "25",
      "categoryName": "정치",
      "estimatedDurationSeconds": 45,
      "anchorScript": "앵커 스크립트...",
      "reporterScript": "리포터 스크립트..."
    }
  ],
  "meta": {
    "category": "politics",
    "fetchedAt": "2025-11-16T11:00:00Z"
  }
}
```

## 📂 프로젝트 구조

```
news-printer/
├── src/
│   ├── news/                      # 뉴스 모듈
│   │   ├── services/
│   │   │   ├── rss.service.ts     # RSS 피드 파싱
│   │   │   ├── article-scraper.service.ts  # 기사 전체 내용 및 이미지 추출
│   │   │   └── gemini.service.ts  # AI 스크립트 생성
│   │   ├── dto/                   # 데이터 전송 객체
│   │   ├── news.controller.ts     # REST API 컨트롤러
│   │   └── news.service.ts        # 뉴스 비즈니스 로직
│   ├── media/                     # 미디어 모듈
│   │   ├── services/
│   │   │   ├── tts.service.ts     # TTS 음성 생성
│   │   │   ├── video.service.ts   # FFmpeg 영상 생성
│   │   │   ├── image-search.service.ts  # 이미지 검색 및 다운로드
│   │   │   ├── keyword-extraction.service.ts  # 키워드 추출
│   │   │   ├── thumbnail.service.ts  # 썸네일 생성
│   │   │   ├── seo-optimizer.service.ts  # SEO 최적화
│   │   │   ├── youtube.service.ts  # YouTube 업로드
│   │   │   ├── published-news-tracking.service.ts  # 중복 방지
│   │   │   └── media-pipeline.service.ts  # 전체 파이프라인 오케스트레이션
│   │   └── media.module.ts
│   ├── app.module.ts              # 루트 모듈
│   └── main.ts                    # 진입점
├── temp/                          # 임시 파일 저장소
├── .env                           # 환경 변수
├── .env.example                   # 환경 변수 예시
└── package.json
```

## 🎯 지원 카테고리

| 카테고리 | 설명 | YouTube 카테고리 ID |
|---------|------|-------------------|
| `politics` | 정치 | 25 |
| `economy` | 경제 | 25 |
| `society` | 사회 | 25 |
| `international` | 국제 | 25 |
| `culture` | 문화 | 24 |
| `sports` | 스포츠 | 17 |
| `science` | 과학/IT | 28 |
| `opinion` | 오피니언 | 25 |

## 🔄 워크플로우

```
1. RSS 피드에서 뉴스 수집
   ↓
2. 기사 전체 내용 및 이미지 스크래핑
   ↓
3. Gemini AI로 앵커/리포터 스크립트 생성
   ↓
4. Google TTS로 음성 파일 생성
   ↓
5. RSS 이미지 다운로드 (없으면 Pexels/Unsplash 검색)
   ↓
6. Gemini AI로 썸네일 배경 이미지 선택
   ↓
7. FFmpeg로 영상 생성
   ↓
8. Sharp로 BBC 스타일 썸네일 생성
   ↓
9. YouTube에 영상 업로드 (SEO 최적화)
   ↓
10. 임시 파일 정리 및 업로드 기록 저장
```

## 🛠️ 주요 기술 상세

### RSS 이미지 추출
- Fusion.globalContent JSON 파싱으로 이미지 URL 추출
- GIF 파일 자동 필터링 (FFmpeg `-loop` 옵션 호환성)
- 원본 파일 확장자 보존

### AI 기반 스크립트 생성
- Google Gemini AI로 자연스러운 뉴스 대본 생성
- 앵커와 리포터 역할 분리
- 한국어 뉴스 특성에 맞는 프롬프트 최적화

### 음성 합성 (TTS)
- Google Cloud Text-to-Speech Chirp3-HD 모델
- 한국어 여성 음성 (ko-KR-Wavenet-A/B)
- 자연스러운 억양과 발음

### 영상 생성
- FFmpeg를 통한 고품질 MP4 영상 생성
- 배경 이미지 슬라이드쇼 효과
- 음성에 맞춘 영상 길이 자동 조절

### 썸네일 생성
- BBC 뉴스 스타일 디자인
- Sharp 라이브러리로 고해상도 이미지 처리
- 배경 이미지 + 다크 오버레이 + 텍스트 오버레이
- 카테고리별 색상 자동 적용

### SEO 최적화
- AI 기반 제목 최적화 (검색 키워드 포함)
- 상세한 설명 자동 생성
- 관련 태그 자동 추출
- 적절한 유튜브 카테고리 자동 선택

## 🧪 테스트

```bash
# 단위 테스트
npm run test

# E2E 테스트
npm run test:e2e

# 테스트 커버리지
npm run test:cov
```

## 📝 라이선스

이 프로젝트는 개인 프로젝트로 라이선스가 지정되지 않았습니다.

## 🤝 기여

이슈나 풀 리퀘스트는 언제나 환영합니다!

## 📧 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 생성해주세요.

---

**Built with ❤️ using NestJS and Google AI**
