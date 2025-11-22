# Cron 자동화 설정 가이드

매일 오후 12시에 자동으로 뉴스 영상을 생성하고 유튜브에 업로드하는 cron 설정 방법입니다.

## 🎯 개요

GitHub Actions 대신 서버의 cron을 사용하여 더 간단하고 유연하게 자동화를 구성합니다.

**장점:**
- ✅ GitHub 파일을 건드리지 않고 설정 변경 가능
- ✅ 로컬 서버에서 직접 실행되어 디버깅 용이
- ✅ 설정 변경이 간단하고 빠름
- ✅ GitHub Actions 실행 시간 제한 없음

## 📋 사전 준비사항

### 1. 필수 소프트웨어 설치

```bash
# Node.js 설치 확인
node --version  # v18 이상

# FFmpeg 설치
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y ffmpeg

# CentOS/RHEL
sudo yum install -y ffmpeg
```

### 2. 프로젝트 설정

```bash
# 프로젝트 클론 (아직 안 했다면)
git clone https://github.com/your-username/news-printer.git
cd news-printer

# 의존성 설치
npm install

# 빌드
npm run build
```

### 3. 환경 변수 설정

`.env` 파일을 프로젝트 루트에 생성:

```env
# 서버 설정
PORT=3000

# RSS 피드 설정
RSS_BASE_URL=https://www.chosun.com/arc/outboundfeeds/rss/category
RSS_TIMEOUT=10000
RSS_DEFAULT_CATEGORY=politics
RSS_DEFAULT_LIMIT=10

# Google Cloud 설정
GOOGLE_APPLICATION_CREDENTIALS=./google-credentials.json
GCP_PROJECT_ID=your-gcp-project-id

# Google Gemini API
GEMINI_API_KEY=your-gemini-api-key

# YouTube API 설정
YOUTUBE_CLIENT_SECRET_PATH=./client_secret.json
YOUTUBE_TOKENS_PATH=./credentials/youtube-tokens.json

# 이미지 검색 API
PEXELS_API_KEY=your-pexels-api-key
UNSPLASH_ACCESS_KEY=your-unsplash-access-key

# 퍼블리싱 설정 (선택사항)
NEWS_CATEGORY=politics
NEWS_LIMIT=10
```

### 4. 인증 파일 설정

#### Google Cloud 인증
```bash
# Google Cloud Console에서 다운로드한 JSON 키 파일을 프로젝트 루트에 배치
cp /path/to/downloaded-key.json ./google-credentials.json
```

#### YouTube OAuth 토큰
```bash
# YouTube OAuth 인증 완료 후 토큰 파일 생성
mkdir -p credentials
# 인증 과정에서 생성된 토큰 파일이 credentials/youtube-tokens.json에 저장됨
```

## ⚙️ Cron 설정

### 1. Crontab 편집

```bash
crontab -e
```

### 2. Cron 작업 추가

**매일 오후 12시 실행:**

```cron
# 뉴스 자동 퍼블리싱 (매일 오후 12시)
0 12 * * * /Users/sy/news-printer/scripts/daily-publish.sh

# 또는 절대 경로 사용
0 12 * * * /full/path/to/news-printer/scripts/daily-publish.sh
```

**다른 시간대 예시:**

```cron
# 매일 오전 9시
0 9 * * * /path/to/news-printer/scripts/daily-publish.sh

# 매일 오후 6시
0 18 * * * /path/to/news-printer/scripts/daily-publish.sh

# 평일 오후 12시
0 12 * * 1-5 /path/to/news-printer/scripts/daily-publish.sh

# 매주 월요일 오후 12시
0 12 * * 1 /path/to/news-printer/scripts/daily-publish.sh
```

### 3. Cron 작업 확인

```bash
# 현재 설정된 cron 작업 확인
crontab -l
```

## 🔧 설정 커스터마이징

### 카테고리 변경

`.env` 파일에서 변경:

```env
# 정치 뉴스 (기본값)
NEWS_CATEGORY=politics

# 경제 뉴스
NEWS_CATEGORY=economy

# 사회 뉴스
NEWS_CATEGORY=society

# 국제 뉴스
NEWS_CATEGORY=international
```

### 영상 개수 변경

```env
# 10개 영상 생성 (기본값)
NEWS_LIMIT=10

# 5개 영상 생성
NEWS_LIMIT=5

# 20개 영상 생성
NEWS_LIMIT=20
```

### 공개 설정 변경

스크립트 파일 (`scripts/daily-publish.sh`)의 105번째 줄:

```bash
# 공개 (현재 설정)
PRIVACY_STATUS="public"

# 일부 공개
PRIVACY_STATUS="unlisted"

# 비공개
PRIVACY_STATUS="private"
```

## 📊 로그 확인

### 로그 파일 위치

```bash
# 최신 로그 확인
tail -f logs/publish-*.log

# 오늘 실행 로그 확인
ls -lt logs/publish-$(date +%Y%m%d)*.log | head -1 | awk '{print $NF}' | xargs cat

# 최근 10개 로그 파일 목록
ls -lt logs/publish-*.log | head -10
```

### 로그 파일 종류

- `publish-YYYYMMDD-HHMMSS.log` - 실행 로그
- `server-YYYYMMDD-HHMMSS.log` - 서버 로그
- `result-YYYYMMDD-HHMMSS.json` - API 응답 결과 (JSON)

### 로그 자동 정리

스크립트는 30일 이상 된 로그를 자동으로 삭제합니다.

## 🧪 테스트 실행

Cron 등록 전에 스크립트를 직접 실행하여 테스트:

```bash
# 스크립트 직접 실행
./scripts/daily-publish.sh

# 로그 확인
tail -f logs/publish-*.log
```

## 🔍 문제 해결

### Cron이 실행되지 않는 경우

1. **스크립트 실행 권한 확인:**
   ```bash
   chmod +x scripts/daily-publish.sh
   ```

2. **절대 경로 사용:**
   ```cron
   # 상대 경로 사용 ❌
   0 12 * * * ./scripts/daily-publish.sh

   # 절대 경로 사용 ✅
   0 12 * * * /Users/sy/news-printer/scripts/daily-publish.sh
   ```

3. **Cron 로그 확인:**
   ```bash
   # macOS
   log show --predicate 'process == "cron"' --last 1h

   # Linux
   grep CRON /var/log/syslog
   ```

### 환경 변수 문제

Cron은 최소한의 환경 변수만 제공하므로, `.env` 파일이 제대로 로드되는지 확인:

```bash
# 스크립트에 디버그 추가
set -x  # 스크립트 시작 부분에 추가
```

### 서버 시작 실패

```bash
# 포트 사용 중 확인
lsof -i :3000

# 프로세스 강제 종료
kill -9 $(lsof -t -i :3000)
```

## 📧 알림 설정 (선택사항)

### 이메일 알림

Cron 출력을 이메일로 받기:

```cron
MAILTO=your-email@example.com
0 12 * * * /path/to/news-printer/scripts/daily-publish.sh
```

### Slack 알림

스크립트 끝에 Slack webhook 추가:

```bash
# scripts/daily-publish.sh 끝에 추가
if [ $? -eq 0 ]; then
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"뉴스 퍼블리싱 성공: '"$SUCCESSFUL"'개 업로드"}' \
        YOUR_SLACK_WEBHOOK_URL
else
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"뉴스 퍼블리싱 실패! 로그 확인 필요"}' \
        YOUR_SLACK_WEBHOOK_URL
fi
```

## 🚀 프로덕션 배포 체크리스트

- [ ] `.env` 파일 설정 완료
- [ ] Google Cloud 인증 파일 배치
- [ ] YouTube OAuth 토큰 생성
- [ ] FFmpeg 설치 확인
- [ ] 스크립트 테스트 실행 성공
- [ ] Cron 작업 등록
- [ ] 첫 자동 실행 후 로그 확인
- [ ] 영상이 유튜브에 정상 업로드되었는지 확인

## 🔄 GitHub Actions 제거 (선택사항)

Cron으로 완전히 전환했다면 GitHub Actions 파일 제거:

```bash
rm -rf .github/workflows/auto-publish-news.yml
git add .
git commit -m "chore: Remove GitHub Actions, switch to cron"
git push
```

## 📝 참고사항

- 서버가 켜져 있어야 cron이 실행됩니다
- 서버 재부팅 시 cron 작업은 자동으로 복구됩니다
- 스크립트는 멱등성(idempotent)을 보장하여 여러 번 실행해도 안전합니다
- 로그는 30일간 보관 후 자동 삭제됩니다

## 💡 추가 개선 아이디어

1. **systemd 타이머 사용** (더 현대적인 방법):
   ```bash
   # systemd 타이머로 전환
   sudo systemctl enable news-publisher.timer
   ```

2. **PM2로 서버 관리**:
   ```bash
   npm install -g pm2
   pm2 start npm --name "news-publisher" -- run start:prod
   pm2 save
   ```

3. **Docker 컨테이너화**:
   ```bash
   docker-compose up -d
   # cron은 호스트에서 실행, 컨테이너 내부 API 호출
   ```
