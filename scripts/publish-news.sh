#!/bin/bash

###############################################################################
# 뉴스 자동 업로드 스크립트
#
# 용도: /news/publish-all API를 호출하여 미업로드된 뉴스 기사를 YouTube에 업로드
# 실행 방법: ./scripts/publish-news.sh
#
# API 엔드포인트: POST http://localhost:3000/news/publish-all
# 파라미터:
#   - category: 뉴스 카테고리 (기본값: politics)
#   - limit: 처리할 최대 기사 수 (기본값: 100)
#   - privacyStatus: YouTube 공개 설정 (public, private, unlisted)
#
# 작성일: 2025-11-22
###############################################################################

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API 설정
API_URL="http://localhost:3000/news/publish-all"
CATEGORY="politics"
LIMIT=100
PRIVACY_STATUS="public"

# 로그 파일 설정
LOG_DIR="./logs"
LOG_FILE="${LOG_DIR}/publish-news-$(date +%Y%m%d-%H%M%S).log"

# 로그 디렉토리 생성
mkdir -p "${LOG_DIR}"

# 로그 함수
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "${LOG_FILE}"
}

# 서버 상태 확인
check_server() {
    log_info "서버 상태 확인 중..."

    if lsof -i :3000 > /dev/null 2>&1; then
        log_success "서버가 포트 3000에서 실행 중입니다."
        return 0
    else
        log_error "서버가 실행되고 있지 않습니다. 포트 3000을 확인하세요."
        return 1
    fi
}

# 뉴스 업로드 실행
publish_news() {
    log_info "뉴스 업로드 시작..."
    log_info "설정: category=${CATEGORY}, limit=${LIMIT}, privacyStatus=${PRIVACY_STATUS}"

    # JSON 페이로드
    JSON_DATA="{\"category\":\"${CATEGORY}\",\"limit\":${LIMIT},\"privacyStatus\":\"${PRIVACY_STATUS}\"}"

    log_info "API 요청 전송 중..."

    # curl 실행 (타임아웃 30분)
    HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${API_URL}" \
        -H "Content-Type: application/json" \
        -d "${JSON_DATA}" \
        --max-time 1800)

    # HTTP 응답 코드 추출
    HTTP_CODE=$(echo "${HTTP_RESPONSE}" | tail -n1)
    RESPONSE_BODY=$(echo "${HTTP_RESPONSE}" | sed '$d')

    # 응답 로깅
    echo "${RESPONSE_BODY}" >> "${LOG_FILE}"

    # 상태 코드 확인
    if [ "${HTTP_CODE}" -eq 200 ] || [ "${HTTP_CODE}" -eq 201 ]; then
        log_success "API 요청 성공 (HTTP ${HTTP_CODE})"

        # 결과 파싱 (jq가 설치되어 있는 경우)
        if command -v jq &> /dev/null; then
            TOTAL_PROCESSED=$(echo "${RESPONSE_BODY}" | jq -r '.totalProcessed // 0')
            SUCCESSFUL=$(echo "${RESPONSE_BODY}" | jq -r '.successful // 0')
            FAILED=$(echo "${RESPONSE_BODY}" | jq -r '.failed // 0')

            log_info "처리 결과:"
            log_info "  - 총 처리: ${TOTAL_PROCESSED}건"
            log_success "  - 성공: ${SUCCESSFUL}건"
            if [ "${FAILED}" -gt 0 ]; then
                log_warning "  - 실패: ${FAILED}건"
            else
                log_info "  - 실패: ${FAILED}건"
            fi
        else
            log_warning "jq가 설치되지 않아 상세 결과를 표시할 수 없습니다."
            log_info "응답 본문:"
            echo "${RESPONSE_BODY}" | tee -a "${LOG_FILE}"
        fi

        return 0
    else
        log_error "API 요청 실패 (HTTP ${HTTP_CODE})"
        log_error "응답 본문: ${RESPONSE_BODY}"
        return 1
    fi
}

# 메인 실행
main() {
    log_info "========================================="
    log_info "뉴스 자동 업로드 스크립트 시작"
    log_info "========================================="

    # 서버 상태 확인
    if ! check_server; then
        log_error "서버가 실행되지 않아 종료합니다."
        exit 1
    fi

    # 뉴스 업로드 실행
    if publish_news; then
        log_success "========================================="
        log_success "뉴스 업로드 완료"
        log_success "로그 파일: ${LOG_FILE}"
        log_success "========================================="
        exit 0
    else
        log_error "========================================="
        log_error "뉴스 업로드 실패"
        log_error "로그 파일: ${LOG_FILE}"
        log_error "========================================="
        exit 1
    fi
}

# 스크립트 실행
main
