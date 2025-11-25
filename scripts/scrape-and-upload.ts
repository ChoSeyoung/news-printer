#!/usr/bin/env ts-node

/**
 * Daum 뉴스 스크래핑 및 YouTube 업로드 스크립트
 *
 * 사용법:
 *   npx ts-node scripts/scrape-and-upload.ts [options]
 *
 * 옵션:
 *   --max <number>                      최대 처리 기사 수 (기본: 10)
 *   --type longform|shortform|both      생성할 영상 타입 (기본: both)
 *
 * 예시:
 *   npx ts-node scripts/scrape-and-upload.ts                # 둘 다 업로드
 *   npx ts-node scripts/scrape-and-upload.ts --max 5        # 둘 다 5개씩
 *   npx ts-node scripts/scrape-and-upload.ts --type longform   # 롱폼만
 *   npx ts-node scripts/scrape-and-upload.ts --type shortform  # 숏폼만
 */

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DaumNewsScraperService } from '../src/news/services/daum-news-scraper.service';
import { ShortsPipelineService } from '../src/media/services/shorts-pipeline.service';
import { MediaPipelineService } from '../src/media/services/media-pipeline.service';

interface ScriptOptions {
  maxArticles: number;
  videoType: 'longform' | 'shortform' | 'both';
}

async function parseArguments(): Promise<ScriptOptions> {
  const args = process.argv.slice(2);
  const options: ScriptOptions = {
    maxArticles: 10,
    videoType: 'both',
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--max' && args[i + 1]) {
      const max = parseInt(args[i + 1], 10);
      if (isNaN(max) || max <= 0) {
        console.error(`❌ Invalid max count: ${args[i + 1]}`);
        process.exit(1);
      }
      options.maxArticles = max;
      i++;
    } else if (args[i] === '--type' && args[i + 1]) {
      const type = args[i + 1].toLowerCase();
      if (type === 'longform' || type === 'shortform' || type === 'both') {
        options.videoType = type as 'longform' | 'shortform' | 'both';
      } else {
        console.error(`❌ Invalid type: ${type}. Use: longform, shortform, or both`);
        process.exit(1);
      }
      i++;
    }
  }

  return options;
}

async function main() {
  console.log('🚀 Starting Daum News Scraping & YouTube Upload Script...\n');

  const options = await parseArguments();

  console.log(`📋 Configuration:`);
  console.log(`   Category: assembly (국회)`);
  console.log(`   Max articles: ${options.maxArticles}`);
  console.log(`   Video type: ${options.videoType}`);
  console.log(`   Upload method: API (with browser fallback on quota exceeded)\n`);

  try {
    // NestJS 앱 초기화
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error', 'warn', 'log'],
    });

    const scraperService = app.get(DaumNewsScraperService);
    const shortsPipeline = app.get(ShortsPipelineService);
    const mediaPipeline = app.get(MediaPipelineService);

    // 국회 뉴스만 스크래핑
    const categories: ('assembly')[] = ['assembly'];

    let totalProcessed = 0;
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const category of categories) {
      console.log(`\n📰 Scraping ${category} news...`);

      // 뉴스 목록 가져오기 (스크래핑 및 상세 정보 포함)
      const articles = await scraperService.fetchNewsByCategory(category, options.maxArticles);
      console.log(`   Found ${articles.length} articles\n`);

      for (let i = 0; i < articles.length; i++) {
        const articleData = articles[i];
        console.log(`\n[${i + 1}/${articles.length}] Processing: ${articleData.url}`);

        try {
          console.log(`   ✅ Title: ${articleData.title}`);
          console.log(`   ✅ Content length: ${articleData.content.length} chars`);
          console.log(`   ✅ Images: ${articleData.imageUrls.length}`);

          // 영상 생성 및 업로드
          if (options.videoType === 'shortform' || options.videoType === 'both') {
            console.log('   🎬 Creating and uploading shortform video...');

            const shortsResult = await shortsPipeline.createAndUploadShorts({
              title: articleData.title,
              reporterScript: articleData.content,
              newsUrl: articleData.url,
              imageUrls: articleData.imageUrls,
            });

            if (shortsResult.success) {
              console.log(`   ✅ Shortform uploaded successfully: ${shortsResult.videoUrl}`);
              totalSuccess++;
            } else {
              console.log(`   ❌ Shortform upload failed: ${shortsResult.error}`);
              totalFailed++;
            }

            // 둘 다 업로드하는 경우 대기 시간 추가
            if (options.videoType === 'both') {
              console.log('   ⏳ Waiting 3s before longform upload...');
              await new Promise((resolve) => setTimeout(resolve, 3000));
            }
          }

          if (options.videoType === 'longform' || options.videoType === 'both') {
            console.log('   🎬 Creating and uploading longform video...');

            // MediaPipelineService의 publishNews 메서드 사용
            const longformResult = await mediaPipeline.publishNews({
              title: articleData.title,
              newsContent: articleData.content,
              anchorScript: articleData.content.substring(0, 200), // 간략한 앵커 멘트
              reporterScript: articleData.content,
              newsUrl: articleData.url,
              imageUrls: articleData.imageUrls,
              privacyStatus: 'public',
            });

            if (longformResult.success) {
              console.log(`   ✅ Longform uploaded successfully: ${longformResult.videoUrl}`);
              totalSuccess++;
            } else {
              console.log(`   ❌ Longform upload failed: ${longformResult.error}`);
              totalFailed++;
            }
          }

          totalProcessed++;

          // 각 기사 처리 후 대기 (부하 분산)
          if (i < articles.length - 1) {
            const delay = 5000; // 5초
            console.log(`   ⏳ Waiting ${delay / 1000}s before next article...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        } catch (error) {
          console.error(`   ❌ Error processing article: ${error.message}`);
          totalFailed++;
        }
      }
    }

    // 최종 통계
    console.log('\n\n═══════════════════════════════════════');
    console.log('📊 Final Statistics');
    console.log('═══════════════════════════════════════');
    console.log(`   Total processed: ${totalProcessed}`);
    console.log(`   Success: ${totalSuccess}`);
    console.log(`   Failed: ${totalFailed}`);
    console.log(`   Success rate: ${totalProcessed > 0 ? ((totalSuccess / totalProcessed) * 100).toFixed(1) : 0}%`);
    console.log('═══════════════════════════════════════\n');

    console.log('🎉 Script completed!');

    // 앱 종료
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
