import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 업로드 실패 영상 메타데이터 인터페이스
 */
export interface FailedUploadMetadata {
  /** 영상 제목 */
  title: string;
  /** 영상 설명 */
  description: string;
  /** 태그 배열 */
  tags: string[];
  /** 카테고리 ID */
  categoryId: string;
  /** 공개 상태 */
  privacyStatus: 'public' | 'private' | 'unlisted';
  /** 영상 파일명 */
  videoFileName: string;
  /** 썸네일 파일명 (선택사항) */
  thumbnailFileName?: string;
  /** 영상 타입 (longform 또는 shorts) */
  videoType: 'longform' | 'shorts';
  /** 실패 시간 */
  failedAt: string;
  /** 실패 사유 */
  failureReason: string;
  /** 뉴스 원본 URL */
  newsUrl?: string;
}

/**
 * 업로드 실패 영상 저장 서비스
 *
 * YouTube API 할당량 초과 등의 이유로 업로드에 실패한 영상을
 * 별도 디렉토리에 저장하고 메타데이터를 JSON으로 관리합니다.
 *
 * 디렉토리 구조:
 * pending-uploads/
 * ├── longform/
 * │   ├── video_20231123_001.mp4
 * │   ├── video_20231123_001.json
 * │   ├── thumbnail_20231123_001.jpg
 * │   ├── video_20231123_002.mp4
 * │   └── video_20231123_002.json
 * └── shorts/
 *     ├── short_20231123_001.mp4
 *     ├── short_20231123_001.json
 *     └── short_20231123_002.mp4
 */
@Injectable()
export class FailedUploadStorageService {
  private readonly logger = new Logger(FailedUploadStorageService.name);

  /** 대기 중인 업로드 저장 디렉토리 */
  private readonly pendingUploadsDir = './pending-uploads';
  private readonly longformDir = path.join(this.pendingUploadsDir, 'longform');
  private readonly shortsDir = path.join(this.pendingUploadsDir, 'shorts');

  constructor() {
    this.ensureDirectories();
  }

  /**
   * 필요한 디렉토리 생성
   */
  private ensureDirectories(): void {
    fs.ensureDirSync(this.longformDir);
    fs.ensureDirSync(this.shortsDir);
    this.logger.log('Pending uploads directories initialized');
  }

  /**
   * 업로드 실패한 영상 저장
   *
   * @param videoPath - 영상 파일 경로
   * @param thumbnailPath - 썸네일 파일 경로 (선택사항)
   * @param metadata - 업로드 메타데이터
   * @returns 저장 성공 여부
   */
  async saveFailedUpload(
    videoPath: string,
    thumbnailPath: string | undefined,
    metadata: Omit<FailedUploadMetadata, 'videoFileName' | 'thumbnailFileName' | 'failedAt'>,
  ): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const uniqueId = Math.random().toString(36).substring(2, 8);
      const baseName = `${metadata.videoType}_${timestamp}_${uniqueId}`;

      // 저장할 디렉토리 선택
      const targetDir = metadata.videoType === 'longform' ? this.longformDir : this.shortsDir;

      // 파일 확장자 추출
      const videoExt = path.extname(videoPath);
      const thumbnailExt = thumbnailPath ? path.extname(thumbnailPath) : '';

      // 새 파일명 생성
      const newVideoFileName = `${baseName}${videoExt}`;
      const newThumbnailFileName = thumbnailPath ? `${baseName}_thumbnail${thumbnailExt}` : undefined;

      // 영상 파일 복사
      const newVideoPath = path.join(targetDir, newVideoFileName);
      await fs.copy(videoPath, newVideoPath);
      this.logger.log(`Copied video to: ${newVideoPath}`);

      // 썸네일 파일 복사 (있는 경우)
      if (thumbnailPath && newThumbnailFileName) {
        const newThumbnailPath = path.join(targetDir, newThumbnailFileName);
        await fs.copy(thumbnailPath, newThumbnailPath);
        this.logger.log(`Copied thumbnail to: ${newThumbnailPath}`);
      }

      // 메타데이터 JSON 생성
      const fullMetadata: FailedUploadMetadata = {
        ...metadata,
        videoFileName: newVideoFileName,
        thumbnailFileName: newThumbnailFileName,
        failedAt: new Date().toISOString(),
      };

      const metadataPath = path.join(targetDir, `${baseName}.json`);
      await fs.writeJson(metadataPath, fullMetadata, { spaces: 2 });
      this.logger.log(`Saved metadata to: ${metadataPath}`);

      this.logger.log(
        `Successfully saved failed upload: ${metadata.videoType} - "${metadata.title}"`,
      );

      return true;
    } catch (error) {
      this.logger.error('Failed to save failed upload:', error.message);
      return false;
    }
  }

  /**
   * 저장된 모든 대기 중인 업로드 목록 조회
   *
   * @returns 롱폼과 숏츠 목록
   */
  async getPendingUploads(): Promise<{
    longform: FailedUploadMetadata[];
    shorts: FailedUploadMetadata[];
  }> {
    const longformUploads = await this.getUploadsFromDirectory(this.longformDir);
    const shortsUploads = await this.getUploadsFromDirectory(this.shortsDir);

    return {
      longform: longformUploads,
      shorts: shortsUploads,
    };
  }

  /**
   * 특정 디렉토리의 대기 중인 업로드 목록 조회
   *
   * @param directory - 조회할 디렉토리 경로
   * @returns 메타데이터 목록
   */
  private async getUploadsFromDirectory(directory: string): Promise<FailedUploadMetadata[]> {
    try {
      const files = await fs.readdir(directory);
      const jsonFiles = files.filter((file) => file.endsWith('.json'));

      const metadataList: FailedUploadMetadata[] = [];

      for (const jsonFile of jsonFiles) {
        const metadataPath = path.join(directory, jsonFile);
        const metadata = await fs.readJson(metadataPath);
        metadataList.push(metadata);
      }

      return metadataList.sort((a, b) =>
        new Date(a.failedAt).getTime() - new Date(b.failedAt).getTime()
      );
    } catch (error) {
      this.logger.error(`Failed to get uploads from ${directory}:`, error.message);
      return [];
    }
  }

  /**
   * 특정 대기 중인 업로드 삭제
   *
   * @param videoType - 영상 타입 (longform 또는 shorts)
   * @param baseName - 파일 기본 이름 (확장자 제외)
   * @returns 삭제 성공 여부
   */
  async deletePendingUpload(videoType: 'longform' | 'shorts', baseName: string): Promise<boolean> {
    try {
      const targetDir = videoType === 'longform' ? this.longformDir : this.shortsDir;

      // JSON 메타데이터 파일 삭제
      const metadataPath = path.join(targetDir, `${baseName}.json`);
      if (await fs.pathExists(metadataPath)) {
        const metadata: FailedUploadMetadata = await fs.readJson(metadataPath);

        // 영상 파일 삭제
        const videoPath = path.join(targetDir, metadata.videoFileName);
        if (await fs.pathExists(videoPath)) {
          await fs.remove(videoPath);
          this.logger.log(`Deleted video file: ${videoPath}`);
        }

        // 썸네일 파일 삭제 (있는 경우)
        if (metadata.thumbnailFileName) {
          const thumbnailPath = path.join(targetDir, metadata.thumbnailFileName);
          if (await fs.pathExists(thumbnailPath)) {
            await fs.remove(thumbnailPath);
            this.logger.log(`Deleted thumbnail file: ${thumbnailPath}`);
          }
        }

        // 메타데이터 파일 삭제
        await fs.remove(metadataPath);
        this.logger.log(`Deleted metadata file: ${metadataPath}`);

        return true;
      } else {
        this.logger.warn(`Metadata file not found: ${metadataPath}`);
        return false;
      }
    } catch (error) {
      this.logger.error('Failed to delete pending upload:', error.message);
      return false;
    }
  }

  /**
   * 대기 중인 업로드 파일 경로 가져오기
   *
   * @param videoType - 영상 타입
   * @param videoFileName - 영상 파일명
   * @returns 영상 파일 전체 경로
   */
  getVideoPath(videoType: 'longform' | 'shorts', videoFileName: string): string {
    const targetDir = videoType === 'longform' ? this.longformDir : this.shortsDir;
    return path.join(targetDir, videoFileName);
  }

  /**
   * 썸네일 파일 경로 가져오기
   *
   * @param videoType - 영상 타입
   * @param thumbnailFileName - 썸네일 파일명
   * @returns 썸네일 파일 전체 경로
   */
  getThumbnailPath(videoType: 'longform' | 'shorts', thumbnailFileName: string): string {
    const targetDir = videoType === 'longform' ? this.longformDir : this.shortsDir;
    return path.join(targetDir, thumbnailFileName);
  }

  /**
   * 대기 중인 업로드 통계 조회
   *
   * @returns 롱폼과 숏츠의 개수
   */
  async getStatistics(): Promise<{
    longformCount: number;
    shortsCount: number;
    totalCount: number;
  }> {
    const pending = await this.getPendingUploads();

    return {
      longformCount: pending.longform.length,
      shortsCount: pending.shorts.length,
      totalCount: pending.longform.length + pending.shorts.length,
    };
  }
}
