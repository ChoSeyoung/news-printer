/**
 * 뉴스 출처 정보
 */
export interface NewsSourceInfo {
  /** 언론사 ID */
  id: string;
  /** 언론사 이름 */
  name: string;
  /** 정치 성향 */
  politicalStance: 'conservative' | 'moderate' | 'progressive';
  /** 언론사 타입 */
  type: 'general' | 'economic' | 'broadcasting' | 'agency';
}

/**
 * 뉴스 아이템 DTO
 */
export class NewsItemDto {
  /** 뉴스 제목 */
  title: string;

  /** 뉴스 링크 */
  link: string;

  /** 뉴스 요약 */
  description: string;

  /** 발행 날짜 (KST) */
  pubDate: string;

  /** 뉴스 카테고리 */
  category: string;

  /** 고유 식별자 */
  guid: string;

  /** 뉴스 출처 정보 */
  source: NewsSourceInfo;

  /** 전체 기사 내용 (웹 스크래핑) */
  fullContent?: string;

  /** 앵커 대본 (AI 생성) */
  anchor?: string;

  /** 리포터 대본 (AI 생성) */
  reporter?: string;

  /** 이미지 URL 배열 (기사에서 추출) */
  imageUrls?: string[];
}
