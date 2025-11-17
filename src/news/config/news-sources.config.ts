import { NewsSourceConfig } from '../interfaces/news-source.interface';

/**
 * 뉴스 출처 설정
 *
 * 균형 구성 (5개 언론사):
 * 1. 조선일보 - 보수 성향, 종합 일간지
 * 2. 연합뉴스 - 중도 성향, 통신사 (속보성 강함)
 * 3. 한겨레 - 진보 성향, 종합 일간지
 * 4. KBS 뉴스 - 중립 성향, 공영방송
 * 5. 한국경제 - 경제 전문지
 */
export const NEWS_SOURCES: NewsSourceConfig = {
  /**
   * 조선일보 - 보수 성향 종합 일간지
   */
  chosun: {
    id: 'chosun',
    name: '조선일보',
    nameEn: 'Chosun Ilbo',
    website: 'https://www.chosun.com',
    rssUrl: 'https://www.chosun.com/arc/outboundfeeds/rss/category',
    politicalStance: 'conservative',
    type: 'general',
    enabled: true,
    supportCategories: true,
    categories: ['politics', 'economy', 'society', 'international', 'culture', 'sports', 'science', 'opinion'],
    parsingMethod: 'custom',
    customParser: 'parseChosunRss',
  },

  /**
   * 연합뉴스 - 중도 성향 통신사 (속보성)
   */
  yonhap: {
    id: 'yonhap',
    name: '연합뉴스',
    nameEn: 'Yonhap News',
    website: 'https://www.yna.co.kr',
    rssUrl: 'https://www.yna.co.kr/rss/news.xml',
    politicalStance: 'moderate',
    type: 'agency',
    enabled: true,
    supportCategories: false,
    parsingMethod: 'standard',
  },

  /**
   * 한겨레 - 진보 성향 종합 일간지
   */
  hani: {
    id: 'hani',
    name: '한겨레',
    nameEn: 'The Hankyoreh',
    website: 'https://www.hani.co.kr',
    rssUrl: 'https://www.hani.co.kr/rss/',
    politicalStance: 'progressive',
    type: 'general',
    enabled: true,
    supportCategories: false,
    parsingMethod: 'standard',
  },

  /**
   * KBS 뉴스 - 중립 성향 공영방송
   */
  kbs: {
    id: 'kbs',
    name: 'KBS 뉴스',
    nameEn: 'KBS News',
    website: 'https://news.kbs.co.kr',
    rssUrl: 'https://news.kbs.co.kr/rss/headline.xml',
    politicalStance: 'moderate',
    type: 'broadcasting',
    enabled: true,
    supportCategories: false,
    parsingMethod: 'standard',
  },

  /**
   * 한국경제 - 경제 전문지
   */
  hankyung: {
    id: 'hankyung',
    name: '한국경제',
    nameEn: 'Korea Economic Daily',
    website: 'https://www.hankyung.com',
    rssUrl: 'https://www.hankyung.com/feed',
    politicalStance: 'moderate',
    type: 'economic',
    enabled: true,
    supportCategories: false,
    parsingMethod: 'standard',
  },
};

/**
 * 활성화된 뉴스 출처 목록 가져오기
 */
export function getEnabledNewsSources() {
  return Object.values(NEWS_SOURCES).filter((source) => source.enabled);
}

/**
 * 특정 언론사 설정 가져오기
 */
export function getNewsSource(sourceId: string) {
  return NEWS_SOURCES[sourceId];
}

/**
 * 카테고리를 지원하는 언론사 목록 가져오기
 */
export function getCategorySupportingSources() {
  return Object.values(NEWS_SOURCES).filter(
    (source) => source.enabled && source.supportCategories,
  );
}
