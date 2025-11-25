import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 파일 시스템 정리 서비스
 *
 * 업로드 완료 후 불필요한 파일들을 정리하는 서비스
 *
 * 주요 기능:
 * - pending-uploads 디렉토리의 longform/shortform 정리
 * - temp 디렉토리의 임시 파일 정리 (필수 파일 제외)
 */
@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name);

  // 삭제하지 않을 필수 파일 목록
  private readonly ESSENTIAL_FILES = [
    'published-news.json', // 발행된 뉴스 추적 파일
    'youtube-auth-state.json', // YouTube 인증 상태 파일
    '.gitkeep', // Git 디렉토리 유지 파일
  ];

  /**
   * pending-uploads 디렉토리 정리
   *
   * longform과 shortform 디렉토리의 모든 파일을 삭제합니다.
   *
   * @returns 삭제된 파일 수
   */
  async cleanupPendingUploads(): Promise<{
    longformDeleted: number;
    shortformDeleted: number;
    totalDeleted: number;
  }> {
    this.logger.log('Starting pending-uploads cleanup...');

    const longformDeleted = await this.cleanupDirectory('pending-uploads/longform');
    const shortformDeleted = await this.cleanupDirectory('pending-uploads/shortform');

    const totalDeleted = longformDeleted + shortformDeleted;

    this.logger.log(
      `Pending-uploads cleanup completed: ${totalDeleted} files deleted (${longformDeleted} longform, ${shortformDeleted} shortform)`,
    );

    return {
      longformDeleted,
      shortformDeleted,
      totalDeleted,
    };
  }

  /**
   * temp 디렉토리 정리 (필수 파일 제외)
   *
   * published-news.json, youtube-auth-state.json 등
   * 필수 파일을 제외한 모든 임시 파일을 삭제합니다.
   *
   * @returns 삭제된 파일 수
   */
  async cleanupTempDirectory(): Promise<{
    deletedCount: number;
    skippedFiles: string[];
  }> {
    this.logger.log('Starting temp directory cleanup...');

    const tempDir = './temp';
    const skippedFiles: string[] = [];
    let deletedCount = 0;

    try {
      // temp 디렉토리 존재 확인
      if (!(await fs.pathExists(tempDir))) {
        this.logger.warn(`Temp directory does not exist: ${tempDir}`);
        return { deletedCount: 0, skippedFiles: [] };
      }

      // temp 디렉토리의 모든 파일/폴더 조회
      const items = await fs.readdir(tempDir);

      for (const item of items) {
        const itemPath = path.join(tempDir, item);

        // 필수 파일인지 확인
        if (this.ESSENTIAL_FILES.includes(item)) {
          this.logger.debug(`Skipping essential file: ${item}`);
          skippedFiles.push(item);
          continue;
        }

        // 파일 또는 디렉토리 삭제
        try {
          const stat = await fs.stat(itemPath);

          if (stat.isDirectory()) {
            await fs.remove(itemPath);
            this.logger.debug(`Deleted directory: ${item}`);
            deletedCount++;
          } else if (stat.isFile()) {
            await fs.remove(itemPath);
            this.logger.debug(`Deleted file: ${item}`);
            deletedCount++;
          }
        } catch (error) {
          this.logger.warn(`Failed to delete ${item}: ${error.message}`);
        }
      }

      this.logger.log(
        `Temp cleanup completed: ${deletedCount} files deleted, ${skippedFiles.length} essential files preserved`,
      );

      return { deletedCount, skippedFiles };
    } catch (error) {
      this.logger.error(`Temp cleanup error: ${error.message}`);
      return { deletedCount, skippedFiles };
    }
  }

  /**
   * 전체 정리 실행
   *
   * pending-uploads와 temp 디렉토리를 모두 정리합니다.
   *
   * @returns 전체 정리 결과
   */
  async cleanupAll(): Promise<{
    pendingUploads: {
      longformDeleted: number;
      shortformDeleted: number;
      totalDeleted: number;
    };
    temp: {
      deletedCount: number;
      skippedFiles: string[];
    };
    totalFilesDeleted: number;
  }> {
    this.logger.log('Starting full cleanup...');

    const pendingUploads = await this.cleanupPendingUploads();
    const temp = await this.cleanupTempDirectory();

    const totalFilesDeleted = pendingUploads.totalDeleted + temp.deletedCount;

    this.logger.log(`Full cleanup completed: ${totalFilesDeleted} total files deleted`);

    return {
      pendingUploads,
      temp,
      totalFilesDeleted,
    };
  }

  /**
   * 특정 디렉토리의 모든 파일 삭제
   *
   * @param dirPath - 정리할 디렉토리 경로
   * @returns 삭제된 파일 수
   */
  private async cleanupDirectory(dirPath: string): Promise<number> {
    let deletedCount = 0;

    try {
      // 디렉토리 존재 확인
      if (!(await fs.pathExists(dirPath))) {
        this.logger.warn(`Directory does not exist: ${dirPath}`);
        return 0;
      }

      // 디렉토리의 모든 파일/폴더 조회
      const items = await fs.readdir(dirPath);

      // .gitkeep 파일 제외하고 모두 삭제
      for (const item of items) {
        if (item === '.gitkeep') {
          continue;
        }

        const itemPath = path.join(dirPath, item);

        try {
          await fs.remove(itemPath);
          this.logger.debug(`Deleted: ${itemPath}`);
          deletedCount++;
        } catch (error) {
          this.logger.warn(`Failed to delete ${itemPath}: ${error.message}`);
        }
      }

      return deletedCount;
    } catch (error) {
      this.logger.error(`Cleanup error for ${dirPath}: ${error.message}`);
      return deletedCount;
    }
  }

  /**
   * 오래된 파일 정리 (선택적 기능)
   *
   * 특정 시간(일) 이상 지난 파일들을 정리합니다.
   *
   * @param dirPath - 정리할 디렉토리 경로
   * @param daysOld - 삭제 기준 일수
   * @returns 삭제된 파일 수
   */
  async cleanupOldFiles(dirPath: string, daysOld: number): Promise<number> {
    this.logger.log(`Cleaning up files older than ${daysOld} days in ${dirPath}...`);

    let deletedCount = 0;

    try {
      if (!(await fs.pathExists(dirPath))) {
        this.logger.warn(`Directory does not exist: ${dirPath}`);
        return 0;
      }

      const items = await fs.readdir(dirPath);
      const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

      for (const item of items) {
        // 필수 파일은 건너뛰기
        if (this.ESSENTIAL_FILES.includes(item)) {
          continue;
        }

        const itemPath = path.join(dirPath, item);

        try {
          const stat = await fs.stat(itemPath);

          // 파일 수정 시간이 기준보다 오래되었으면 삭제
          if (stat.mtimeMs < cutoffTime) {
            await fs.remove(itemPath);
            this.logger.debug(`Deleted old file: ${item} (age: ${Math.floor((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000))} days)`);
            deletedCount++;
          }
        } catch (error) {
          this.logger.warn(`Failed to process ${item}: ${error.message}`);
        }
      }

      this.logger.log(`Old files cleanup completed: ${deletedCount} files deleted`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`Old files cleanup error: ${error.message}`);
      return deletedCount;
    }
  }
}
