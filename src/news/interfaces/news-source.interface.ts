/**
 * 뉴스 출처 인터페이스
 *
 * 각 언론사의 설정 정보를 정의합니다.
 */
export interface NewsSource {
  /** 언론사 ID (고유 식별자) */
  id: string;

  /** 언론사 이름 */
  name: string;

  /** 언론사 영문 이름 */
  nameEn: string;

  /** 언론사 웹사이트 URL */
  website: string;

  /** RSS 피드 URL */
  rssUrl: string;

  /** 정치 성향 (보수/중도/진보) */
  politicalStance: 'conservative' | 'moderate' | 'progressive';

  /** 언론사 타입 (종합/경제/방송) */
  type: 'general' | 'economic' | 'broadcasting' | 'agency';

  /** 활성화 여부 */
  enabled: boolean;

  /** 카테고리 지원 여부 */
  supportCategories: boolean;

  /** 지원하는 카테고리 목록 (선택사항) */
  categories?: string[];

  /** RSS 파싱 방식 (표준/커스텀) */
  parsingMethod: 'standard' | 'custom';

  /** 커스텀 파싱 함수 이름 (parsingMethod가 'custom'인 경우) */
  customParser?: string;
}

/**
 * 뉴스 소스 설정 타입
 */
export type NewsSourceConfig = Record<string, NewsSource>;
