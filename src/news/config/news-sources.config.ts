import { NewsSourceConfig } from '../interfaces/news-source.interface';

/**
 * 뉴스 출처 설정
 *
 * 균형 구성 (7개 언론사):
 * 1. 조선일보 - 보수 성향, 종합 일간지
 * 2. 동아일보 - 보수 성향, 종합 일간지
 * 3. 연합뉴스 - 중도 성향, 통신사 (속보성 강함)
 * 4. 뉴시스 - 중도 성향, 통신사 (속보성 강함)
 * 5. SBS 뉴스 - 중도 성향, 방송사
 * 6. 한겨레 - 진보 성향, 종합 일간지
 * 7. 한국경제 - 경제 전문지
 */
export const NEWS_SOURCES: NewsSourceConfig = {
  /**
   * 조선일보 - 보수 성향 종합 일간지
   * 기본 URL을 정치 RSS로 설정 (정치 전문 채널)
   */
  chosun: {
    id: 'chosun',
    name: '조선일보',
    nameEn: 'Chosun Ilbo',
    website: 'https://www.chosun.com',
    rssUrl: 'https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml', // 기본을 정치로 변경
    politicalStance: 'conservative',
    type: 'general',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'https://www.chosun.com/arc/outboundfeeds/rss/category/politics/?outputType=xml',
    },
  },

  /**
   * 연합뉴스 - 중도 성향 통신사 (속보성)
   * 기본 URL을 정치 RSS로 설정 (정치 전문 채널)
   */
  yonhap: {
    id: 'yonhap',
    name: '연합뉴스',
    nameEn: 'Yonhap News',
    website: 'https://www.yna.co.kr',
    rssUrl: 'https://www.yna.co.kr/rss/politics.xml', // 기본을 정치로 변경
    politicalStance: 'moderate',
    type: 'agency',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'https://www.yna.co.kr/rss/politics.xml',
    },
  },

  /**
   * 동아일보 - 보수 성향 종합 일간지
   * 기본 URL을 정치 RSS로 설정 (정치 전문 채널)
   */
  donga: {
    id: 'donga',
    name: '동아일보',
    nameEn: 'Dong-A Ilbo',
    website: 'https://www.donga.com',
    rssUrl: 'http://rss.donga.com/politics.xml', // 기본을 정치로 변경
    politicalStance: 'conservative',
    type: 'general',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'http://rss.donga.com/politics.xml',
    },
  },

  /**
   * 한겨레 - 진보 성향 종합 일간지
   * 기본 URL을 정치 RSS로 설정 (정치 전문 채널)
   */
  hani: {
    id: 'hani',
    name: '한겨레',
    nameEn: 'The Hankyoreh',
    website: 'https://www.hani.co.kr',
    rssUrl: 'https://www.hani.co.kr/rss/politics/', // 기본을 정치로 변경
    politicalStance: 'progressive',
    type: 'general',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'https://www.hani.co.kr/rss/politics/',
    },
  },

  /**
   * 뉴시스 - 중도 성향 통신사
   * 기본 URL을 정치 RSS로 설정 (정치 전문 채널)
   */
  newsis: {
    id: 'newsis',
    name: '뉴시스',
    nameEn: 'Newsis',
    website: 'https://www.newsis.com',
    rssUrl: 'https://www.newsis.com/RSS/politics.xml', // 기본을 정치로 변경
    politicalStance: 'moderate',
    type: 'agency',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'https://www.newsis.com/RSS/politics.xml',
    },
  },

  /**
   * SBS 뉴스 - 중도 성향 방송사
   * 기본 URL을 정치 RSS로 설정 (정치 섹션)
   */
  sbs: {
    id: 'sbs',
    name: 'SBS 뉴스',
    nameEn: 'SBS News',
    website: 'https://news.sbs.co.kr',
    rssUrl: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01', // 정치 섹션
    politicalStance: 'moderate',
    type: 'broadcasting',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'https://news.sbs.co.kr/news/SectionRssFeed.do?sectionId=01',
    },
  },

  /**
   * 한국경제 - 경제 전문지
   * 기본 URL을 정치 RSS로 설정 (정치 전문 채널)
   */
  hankyung: {
    id: 'hankyung',
    name: '한국경제',
    nameEn: 'Korea Economic Daily',
    website: 'https://www.hankyung.com',
    rssUrl: 'https://www.hankyung.com/feed/politics', // 기본을 정치로 변경
    politicalStance: 'moderate',
    type: 'economic',
    enabled: true,
    supportCategories: true,
    parsingMethod: 'standard',
    categoryRssUrls: {
      politics: 'https://www.hankyung.com/feed/politics',
    },
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

/**
 * 특정 카테고리의 RSS URL 가져오기
 * @param sourceId - 언론사 ID
 * @param category - 카테고리 (politics, economy, society, etc.)
 * @returns 카테고리별 RSS URL 또는 기본 RSS URL
 */
export function getCategoryRssUrl(sourceId: string, category: string): string {
  const source = NEWS_SOURCES[sourceId];
  if (!source) return '';

  // 'all' 카테고리이거나 카테고리별 URL이 없으면 기본 URL 반환
  if (category === 'all' || !source.categoryRssUrls || !source.categoryRssUrls[category]) {
    return source.rssUrl;
  }

  return source.categoryRssUrls[category];
}
