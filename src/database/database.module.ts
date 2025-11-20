import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PublishedNews } from './entities/published-news.entity';

/**
 * SQLite 파일 데이터베이스 모듈
 *
 * Docker 의존성 제거를 위해 SQLite 파일 데이터베이스 사용
 * - 애플리케이션 재시작 시에도 데이터 유지
 * - 별도의 데이터베이스 서버 불필요
 * - 개발 및 프로덕션 환경 모두 적합
 * - 데이터베이스 파일 위치: data/news.db
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: 'data/news.db', // 파일 기반 데이터베이스
        entities: [PublishedNews],
        synchronize: true, // 자동 스키마 동기화
        logging: configService.get('NODE_ENV') !== 'production',
        dropSchema: false, // 스키마 자동 삭제 비활성화
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([PublishedNews]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
