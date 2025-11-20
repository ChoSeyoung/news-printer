import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PublishedNews } from './entities/published-news.entity';

/**
 * 인메모리 데이터베이스 모듈
 *
 * Docker 의존성 제거를 위해 SQLite 인메모리 데이터베이스 사용
 * - 애플리케이션 재시작 시 데이터 초기화됨
 * - 개발 및 테스트 환경에 적합
 * - 별도의 데이터베이스 서버 불필요
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'better-sqlite3',
        database: ':memory:', // 인메모리 데이터베이스
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
