import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * 비디오 길이 확인 유틸리티
 *
 * ffprobe를 사용하여 비디오 파일의 길이를 확인합니다.
 */
export class VideoDurationUtil {
  /**
   * 비디오 파일의 길이(초)를 가져옵니다.
   *
   * @param videoPath - 비디오 파일 경로
   * @returns 비디오 길이(초)
   * @throws ffprobe 실행 실패 시 에러
   */
  static async getVideoDuration(videoPath: string): Promise<number> {
    try {
      // ffprobe로 비디오 길이 확인
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      );

      const duration = parseFloat(stdout.trim());

      if (isNaN(duration)) {
        throw new Error('Failed to parse video duration');
      }

      return duration;
    } catch (error) {
      throw new Error(`Failed to get video duration: ${error.message}`);
    }
  }

  /**
   * 비디오가 YouTube Shorts 규정(59초 이하)을 만족하는지 확인합니다.
   *
   * @param videoPath - 비디오 파일 경로
   * @returns Shorts 업로드 가능 여부
   */
  static async isValidForShorts(videoPath: string): Promise<boolean> {
    const duration = await this.getVideoDuration(videoPath);
    return duration <= 59;
  }
}
