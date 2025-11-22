# 📰 News Printer

**AI 기반 뉴스 영상 자동 생성 및 유튜브 업로드 시스템**

다음(Daum) 뉴스에서 대통령실/국회 관련 기사를 크롤링하여 AI로 앵커/리포터 스크립트를 생성하고, 음성 합성 및 영상 편집을 거쳐 자동으로 유튜브에 업로드하는 완전 자동화 시스템입니다.

## ✨ 주요 기능

### 📰 다음 뉴스 스크래핑
- **대통령실 뉴스** - 청와대 및 대통령실 관련 기사
- **국회 뉴스** - 국회 및 입법 활동 관련 기사
- **자동 이미지 크롭** - 언론사별 워터마크 자동 제거 (연합뉴스 100px, 뉴스1 150px 등)
- **중복 제거**: URL 기반 중복 기사 자동 필터링
- **1시간 자동 실행**: 매 시간 정각에 자동으로 새 뉴스 수집 및 업로드

### 🤖 AI 기반 콘텐츠 생성
- **Google Gemini AI**: 뉴스 기사를 분석하여 자연스러운 앵커/리포터 스크립트 자동 생성
- **Google Cloud TTS (Chirp3-HD)**: 고품질 한국어 음성 합성으로 자연스러운 발음 구현
- **AI 뉴스 요약**: 실제 기사 내용 기반 자동 요약 생성

### 🎨 영상 제작
- **롱폼(Long-form) + 숏츠(Shorts) 동시 생성**: 1개 뉴스 = 2개 영상 자동 제작
- **크롤링 이미지 우선 사용**: 뉴스 기사에서 추출한 이미지를 배경으로 사용
- **워터마크 자동 제거**: 언론사별 워터마크 크기에 맞게 자동 크롭
- **BBC 스타일 썸네일**: Sharp 라이브러리로 전문적인 뉴스 썸네일 자동 생성
- **FFmpeg 영상 편집**: 고품질 MP4 영상 자동 생성
- **엔딩 화면**: 롱폼 영상에 10초 엔딩 화면 자동 추가

### 📺 유튜브 자동화
- **SEO 최적화**: AI 기반 제목, 설명, 태그 자동 생성으로 검색 노출 최적화
- **자동 업로드**: YouTube Data API v3를 통한 완전 자동 업로드
- **중복 방지**: SQLite 기반 이미 업로드된 뉴스 추적 시스템
- **카테고리 자동 분류**: 뉴스 주제에 맞는 유튜브 카테고리 자동 선택 (정치: 25)

### ⏰ 자동화 워크플로우
- **매시간 자동 실행**: `@Cron(CronExpression.EVERY_HOUR)` - 매 시간 정각 자동 실행
- **에러 처리**: 실패 시 로그 기록 및 자동 정리
- **수동 실행 API**: 테스트 및 디버깅용 수동 트리거 엔드포인트 제공

📖 **자세한 문서**: [docs/](./docs/) 폴더 참고

## 🏗️ 기술 스택

### Backend Framework
- **NestJS**: 확장 가능한 Node.js 프레임워크
- **TypeScript**: 타입 안정성과 코드 품질 보장

### AI & ML
- **Google Gemini AI**: 스크립트 생성 및 요약
- **Google Cloud Text-to-Speech**: Chirp3-HD 모델 음성 합성

### 미디어 처리
- **FFmpeg**: 영상 편집 및 생성
- **Sharp**: 이미지 처리 및 썸네일 생성
- **Fluent-FFmpeg**: Node.js FFmpeg 래퍼

### 외부 API
- **YouTube Data API v3**: 영상 업로드 및 메타데이터 관리

### 데이터 파싱
- **Cheerio**: HTML 파싱 및 웹 스크래핑
- **Axios**: HTTP 클라이언트

### 데이터베이스
- **SQLite**: 중복 방지를 위한 업로드 기록 저장

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

# Google Cloud 설정
GOOGLE_APPLICATION_CREDENTIALS=./path/to/google-credentials.json
GCP_PROJECT_ID=your-gcp-project-id

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# YouTube API 설정
YOUTUBE_CLIENT_ID=your-youtube-client-id
YOUTUBE_CLIENT_SECRET=your-youtube-client-secret
YOUTUBE_REDIRECT_URI=http://localhost:3000/auth/callback
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

### 1. 다음 뉴스 수동 트리거
```http
POST /news/daum/trigger?limit=10
```

**쿼리 파라미터:**
- `limit`: 각 카테고리별 기사 수 (1-100, 기본값: 5)

**응답 예시:**
```json
{
  "success": 8,
  "failed": 2
}
```

**동작:**
- 대통령실/국회 뉴스 크롤링
- Gemini AI 스크립트 생성
- 롱폼 + 숏츠 영상 자동 제작 및 업로드
- 중복 기사 자동 필터링

## 📂 프로젝트 구조

```
news-printer/
├── src/
│   ├── news/                      # 뉴스 모듈
│   │   ├── services/
│   │   │   ├── daum-news-scraper.service.ts    # 다음 뉴스 스크래핑
│   │   │   ├── daum-news-schedule.service.ts   # 1시간 자동 스케줄러
│   │   │   └── gemini.service.ts               # AI 스크립트 생성
│   │   ├── news.controller.ts     # REST API 컨트롤러
│   │   └── news.module.ts         # 뉴스 모듈 설정
│   ├── media/                     # 미디어 모듈
│   │   ├── services/
│   │   │   ├── tts.service.ts                        # TTS 음성 생성
│   │   │   ├── video.service.ts                      # FFmpeg 영상 생성
│   │   │   ├── shorts-pipeline.service.ts            # 숏츠 전용 파이프라인
│   │   │   ├── image-search.service.ts               # 이미지 다운로드 및 처리
│   │   │   ├── thumbnail.service.ts                  # 썸네일 생성
│   │   │   ├── seo-optimizer.service.ts              # SEO 최적화
│   │   │   ├── youtube.service.ts                    # YouTube 업로드
│   │   │   ├── published-news-tracking.service.ts    # 중복 방지
│   │   │   └── media-pipeline.service.ts             # 롱폼 파이프라인
│   │   └── media.module.ts
│   ├── app.module.ts              # 루트 모듈
│   └── main.ts                    # 진입점
├── temp/                          # 임시 파일 저장소
├── data/                          # SQLite 데이터베이스
├── docs/                          # 프로젝트 문서
├── .env                           # 환경 변수
└── package.json
```

## 🔄 워크플로우

```
1. 매시간 정각 자동 실행 (@Cron)
   ↓
2. 다음 뉴스 스크래핑 (대통령실/국회)
   ↓
3. 기사 본문 및 이미지 추출
   ↓
4. 워터마크 자동 크롭 (언론사별)
   ↓
5. Gemini AI 스크립트 생성 (앵커/리포터)
   ↓
6. Google TTS 음성 파일 생성
   ↓
7. 롱폼 영상 생성 (썸네일 배경 + 엔딩 화면)
   ↓
8. 숏츠 영상 생성 (Reporter 스크립트 재사용)
   ↓
9. YouTube 업로드 (SEO 최적화)
   ↓
10. SQLite 업로드 기록 저장 (중복 방지)
   ↓
11. 임시 파일 자동 정리
```

## 🛠️ 주요 기술 상세

### 다음 뉴스 스크래핑
- Cheerio 기반 HTML 파싱
- 대통령실/국회 카테고리 자동 크롤링
- 이미지 URL 추출 및 다운로드
- 언론사별 워터마크 크기 매핑 자동 크롭

### AI 기반 스크립트 생성
- Google Gemini AI로 자연스러운 뉴스 대본 생성
- 앵커와 리포터 역할 분리
- 한국어 뉴스 특성에 맞는 프롬프트 최적화

### 음성 합성 (TTS)
- Google Cloud Text-to-Speech Chirp3-HD 모델
- 한국어 여성 음성 (ko-KR-Neural2-A/B)
- 자연스러운 억양과 발음

### 영상 생성
- **롱폼**: 썸네일을 배경으로 사용, 10초 엔딩 화면 추가
- **숏츠**: 크롤링 이미지 슬라이드쇼, 60초 미만 세로 영상
- FFmpeg를 통한 고품질 MP4 영상 생성

### 썸네일 생성
- BBC 뉴스 스타일 디자인
- Sharp 라이브러리로 고해상도 이미지 처리
- 배경 이미지 + 다크 오버레이 + 텍스트 오버레이
- 카테고리별 색상 자동 적용 (정치: 파란색)

### SEO 최적화
- AI 기반 제목 최적화 (검색 키워드 포함)
- 상세한 설명 자동 생성
- 관련 태그 자동 추출
- 유튜브 카테고리 25 (정치) 자동 설정

### 중복 방지 시스템
- SQLite 기반 업로드 기록 저장
- 뉴스 URL 기반 중복 체크
- 업로드 성공 시에만 기록 저장

## 🧪 테스트

```bash
# 단위 테스트
npm run test

# E2E 테스트
npm run test:e2e

# 테스트 커버리지
npm run test:cov
```

## 📊 스케줄러 동작

### DaumNewsScheduleService
- **실행 주기**: `@Cron(CronExpression.EVERY_HOUR)` - 매 시간 정각
- **처리 프로세스**:
  1. 대통령실/국회 뉴스 크롤링 (각 카테고리별 5개)
  2. 중복 제거 (이미 업로드된 기사 필터링)
  3. 각 기사별 롱폼 + 숏츠 영상 생성 및 업로드
  4. 임시 이미지 자동 정리

## 📝 라이선스

이 프로젝트는 개인 프로젝트로 라이선스가 지정되지 않았습니다.

## 🤝 기여

이슈나 풀 리퀘스트는 언제나 환영합니다!

## 📧 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 생성해주세요.

---

**Built with ❤️ using NestJS and Google AI**
