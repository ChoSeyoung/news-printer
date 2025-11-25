#!/usr/bin/env ts-node

/**
 * Pending 영상 수동 재업로드 스크립트
 *
 * 사용법:
 *   npx ts-node scripts/retry-pending-uploads.ts [options]
 *
 * 옵션:
 *   --type shortform|longform|all  처리할 영상 타입 (기본: all)
 *   --max <number>                 최대 처리 개수 (기본: 제한 없음)
 *
 * 예시:
 *   npx ts-node scripts/retry-pending-uploads.ts
 *   npx ts-node scripts/retry-pending-uploads.ts --type shortform
 *   npx ts-node scripts/retry-pending-uploads.ts --type longform --max 5
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PendingUploadRetryService } from '../src/media/services/pending-upload-retry.service';

async function main() {
  console.log('🚀 Starting pending uploads retry script...\n');

  // CLI 인자 파싱
  const args = process.argv.slice(2);
  let videoType: 'shortform' | 'longform' | 'all' = 'all';
  let maxCount: number | undefined = undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--type' && args[i + 1]) {
      const type = args[i + 1].toLowerCase();
      if (type === 'shortform' || type === 'longform' || type === 'all') {
        videoType = type;
      } else {
        console.error(`❌ Invalid type: ${type}. Use: shortform, longform, or all`);
        process.exit(1);
      }
      i++;
    } else if (args[i] === '--max' && args[i + 1]) {
      maxCount = parseInt(args[i + 1], 10);
      if (isNaN(maxCount) || maxCount <= 0) {
        console.error(`❌ Invalid max count: ${args[i + 1]}`);
        process.exit(1);
      }
      i++;
    }
  }

  console.log(`📋 Configuration:`);
  console.log(`   Type: ${videoType}`);
  console.log(`   Max count: ${maxCount || 'unlimited'}\n`);

  try {
    // NestJS 앱 초기화
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const retryService = app.get(PendingUploadRetryService);

    // 통계 조회
    const stats = await retryService.getStatistics();
    console.log(`📊 Current pending uploads:`);
    console.log(`   Shortform: ${stats.shortformCount}`);
    console.log(`   Longform: ${stats.longformCount}`);
    console.log(`   Total: ${stats.totalCount}\n`);

    if (stats.totalCount === 0) {
      console.log('✅ No pending uploads to process!');
      await app.close();
      process.exit(0);
    }

    // 처리 시작
    console.log('⏳ Processing pending uploads...\n');

    if (videoType === 'all') {
      // Shortform 처리
      if (stats.shortformCount > 0) {
        console.log('📱 Processing Shortform...');
        const shortformResult = await retryService.retryByType('shortform', maxCount);
        console.log(
          `   ✅ Shortform: ${shortformResult.successCount} success, ${shortformResult.failedCount} failed (${shortformResult.totalAttempted} total)\n`,
        );
      }

      // Longform 처리
      if (stats.longformCount > 0) {
        console.log('🎬 Processing Longform...');
        const longformResult = await retryService.retryByType('longform', maxCount);
        console.log(
          `   ✅ Longform: ${longformResult.successCount} success, ${longformResult.failedCount} failed (${longformResult.totalAttempted} total)\n`,
        );
      }
    } else {
      // 특정 타입만 처리
      const emoji = videoType === 'shortform' ? '📱' : '🎬';
      console.log(`${emoji} Processing ${videoType}...`);
      const result = await retryService.retryByType(videoType, maxCount);
      console.log(
        `   ✅ ${videoType}: ${result.successCount} success, ${result.failedCount} failed (${result.totalAttempted} total)\n`,
      );
    }

    console.log('🎉 Processing completed!');

    // 앱 종료
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
