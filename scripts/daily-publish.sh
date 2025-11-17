#!/bin/bash

###############################################################################
# News Printer - 일일 뉴스 자동 퍼블리싱 스크립트
###############################################################################
#
# 용도: 매일 오후 12시에 cron으로 실행되어 뉴스 영상을 자동 생성 및 유튜브 업로드
#
# Cron 설정 예시:
# 0 12 * * * /path/to/news-printer/scripts/daily-publish.sh
#
# 실행 전 필요사항:
# 1. .env 파일 설정 완료
# 2. Google Cloud 인증 파일 (google-credentials.json)
# 3. YouTube OAuth 토큰 (credentials/youtube-tokens.json)
# 4. FFmpeg 설치
# 5. Node.js 및 npm 패키지 설치
#
###############################################################################

# 에러 발생 시 즉시 종료
set -e

# 스크립트 디렉토리 경로
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 로그 디렉토리 및 파일
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/publish-$(date +%Y%m%d-%H%M%S).log"

# 로그 디렉토리 생성
mkdir -p "$LOG_DIR"

# 로그 함수
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" | tee -a "$LOG_FILE" >&2
}

# 프로젝트 디렉토리로 이동
cd "$PROJECT_DIR"

log "========================================="
log "News Printer - Daily Publishing Started"
log "========================================="
log "Project directory: $PROJECT_DIR"
log "Log file: $LOG_FILE"

# 1. 환경 변수 확인
log "Step 1: Checking environment variables"
if [ ! -f ".env" ]; then
    log_error ".env file not found!"
    exit 1
fi

# .env 파일 로드
export $(cat .env | grep -v '^#' | xargs)
log "Environment variables loaded"

# 2. Google Cloud 인증 파일 확인
log "Step 2: Checking Google Cloud credentials"
if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
    log_error "Google Cloud credentials not found: $GOOGLE_APPLICATION_CREDENTIALS"
    exit 1
fi
log "Google Cloud credentials found"

# 3. YouTube OAuth 토큰 확인
log "Step 3: Checking YouTube OAuth tokens"
if [ ! -f "credentials/youtube-tokens.json" ]; then
    log_error "YouTube tokens not found: credentials/youtube-tokens.json"
    exit 1
fi
log "YouTube tokens found"

# 4. FFmpeg 설치 확인
log "Step 4: Checking FFmpeg installation"
if ! command -v ffmpeg &> /dev/null; then
    log_error "FFmpeg is not installed. Please install FFmpeg first."
    exit 1
fi
FFMPEG_VERSION=$(ffmpeg -version | head -n 1)
log "FFmpeg found: $FFMPEG_VERSION"

# 5. Node.js 및 npm 확인
log "Step 5: Checking Node.js installation"
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi
NODE_VERSION=$(node --version)
log "Node.js version: $NODE_VERSION"

# 6. 의존성 설치 확인
log "Step 6: Checking dependencies"
if [ ! -d "node_modules" ]; then
    log "Installing dependencies..."
    npm install >> "$LOG_FILE" 2>&1
else
    log "Dependencies already installed"
fi

# 7. 애플리케이션 빌드
log "Step 7: Building application"
npm run build >> "$LOG_FILE" 2>&1
log "Build completed"

# 8. temp 디렉토리 생성
log "Step 8: Creating temp directory"
mkdir -p temp
log "Temp directory ready"

# 9. 서버 시작
log "Step 9: Starting server"
PORT=${PORT:-3000}

# 기존 프로세스 종료
if [ -f "server.pid" ]; then
    OLD_PID=$(cat server.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        log "Stopping existing server (PID: $OLD_PID)"
        kill $OLD_PID || true
        sleep 2
    fi
    rm server.pid
fi

# 서버 시작 (백그라운드)
nohup npm run start:prod > "$LOG_DIR/server-$(date +%Y%m%d-%H%M%S).log" 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > server.pid
log "Server started (PID: $SERVER_PID)"

# 서버 준비 대기
log "Waiting for server to be ready..."
MAX_WAIT=60
WAIT_COUNT=0
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if curl -s http://localhost:$PORT > /dev/null 2>&1; then
        log "Server is ready!"
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
    log_error "Server failed to start within $MAX_WAIT seconds"
    kill $SERVER_PID || true
    rm server.pid
    exit 1
fi

# 10. 뉴스 퍼블리싱 실행
log "Step 10: Publishing news"

# 설정값
CATEGORY=${NEWS_CATEGORY:-"politics"}
LIMIT=${NEWS_LIMIT:-10}
PRIVACY_STATUS="public"  # 실제 퍼블리싱은 공개로 설정

log "Publishing configuration:"
log "  - Category: $CATEGORY"
log "  - Limit: $LIMIT"
log "  - Privacy: $PRIVACY_STATUS"

# API 호출
RESPONSE=$(curl -s -X POST http://localhost:$PORT/news/publish-all \
    -H "Content-Type: application/json" \
    -d "{\"category\": \"$CATEGORY\", \"limit\": $LIMIT, \"privacyStatus\": \"$PRIVACY_STATUS\"}")

# 응답 저장
RESULT_FILE="$LOG_DIR/result-$(date +%Y%m%d-%H%M%S).json"
echo "$RESPONSE" > "$RESULT_FILE"
log "Result saved to: $RESULT_FILE"

# 결과 파싱
SUCCESSFUL=$(echo "$RESPONSE" | jq -r '.successful // 0')
FAILED=$(echo "$RESPONSE" | jq -r '.failed // 0')
TOTAL=$(echo "$RESPONSE" | jq -r '.totalProcessed // 0')

log "Publishing completed:"
log "  - Total Processed: $TOTAL"
log "  - Successful: $SUCCESSFUL"
log "  - Failed: $FAILED"

# 성공한 비디오 링크 로깅
if [ "$SUCCESSFUL" -gt 0 ]; then
    log ""
    log "Successfully published videos:"
    echo "$RESPONSE" | jq -r '.results[] | select(.success == true) | "  - \(.title): \(.videoUrl)"' | tee -a "$LOG_FILE"
fi

# 실패한 아이템 로깅
if [ "$FAILED" -gt 0 ]; then
    log ""
    log "Failed items:"
    echo "$RESPONSE" | jq -r '.results[] | select(.success == false) | "  - \(.title): \(.error)"' | tee -a "$LOG_FILE"
fi

# 11. 서버 종료
log "Step 11: Stopping server"
if [ -f "server.pid" ]; then
    kill $(cat server.pid) || true
    rm server.pid
    log "Server stopped"
fi

# 12. temp 디렉토리 정리 (선택적)
# log "Step 12: Cleaning up temp directory"
# rm -rf temp/*
# log "Temp directory cleaned"

# 13. 오래된 로그 삭제 (30일 이상)
log "Step 13: Cleaning old logs (>30 days)"
find "$LOG_DIR" -name "*.log" -type f -mtime +30 -delete 2>/dev/null || true
find "$LOG_DIR" -name "*.json" -type f -mtime +30 -delete 2>/dev/null || true
log "Old logs cleaned"

# 완료
log "========================================="
log "Daily Publishing Completed Successfully"
log "========================================="

# 종료 코드 반환
if [ "$FAILED" -gt 0 ]; then
    exit 1
else
    exit 0
fi
