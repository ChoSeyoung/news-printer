#!/bin/bash

# Daum 뉴스 스크래핑 및 YouTube 업로드 스크립트 실행 헬퍼
#
# 사용법:
#   ./scripts/scrape-and-upload.sh [options]
#
# 예시:
#   ./scripts/scrape-and-upload.sh                        # 기본 실행 (롱폼 + 숏폼 둘 다, 10개 기사)
#   ./scripts/scrape-and-upload.sh --max 5                # 둘 다 5개씩 업로드
#   ./scripts/scrape-and-upload.sh --type longform        # 롱폼 영상만 생성
#   ./scripts/scrape-and-upload.sh --type shortform       # 숏폼 영상만 생성
#   ./scripts/scrape-and-upload.sh --type both            # 둘 다 생성 (기본값)

cd "$(dirname "$0")/.."

echo "🚀 Running Daum News Scraping & Upload Script..."
echo ""

npx ts-node scripts/scrape-and-upload.ts "$@"
