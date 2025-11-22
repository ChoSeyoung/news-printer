# News Printer 완전 설정 가이드

AI 기반 자동 뉴스 영상 생성 시스템을 처음부터 설정하고 운영하는 완전한 가이드입니다.

---

## 📋 목차

1. [시스템 요구사항](#1-시스템-요구사항)
2. [프로젝트 다운로드](#2-프로젝트-다운로드)
3. [필수 소프트웨어 설치](#3-필수-소프트웨어-설치)
4. [API 키 발급](#4-api-키-발급)
5. [환경 변수 설정](#5-환경-변수-설정)
6. [인증 파일 설정](#6-인증-파일-설정)
7. [의존성 설치 및 빌드](#7-의존성-설치-및-빌드)
8. [첫 실행 및 테스트](#8-첫-실행-및-테스트)
9. [운영 시작](#9-운영-시작)
10. [트러블슈팅](#10-트러블슈팅)

---

## 1. 시스템 요구사항

### 하드웨어
- **CPU**: 2코어 이상 권장
- **RAM**: 4GB 이상 (8GB 권장)
- **디스크**: 10GB 이상 여유 공간

### 운영체제
- macOS 10.15 이상
- Ubuntu 20.04 이상
- Windows 10/11 (WSL2 권장)

### 필수 소프트웨어 버전
- Node.js 18.x 이상
- npm 9.x 이상
- FFmpeg 4.x 이상
- Git 2.x 이상

---

## 2. 프로젝트 다운로드

### Git Clone
```bash
# 프로젝트 클론
git clone https://github.com/your-repo/news-printer.git
cd news-printer

# 현재 브랜치 확인
git branch
# main
```

---

## 3. 필수 소프트웨어 설치

### Node.js 설치

**macOS (Homebrew)**:
```bash
brew install node
node --version  # v18.x 이상 확인
npm --version   # v9.x 이상 확인
```

**Ubuntu/Debian**:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version
```

**Windows (WSL2)**:
```bash
# WSL2에서 Ubuntu 사용
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### FFmpeg 설치

**macOS**:
```bash
brew install ffmpeg
ffmpeg -version
```

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install ffmpeg
ffmpeg -version
```

**Windows (WSL2)**:
```bash
sudo apt update
sudo apt install ffmpeg
```

### Git 설치 (이미 설치되어 있으면 생략)

**macOS**:
```bash
brew install git
```

**Ubuntu/Debian**:
```bash
sudo apt install git
```

---

## 4. API 키 발급

### 4.1. Google Gemini API 키

**발급 방법**:
1. https://ai.google.dev/ 접속
2. "Get API key in Google AI Studio" 클릭
3. "Create API key" 클릭
4. 생성된 API 키 복사 (예: `AIzaSyABC...XYZ`)

**용도**: AI 기반 뉴스 스크립트 생성

---

### 4.2. Google Cloud TTS (Text-to-Speech)

**발급 방법**:

1. **Google Cloud Console 접속**
   - https://console.cloud.google.com/

2. **프로젝트 생성**
   - "새 프로젝트" 클릭
   - 프로젝트 이름: `news-printer` (원하는 이름)
   - "만들기" 클릭

3. **Cloud Text-to-Speech API 활성화**
   - 검색창에 "Text-to-Speech API" 입력
   - "사용 설정" 클릭

4. **서비스 계정 생성**
   - 왼쪽 메뉴 → "IAM 및 관리자" → "서비스 계정"
   - "서비스 계정 만들기" 클릭
   - 이름: `news-printer-tts`
   - 역할: "Cloud Text-to-Speech 사용자"
   - "완료" 클릭

5. **JSON 키 다운로드**
   - 생성된 서비스 계정 클릭
   - "키" 탭 → "키 추가" → "새 키 만들기"
   - 유형: JSON
   - "만들기" 클릭 → JSON 파일 다운로드
   - 파일명: `gcp-service-account.json`

6. **파일 저장**
   ```bash
   mkdir -p credentials
   mv ~/Downloads/news-printer-*.json credentials/gcp-service-account.json
   ```

**용도**: 뉴스 스크립트 → 음성 변환

---

### 4.3. Pexels API 키

**발급 방법**:
1. https://www.pexels.com/api/ 접속
2. "Sign Up" 또는 로그인
3. "Your API Key" 섹션에서 키 복사

**용도**: 배경 이미지 검색 (무료 플랜 사용 가능)

---

### 4.4. Unsplash API 키

**발급 방법**:
1. https://unsplash.com/developers 접속
2. "Register as a developer" 클릭
3. "New Application" 클릭
4. 앱 이름 입력 (예: `News Printer`)
5. "Access Key" 복사

**용도**: 배경 이미지 검색 (Pexels와 병행 사용)

---

### 4.5. YouTube Data API v3 + OAuth 2.0

**발급 방법**:

1. **Google Cloud Console 접속**
   - https://console.cloud.google.com/
   - 기존 프로젝트 (`news-printer`) 선택

2. **YouTube Data API v3 활성화**
   - 검색창에 "YouTube Data API v3" 입력
   - "사용 설정" 클릭

3. **OAuth 2.0 클라이언트 ID 생성**
   - 왼쪽 메뉴 → "API 및 서비스" → "사용자 인증 정보"
   - "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID"

4. **OAuth 동의 화면 구성** (처음이면)
   - "동의 화면 구성" 클릭
   - 사용자 유형: "외부"
   - 앱 이름: `News Printer`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처: 본인 이메일
   - "저장 후 계속" 클릭

5. **범위 추가**
   - "범위 추가 또는 삭제" 클릭
   - `https://www.googleapis.com/auth/youtube.upload` 선택
   - `https://www.googleapis.com/auth/youtube` 선택
   - "업데이트" 클릭

6. **테스트 사용자 추가**
   - "테스트 사용자" → "사용자 추가"
   - 본인 Gmail 주소 입력
   - "저장 후 계속" 클릭

7. **OAuth 클라이언트 ID 생성 계속**
   - 애플리케이션 유형: "웹 애플리케이션"
   - 이름: `News Printer Web Client`
   - 승인된 리디렉션 URI:
     ```
     http://localhost:3000/auth/youtube/callback
     ```
   - "만들기" 클릭

8. **JSON 다운로드**
   - 생성된 OAuth 클라이언트 클릭
   - 오른쪽 상단 "JSON 다운로드" 클릭
   - 파일 저장:
     ```bash
     mv ~/Downloads/client_secret_*.json credentials/youtube-oauth-credentials.json
     ```

**용도**: YouTube 영상 업로드

---

### 4.6. YouTube Analytics API (선택사항)

**발급 방법**:

1. **Google Cloud Console**
   - YouTube Analytics API 검색
   - "사용 설정" 클릭

2. **OAuth 범위 추가**
   - "API 및 서비스" → "OAuth 동의 화면"
   - "범위 추가 또는 삭제" 클릭
   - `https://www.googleapis.com/auth/youtube.readonly` 추가
   - `https://www.googleapis.com/auth/yt-analytics.readonly` 추가
   - "업데이트" 클릭

3. **재인증 필요**
   - 서버 시작 후 `/auth/youtube/authorize` 접속하여 재인증

**용도**: 영상 성과 메트릭 수집, 자동 최적화

---

## 5. 환경 변수 설정

### 5.1. .env 파일 생성

```bash
# .env.example을 복사하여 .env 생성
cp .env.example .env
```

### 5.2. .env 파일 편집

```bash
nano .env
# 또는
vim .env
# 또는 원하는 에디터 사용
```

### 5.3. 환경 변수 입력

```bash
# Application Configuration
PORT=3000

# RSS Feed Configuration
RSS_BASE_URL=https://www.chosun.com/arc/outboundfeeds/rss/category
RSS_TIMEOUT=10000
RSS_DEFAULT_CATEGORY=politics
RSS_DEFAULT_LIMIT=10

# Google Gemini API Configuration
GEMINI_API_KEY=AIzaSyABC...XYZ  # ← 4.1에서 발급한 키 입력

# Google Cloud TTS Configuration
GOOGLE_APPLICATION_CREDENTIALS=./credentials/gcp-service-account.json

# Image Search API Keys
PEXELS_API_KEY=abc123xyz  # ← 4.3에서 발급한 키 입력
UNSPLASH_ACCESS_KEY=xyz789abc  # ← 4.4에서 발급한 키 입력

# YouTube Configuration
YOUTUBE_CLIENT_SECRET_PATH=./credentials/youtube-oauth-credentials.json
YOUTUBE_TOKENS_PATH=./credentials/youtube-tokens.json
```

**저장**: `Ctrl+O` → `Enter` → `Ctrl+X` (nano 에디터)

---

## 6. 인증 파일 설정

### 6.1. credentials 디렉토리 확인

```bash
ls -la credentials/
```

**필수 파일 확인**:
- ✅ `gcp-service-account.json` (4.2에서 다운로드)
- ✅ `youtube-oauth-credentials.json` (4.5에서 다운로드)

### 6.2. 파일 권한 설정 (Linux/macOS)

```bash
chmod 600 credentials/*.json
```

---

## 7. 의존성 설치 및 빌드

### 7.1. npm 패키지 설치

```bash
npm install
```

**예상 소요 시간**: 2-5분

**경고 메시지 무시 가능**:
- `EBADENGINE` 경고 (Jest 패키지)
- `npm audit` 경고 (개발 의존성)

### 7.2. 프로젝트 빌드

```bash
npm run build
```

**성공 메시지**:
```
> news-printer@0.0.1 build
> nest build

[컴파일 성공 메시지]
```

---

## 8. 첫 실행 및 테스트

### 8.1. 개발 서버 시작

```bash
npm run start:dev
```

**성공 메시지 확인**:
```
[Nest] 3583  - [NestApplication] Nest application successfully started
[CategoryOptimizationService] Loaded 9 category strategies from config
```

**예상 경고 (무시 가능)**:
```
[ERROR] [FaceDetectionService] Failed to initialize Haar Cascade
[ERROR] [AnalyticsService] YouTube API credentials not configured
```
→ 영상 생성에는 영향 없음

### 8.2. YouTube 인증

1. **브라우저에서 인증 URL 접속**:
   ```
   http://localhost:3000/auth/youtube/authorize
   ```

2. **Google 로그인**
   - OAuth 동의 화면에서 본인 계정으로 로그인

3. **권한 승인**
   - "News Printer가 다음을 수행하도록 허용" 화면
   - "허용" 클릭

4. **성공 메시지 확인**:
   ```
   YouTube authorization successful!
   Tokens saved to ./credentials/youtube-tokens.json
   ```

5. **토큰 파일 생성 확인**:
   ```bash
   ls -la credentials/youtube-tokens.json
   ```

### 8.3. 인증 상태 확인

```bash
curl http://localhost:3000/auth/youtube/status
```

**성공 응답**:
```json
{
  "authorized": true,
  "tokenExpired": false,
  "message": "YouTube API is authorized and ready"
}
```

### 8.4. 뉴스 가져오기 테스트

```bash
curl "http://localhost:3000/news?limit=1" | python3 -m json.tool
```

**성공 응답**:
```json
{
  "success": true,
  "data": [
    {
      "title": "뉴스 제목...",
      "link": "...",
      "category": "politics",
      ...
    }
  ]
}
```

### 8.5. 테스트 영상 업로드

**테스트 데이터 생성**:
```bash
cat > /tmp/test_news.json << 'EOF'
{
  "title": "테스트 뉴스 영상",
  "newsContent": "이것은 시스템 테스트를 위한 샘플 뉴스 콘텐츠입니다.",
  "anchorScript": "안녕하세요, 테스트 뉴스입니다.",
  "reporterScript": "현장 리포트입니다.",
  "privacyStatus": "unlisted"
}
EOF
```

**영상 생성 및 업로드**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d @/tmp/test_news.json \
  http://localhost:3000/media/publish
```

**성공 응답** (약 20-30초 소요):
```json
{
  "success": true,
  "videoId": "ABC123xyz",
  "videoUrl": "https://www.youtube.com/watch?v=ABC123xyz"
}
```

**YouTube에서 확인**:
1. 응답의 `videoUrl` 링크 복사
2. 브라우저에서 열기
3. 영상 재생 확인

---

## 9. 운영 시작

### 9.1. 자동 뉴스 영상 생성

**하루 1개 뉴스 자동 업로드**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"limit": 1, "privacyStatus": "public"}' \
  http://localhost:3000/news/publish-all
```

**하루 10개 뉴스 자동 업로드**:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"limit": 10, "privacyStatus": "public"}' \
  http://localhost:3000/news/publish-all
```

### 9.2. Cron으로 자동화

**매일 오전 9시에 10개 뉴스 자동 업로드**:

```bash
# crontab 편집
crontab -e
```

**추가할 내용**:
```bash
# 매일 오전 9시에 10개 뉴스 업로드
0 9 * * * curl -X POST -H "Content-Type: application/json" -d '{"limit": 10, "privacyStatus": "public"}' http://localhost:3000/news/publish-all
```

### 9.3. 프로덕션 배포 (PM2)

**PM2 설치**:
```bash
npm install -g pm2
```

**프로덕션 빌드**:
```bash
npm run build
```

**PM2로 서버 시작**:
```bash
pm2 start dist/main.js --name news-printer
```

**자동 시작 설정**:
```bash
pm2 startup
pm2 save
```

**서버 상태 확인**:
```bash
pm2 status
pm2 logs news-printer
```

### 9.4. Docker로 배포 (선택사항)

**Dockerfile 생성**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/main.js"]
```

**이미지 빌드**:
```bash
docker build -t news-printer .
```

**컨테이너 실행**:
```bash
docker run -d \
  --name news-printer \
  -p 3000:3000 \
  -v $(pwd)/credentials:/app/credentials \
  -v $(pwd)/.env:/app/.env \
  news-printer
```

---

## 10. 트러블슈팅

### 10.1. FaceDetectionService 에러

**증상**:
```
[ERROR] [FaceDetectionService] Failed to initialize Haar Cascade
opencv_js_1.default.CascadeClassifier is not a constructor
```

**해결**:
- 영상 생성에는 영향 없음
- 무시하고 계속 사용 가능
- 수정 원하면: `CONFIGURATION_STATUS.md` 참고

---

### 10.2. AnalyticsService 에러

**증상**:
```
[ERROR] [AnalyticsService] YouTube API credentials not configured
```

**해결**:
- YouTube Analytics API 별도 설정 필요 (선택사항)
- 영상 업로드는 정상 작동
- 설정 방법: 4.6 참고

---

### 10.3. YouTube 업로드 실패

**증상**:
```
[ERROR] [YoutubeService] Upload failed: invalid_grant
```

**해결**:
```bash
# 1. 기존 토큰 삭제
rm credentials/youtube-tokens.json

# 2. 재인증
curl http://localhost:3000/auth/youtube/authorize
# 브라우저에서 다시 인증
```

---

### 10.4. FFmpeg 관련 에러

**증상**:
```
[ERROR] [VideoService] FFmpeg not found
```

**해결**:
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# 설치 확인
ffmpeg -version
```

---

### 10.5. Google Cloud TTS 에러

**증상**:
```
[ERROR] [TtsService] Could not load credentials
```

**해결**:
```bash
# 1. 파일 경로 확인
ls -la credentials/gcp-service-account.json

# 2. 환경 변수 확인
cat .env | grep GOOGLE_APPLICATION_CREDENTIALS

# 3. 파일 권한 확인
chmod 600 credentials/gcp-service-account.json
```

---

### 10.6. Port 3000 이미 사용 중

**증상**:
```
Error: listen EADDRINUSE: address already in use :::3000
```

**해결**:
```bash
# 기존 프로세스 종료
lsof -ti:3000 | xargs kill -9

# 또는 다른 포트 사용 (.env 수정)
PORT=3001
```

---

### 10.7. npm install 실패

**증상**:
```
npm ERR! code EACCES
```

**해결**:
```bash
# npm 캐시 정리
npm cache clean --force

# 다시 설치
rm -rf node_modules package-lock.json
npm install
```

---

## 📞 추가 지원

### 로그 확인
```bash
# 실시간 로그
npm run start:dev

# PM2 로그
pm2 logs news-printer

# 특정 서비스 로그만 보기
pm2 logs news-printer | grep "MediaPipeline"
```

### 설정 파일 위치
```
news-printer/
├── .env                                  # 환경 변수
├── config/category-strategies.json       # 카테고리 설정
├── credentials/
│   ├── gcp-service-account.json         # TTS 인증
│   ├── youtube-oauth-credentials.json   # YouTube OAuth
│   └── youtube-tokens.json              # YouTube 토큰
└── CONFIGURATION_STATUS.md              # 설정 상태
```

### 유용한 명령어
```bash
# 서버 상태 확인
curl http://localhost:3000/

# YouTube 인증 상태
curl http://localhost:3000/auth/youtube/status

# 뉴스 가져오기
curl http://localhost:3000/news?limit=1

# 전체 빌드 재실행
npm run build

# 테스트 실행
npm test
```

---

## ✅ 체크리스트

### 설정 완료 확인
- [ ] Node.js 18.x 이상 설치
- [ ] FFmpeg 설치
- [ ] Git 설치
- [ ] Gemini API 키 발급 및 .env 설정
- [ ] Google Cloud TTS JSON 다운로드 및 저장
- [ ] Pexels API 키 발급 및 .env 설정
- [ ] Unsplash API 키 발급 및 .env 설정
- [ ] YouTube OAuth 설정 및 인증
- [ ] npm install 성공
- [ ] npm run build 성공
- [ ] 서버 시작 성공
- [ ] YouTube 인증 완료
- [ ] 테스트 영상 업로드 성공

### 운영 준비
- [ ] Cron 자동화 설정 (선택)
- [ ] PM2 또는 Docker 배포 (선택)
- [ ] YouTube Analytics API 설정 (선택)
- [ ] 모니터링 시스템 구축 (선택)

---

**축하합니다! 🎉 News Printer 시스템이 완전히 설정되었습니다.**

이제 자동으로 뉴스 영상을 생성하고 YouTube에 업로드할 수 있습니다.
