#!/bin/bash

# Pending 영상 전체 재업로드 스크립트
# 사용법: ./scripts/retry-pending.sh

cd "$(dirname "$0")/.."

echo "🚀 Starting pending uploads retry..."
npx ts-node scripts/retry-pending-uploads.ts
