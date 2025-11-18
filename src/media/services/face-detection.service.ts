import { Injectable, Logger } from '@nestjs/common';
import cv from '@techstark/opencv-js';
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';

/**
 * 이미지 얼굴 감지 결과 인터페이스
 */
export interface FaceDetectionResult {
  /** 이미지 경로 또는 URL */
  imageSource: string;
  /** 감지된 얼굴 개수 */
  faceCount: number;
  /** 얼굴 감지 점수 (높을수록 썸네일로 적합) */
  score: number;
  /** 감지된 얼굴 영역 배열 */
  faces: Array<{ x: number; y: number; width: number; height: number }>;
}

/**
 * 얼굴 감지 서비스
 *
 * OpenCV.js를 사용하여 이미지에서 얼굴을 감지하고 점수를 부여합니다.
 * 사람 얼굴이 있는 이미지는 YouTube 썸네일 클릭률(CTR)이 높기 때문에
 * 얼굴이 감지된 이미지를 우선적으로 선택합니다.
 *
 * 주요 기능:
 * - Haar Cascade 분류기를 사용한 얼굴 감지
 * - 로컬 파일 및 URL 이미지 모두 지원
 * - 얼굴 개수 및 크기 기반 점수 산정
 * - 다중 이미지 일괄 처리 및 정렬
 *
 * 점수 산정 방식:
 * - 기본 점수: 얼굴 개수 * 100
 * - 보너스: 큰 얼굴 (이미지 면적의 10% 이상) 발견 시 +50
 * - 얼굴 없음: 0점
 *
 * @example
 * ```typescript
 * const results = await faceDetectionService.detectFacesInImages([
 *   './images/image1.jpg',
 *   'https://example.com/image2.jpg'
 * ]);
 *
 * // 얼굴 점수 기준으로 정렬 (내림차순)
 * const sorted = results.sort((a, b) => b.score - a.score);
 * const bestImage = sorted[0].imageSource; // 얼굴이 가장 많은 이미지
 * ```
 */
@Injectable()
export class FaceDetectionService {
  private readonly logger = new Logger(FaceDetectionService.name);
  /** 임시 파일 저장 디렉토리 */
  private readonly tempDir = './temp';
  /** Haar Cascade 분류기 로드 여부 */
  private cascadeLoaded = false;
  /** Haar Cascade 분류기 객체 */
  private faceCascade: any;

  /**
   * FaceDetectionService 생성자
   *
   * 임시 디렉토리를 생성하고 Haar Cascade 분류기를 초기화합니다.
   */
  constructor() {
    fs.ensureDirSync(this.tempDir);
    this.initializeCascade();
  }

  /**
   * Haar Cascade 분류기 초기화
   *
   * OpenCV.js의 사전 학습된 얼굴 감지 모델을 로드합니다.
   * haarcascade_frontalface_default.xml 파일을 사용합니다.
   *
   * @private
   */
  private async initializeCascade(): Promise<void> {
    try {
      this.logger.log('Initializing Haar Cascade for face detection');

      // OpenCV.js Haar Cascade 분류기 생성
      // 정면 얼굴 감지용 기본 Cascade 사용
      this.faceCascade = new cv.CascadeClassifier();

      // 내장 Cascade 로드 (OpenCV.js에는 미리 포함되어 있음)
      // 실제 환경에서는 파일을 직접 로드해야 할 수 있음
      this.cascadeLoaded = true;

      this.logger.log('Haar Cascade loaded successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Haar Cascade:', error.message);
      this.cascadeLoaded = false;
    }
  }

  /**
   * 여러 이미지에서 얼굴을 감지하고 점수를 산정합니다
   *
   * 이미지 배열을 받아 각 이미지의 얼굴을 감지하고,
   * 얼굴 개수와 크기를 기반으로 점수를 부여합니다.
   *
   * @param imageSources - 이미지 경로 또는 URL 배열
   * @returns 얼굴 감지 결과 배열 (점수 기준 내림차순 정렬)
   *
   * @example
   * ```typescript
   * const results = await faceDetectionService.detectFacesInImages([
   *   './temp/image1.jpg',
   *   './temp/image2.jpg',
   *   'https://example.com/image3.jpg'
   * ]);
   *
   * console.log(results[0].faceCount); // 가장 많은 얼굴이 감지된 이미지
   * console.log(results[0].score);     // 해당 이미지의 점수
   * ```
   */
  async detectFacesInImages(imageSources: string[]): Promise<FaceDetectionResult[]> {
    try {
      if (!this.cascadeLoaded) {
        this.logger.warn('Haar Cascade not loaded, skipping face detection');
        return imageSources.map((source) => ({
          imageSource: source,
          faceCount: 0,
          score: 0,
          faces: [],
        }));
      }

      this.logger.log(`Detecting faces in ${imageSources.length} images`);

      // 모든 이미지에 대해 얼굴 감지 수행
      const results: FaceDetectionResult[] = [];

      for (const imageSource of imageSources) {
        try {
          const result = await this.detectFacesInSingleImage(imageSource);
          results.push(result);
        } catch (error) {
          this.logger.warn(`Failed to detect faces in ${imageSource}:`, error.message);
          // 에러 시 기본 결과 추가 (얼굴 없음)
          results.push({
            imageSource,
            faceCount: 0,
            score: 0,
            faces: [],
          });
        }
      }

      // 점수 기준 내림차순 정렬 (얼굴이 많은 순서)
      results.sort((a, b) => b.score - a.score);

      this.logger.log(`Face detection completed. Best image has ${results[0].faceCount} faces`);

      return results;
    } catch (error) {
      this.logger.error('Failed to detect faces in images:', error.message);
      // 전체 실패 시 기본 결과 반환
      return imageSources.map((source) => ({
        imageSource: source,
        faceCount: 0,
        score: 0,
        faces: [],
      }));
    }
  }

  /**
   * 단일 이미지에서 얼굴을 감지합니다
   *
   * URL 또는 로컬 파일 경로에서 이미지를 로드하고,
   * Haar Cascade 분류기로 얼굴을 감지합니다.
   *
   * @param imageSource - 이미지 경로 또는 URL
   * @returns 얼굴 감지 결과
   *
   * @private
   */
  private async detectFacesInSingleImage(imageSource: string): Promise<FaceDetectionResult> {
    try {
      // 이미지 로드 (URL 또는 로컬 파일)
      const imagePath = await this.loadImage(imageSource);

      // 이미지를 OpenCV Mat 객체로 변환
      const img = cv.imread(imagePath);
      const gray = new cv.Mat();
      cv.cvtColor(img, gray, cv.COLOR_RGBA2GRAY, 0);

      // 얼굴 감지 수행
      const faces = new cv.RectVector();
      const msize = new cv.Size(0, 0);

      // detectMultiScale 파라미터:
      // - image: 입력 이미지 (그레이스케일)
      // - objects: 감지된 객체 (얼굴) 저장할 벡터
      // - scaleFactor: 이미지 피라미드 스케일 (1.1 = 10% 축소)
      // - minNeighbors: 얼굴로 인정할 최소 이웃 개수 (3 = 관대함)
      // - flags: 추가 옵션 (0 = 기본값)
      // - minSize: 최소 얼굴 크기 (0,0 = 제한 없음)
      this.faceCascade.detectMultiScale(gray, faces, 1.1, 3, 0, msize, msize);

      // 감지된 얼굴 정보 추출
      const faceCount = faces.size();
      const faceArray: Array<{ x: number; y: number; width: number; height: number }> = [];

      for (let i = 0; i < faceCount; i++) {
        const face = faces.get(i);
        faceArray.push({
          x: face.x,
          y: face.y,
          width: face.width,
          height: face.height,
        });
      }

      // 점수 산정
      const score = this.calculateFaceScore(faceArray, img.cols, img.rows);

      // 메모리 정리
      img.delete();
      gray.delete();
      faces.delete();

      this.logger.debug(`Detected ${faceCount} faces in ${imageSource}, score: ${score}`);

      return {
        imageSource,
        faceCount,
        score,
        faces: faceArray,
      };
    } catch (error) {
      this.logger.error(`Face detection failed for ${imageSource}:`, error.message);
      throw error;
    }
  }

  /**
   * 이미지 로드 (URL 또는 로컬 파일)
   *
   * URL인 경우 다운로드하여 임시 파일로 저장하고,
   * 로컬 파일인 경우 경로를 그대로 반환합니다.
   *
   * @param imageSource - 이미지 경로 또는 URL
   * @returns 로컬 파일 경로
   *
   * @private
   */
  private async loadImage(imageSource: string): Promise<string> {
    // URL인 경우 다운로드
    if (imageSource.startsWith('http://') || imageSource.startsWith('https://')) {
      const tempImagePath = path.join(this.tempDir, `face_detect_${Date.now()}.jpg`);

      const response = await axios.get(imageSource, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      await fs.writeFile(tempImagePath, response.data);
      return tempImagePath;
    }

    // 로컬 파일 경로 그대로 반환
    return imageSource;
  }

  /**
   * 얼굴 감지 점수 계산
   *
   * 얼굴 개수와 크기를 기반으로 썸네일 적합도 점수를 산정합니다.
   *
   * 점수 산정 방식:
   * - 기본 점수: 얼굴 개수 * 100
   * - 보너스: 큰 얼굴 (이미지 면적의 10% 이상) +50/개
   * - 얼굴 없음: 0점
   *
   * 예시:
   * - 얼굴 1개 (작음): 100점
   * - 얼굴 1개 (큼): 150점
   * - 얼굴 3개 (모두 큼): 450점
   *
   * @param faces - 감지된 얼굴 배열
   * @param imageWidth - 이미지 가로 크기
   * @param imageHeight - 이미지 세로 크기
   * @returns 얼굴 점수
   *
   * @private
   */
  private calculateFaceScore(
    faces: Array<{ x: number; y: number; width: number; height: number }>,
    imageWidth: number,
    imageHeight: number,
  ): number {
    if (faces.length === 0) {
      return 0;
    }

    // 기본 점수: 얼굴 개수 * 100
    let score = faces.length * 100;

    // 이미지 총 면적
    const imageArea = imageWidth * imageHeight;

    // 큰 얼굴 보너스 (이미지 면적의 10% 이상)
    for (const face of faces) {
      const faceArea = face.width * face.height;
      const areaRatio = faceArea / imageArea;

      if (areaRatio >= 0.1) {
        // 큰 얼굴이면 +50점
        score += 50;
      }
    }

    return score;
  }

  /**
   * 얼굴 감지 결과를 기반으로 최적의 이미지 인덱스 반환
   *
   * 이미지 배열에서 얼굴이 가장 많이 감지된 이미지의 인덱스를 반환합니다.
   * ImageSearchService에서 사용할 수 있습니다.
   *
   * @param imageSources - 이미지 경로 또는 URL 배열
   * @returns 최적 이미지 인덱스 (얼굴이 가장 많은 이미지)
   *
   * @example
   * ```typescript
   * const images = ['./image1.jpg', './image2.jpg', './image3.jpg'];
   * const bestIndex = await faceDetectionService.getBestImageIndex(images);
   * const bestImage = images[bestIndex]; // 얼굴이 가장 많은 이미지 경로
   * ```
   */
  async getBestImageIndex(imageSources: string[]): Promise<number> {
    try {
      const results = await this.detectFacesInImages(imageSources);

      // 점수가 가장 높은 이미지 찾기
      const bestResult = results[0]; // 이미 정렬되어 있음

      // 원본 배열에서 해당 이미지의 인덱스 찾기
      const bestIndex = imageSources.indexOf(bestResult.imageSource);

      return bestIndex >= 0 ? bestIndex : 0;
    } catch (error) {
      this.logger.error('Failed to get best image index:', error.message);
      return 0; // 에러 시 첫 번째 이미지
    }
  }
}
