import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import { NewsItemDto, NewsSourceInfo } from './dto/news-item.dto';
import { RssFeed, RssItem } from './interfaces/rss-feed.interface';
import { ArticleScraperService } from './services/article-scraper.service';
import { GeminiService } from './services/gemini.service';
import { getEnabledNewsSources, getCategorySupportingSources, getCategoryRssUrl } from './config/news-sources.config';

/**
 * 뉴스 서비스
 *
 * 다중 언론사 RSS 피드에서 뉴스를 가져오고, 필요시 전체 기사 내용과 AI 스크립트를 생성합니다.
 *
 * 지원 언론사 (균형 구성):
 * 1. 조선일보 - 보수 성향, 종합 일간지
 * 2. 연합뉴스 - 중도 성향, 통신사 (속보성)
 * 3. 한겨레 - 진보 성향, 종합 일간지
 * 4. 한국경제 - 경제 전문지
 *
 * 주요 기능:
 * - 다중 언론사 RSS 피드 파싱 및 통합
 * - 중복 뉴스 제거 (제목 유사도 기반)
 * - 전체 기사 내용 스크래핑
 * - Gemini AI를 통한 앵커/리포터 스크립트 생성
 * - KST 시간대 처리 및 오늘 날짜 필터링
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  /** HTTP 요청 타임아웃 (밀리초) */
  private readonly timeout = 10000;

  constructor(
    private readonly articleScraper: ArticleScraperService,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * 다중 언론사 RSS 피드에서 뉴스를 가져옵니다
   *
   * @param category - 뉴스 카테고리 (politics, economy, society 등)
   * @param limit - 가져올 뉴스 개수 (기본값: 10)
   * @param includeFullContent - 전체 기사 내용 및 AI 스크립트 포함 여부 (기본값: false)
   * @returns 뉴스 아이템 배열 (중복 제거 및 정렬됨)
   *
   * 처리 과정:
   * 1. 모든 활성화된 언론사에서 RSS 피드 가져오기 (병렬)
   * 2. 뉴스 아이템 추출 및 오늘 날짜 필터링
   * 3. 중복 제거 (제목 유사도 기반)
   * 4. 발행 시간순 정렬 (최신순)
   * 5. includeFullContent가 true인 경우:
   *    - 기사 전체 내용 스크래핑
   *    - Gemini AI로 앵커/리포터 스크립트 생성
   */
  async fetchNews(
    category: string = 'politics',
    limit: number = 10,
    includeFullContent: boolean = false,
  ): Promise<NewsItemDto[]> {
    this.logger.log(`Fetching news from multiple sources (category: ${category}, limit: ${limit})`);

    try {
      // 활성화된 모든 언론사에서 뉴스 가져오기 (병렬)
      const newsSources = getEnabledNewsSources();
      const newsPromises = newsSources.map((source) =>
        this.fetchNewsFromSource(source.id, category).catch((error) => {
          this.logger.warn(`Failed to fetch news from ${source.name}: ${error.message}`);
          return []; // 실패한 언론사는 빈 배열 반환
        })
      );

      const newsArrays = await Promise.all(newsPromises);

      // 모든 뉴스를 하나의 배열로 합치기
      const allNews = newsArrays.flat();

      this.logger.log(`Fetched ${allNews.length} news items from ${newsSources.length} sources`);

      // 중복 제거
      const uniqueNews = this.removeDuplicates(allNews);
      this.logger.log(`After removing duplicates: ${uniqueNews.length} unique news items`);

      // 발행 시간순 정렬 (최신순)
      uniqueNews.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

      // 요청한 개수만큼만 반환
      const limitedItems = uniqueNews.slice(0, limit);

      // 전체 기사 내용 및 AI 스크립트 생성 (선택적)
      if (includeFullContent) {
        this.logger.log(`Fetching full content for ${limitedItems.length} articles`);

        // 병렬로 기사 전체 내용 가져오기
        const articleDataList = await this.articleScraper.fetchMultipleArticles(
          limitedItems.map((item) => item.link),
        );

        // 각 기사에 대해 AI 스크립트 생성
        for (let i = 0; i < limitedItems.length; i++) {
          const item = limitedItems[i];
          const articleData = articleDataList[i];

          // 전체 기사 내용 및 이미지 URL 설정
          item.fullContent = articleData.content;
          item.imageUrls = articleData.imageUrls;

          // 내용이 있는 경우에만 AI 스크립트 생성
          if (articleData.content && articleData.content.length > 0) {
            this.logger.debug(`Generating scripts for article: ${item.title}`);
            const scripts = await this.geminiService.generateScripts(articleData.content);
            item.anchor = scripts.anchor;
            item.reporter = scripts.reporter;
          }
        }
      }

      return limitedItems;
    } catch (error) {
      this.logger.error('Failed to fetch news from multiple sources:', error);
      throw new HttpException(
        'Failed to fetch news',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 특정 언론사에서 뉴스를 가져옵니다
   *
   * @param sourceId - 언론사 ID (chosun, yonhap, hani, kbs, hankyung)
   * @param category - 뉴스 카테고리
   * @returns 뉴스 아이템 배열
   *
   * @private
   */
  private async fetchNewsFromSource(
    sourceId: string,
    category: string,
  ): Promise<NewsItemDto[]> {
    const source = getEnabledNewsSources().find((s) => s.id === sourceId);

    if (!source) {
      throw new Error(`News source not found: ${sourceId}`);
    }

    // RSS URL 생성 (카테고리별 URL 지원)
    const rssUrl = getCategoryRssUrl(sourceId, category);

    this.logger.debug(`Fetching RSS from ${source.name}: ${rssUrl}`);

    try {
      // RSS 피드 다운로드
      const response = await axios.get(rssUrl, {
        timeout: this.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
        },
      });

      // XML을 JSON으로 파싱
      const parsedData = await this.parseXmlToJson(response.data);

      // 뉴스 아이템 추출
      const newsItems = this.extractNewsItems(parsedData, source, category);

      this.logger.debug(`Fetched ${newsItems.length} items from ${source.name}`);

      return newsItems;
    } catch (error) {
      this.logger.error(`Failed to fetch from ${source.name}:`, error.message);
      throw error;
    }
  }

  /**
   * XML 데이터를 JSON 객체로 파싱합니다
   *
   * @param xmlData - XML 문자열
   * @returns RSS 피드 JSON 객체
   * @throws HttpException - 파싱 실패 시
   */
  private async parseXmlToJson(xmlData: string): Promise<RssFeed> {
    try {
      const result = await parseStringPromise(xmlData, {
        explicitArray: false, // 단일 요소도 배열로 만들지 않음
        mergeAttrs: true,     // 속성을 객체에 병합
        trim: true,           // 공백 제거
      });

      // RSS 피드 구조 검증
      if (!result || !result.rss || !result.rss.channel) {
        throw new Error('Invalid RSS feed structure');
      }

      return result;
    } catch (error) {
      this.logger.error('XML parsing failed', error);
      throw new HttpException(
        'Failed to parse RSS feed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * RSS 피드에서 뉴스 아이템을 추출하고 필터링합니다
   *
   * @param rssFeed - 파싱된 RSS 피드 객체
   * @param source - 언론사 정보
   * @param category - 뉴스 카테고리
   * @returns 필터링된 뉴스 아이템 배열
   *
   * 필터링 규칙:
   * - title과 link가 있는 아이템만 포함
   * - 오늘(KST 기준) 발행된 뉴스만 포함
   */
  private extractNewsItems(
    rssFeed: RssFeed,
    source: any,
    category: string,
  ): NewsItemDto[] {
    try {
      const channel = rssFeed.rss.channel;

      // item이 배열인지 단일 객체인지 확인
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];

      if (!items || items.length === 0) {
        this.logger.warn(`No items found in RSS feed from ${source.name}`);
        return [];
      }

      // 오늘 날짜 (KST 기준) 가져오기
      const todayKST = this.getTodayKST();

      return items
        .filter((item) => item && item.title && item.link) // 필수 필드 검증
        .filter((item) => !this.isBreakingNewsDuplicate(item.title)) // 속보/x보 제목 제외
        .map((item: RssItem) => this.mapToNewsItemDto(item, source, category)) // DTO 변환
        .filter((newsItem) => this.isTodayKST(newsItem.pubDate, todayKST)); // 오늘 날짜 필터링
    } catch (error) {
      this.logger.error(`Failed to extract news items from ${source.name}`, error);
      return [];
    }
  }

  /**
   * RSS 아이템을 NewsItemDto로 변환합니다
   *
   * @param item - RSS 아이템
   * @param source - 언론사 정보
   * @param category - 뉴스 카테고리
   * @returns NewsItemDto 객체
   */
  private mapToNewsItemDto(item: RssItem, source: any, category: string): NewsItemDto {
    // UTC를 KST로 변환
    const pubDateKST = this.convertUTCtoKST(item.pubDate);

    // 언론사 정보 생성
    const sourceInfo: NewsSourceInfo = {
      id: source.id,
      name: source.name,
      politicalStance: source.politicalStance,
      type: source.type,
    };

    return {
      title: this.cleanText(item.title),
      link: item.link,
      description: item.description ? this.cleanText(item.description) : '',
      pubDate: pubDateKST,
      category: category,
      guid: item.guid || item.link,
      source: sourceInfo,
    };
  }

  /**
   * 중복 뉴스를 제거합니다
   *
   * 제목 유사도를 기반으로 중복을 판단합니다.
   * 같은 뉴스를 여러 언론사에서 다룰 경우, 첫 번째 것만 유지합니다.
   *
   * @param newsItems - 뉴스 아이템 배열
   * @returns 중복 제거된 뉴스 아이템 배열
   *
   * @private
   */
  private removeDuplicates(newsItems: NewsItemDto[]): NewsItemDto[] {
    const uniqueNews: NewsItemDto[] = [];
    const seenTitles = new Set<string>();

    for (const item of newsItems) {
      // 제목 정규화 (공백 제거, 소문자 변환)
      const normalizedTitle = item.title
        .replace(/\s+/g, '')
        .toLowerCase()
        .substring(0, 30); // 처음 30자만 비교

      // 이미 본 제목이 아니면 추가
      if (!seenTitles.has(normalizedTitle)) {
        seenTitles.add(normalizedTitle);
        uniqueNews.push(item);
      } else {
        this.logger.debug(`Duplicate news removed: ${item.title} (${item.source.name})`);
      }
    }

    return uniqueNews;
  }

  /**
   * UTC 날짜 문자열을 KST(한국 표준시, UTC+9)로 변환합니다
   *
   * @param utcDateString - UTC 날짜 문자열
   * @returns KST 기준 ISO 날짜 문자열
   */
  private convertUTCtoKST(utcDateString?: string): string {
    try {
      const date = utcDateString ? new Date(utcDateString) : new Date();

      // KST는 UTC+9 (9시간 추가)
      const kstOffset = 9 * 60; // 9시간을 분 단위로 변환
      const utcTime = date.getTime();
      const kstTime = new Date(utcTime + kstOffset * 60 * 1000);

      return kstTime.toISOString();
    } catch (error) {
      this.logger.warn(`Failed to parse date: ${utcDateString}, using current time`);
      // 파싱 실패 시 현재 시간 사용
      const now = new Date();
      const kstOffset = 9 * 60;
      const kstTime = new Date(now.getTime() + kstOffset * 60 * 1000);
      return kstTime.toISOString();
    }
  }

  /**
   * KST 기준 오늘 날짜(자정)를 가져옵니다
   *
   * @returns KST 기준 오늘 00:00:00 Date 객체
   */
  private getTodayKST(): Date {
    const now = new Date();
    const kstOffset = 9 * 60; // 9시간을 분 단위로 변환
    const kstNow = new Date(now.getTime() + kstOffset * 60 * 1000);

    // KST 기준 오늘 자정
    const year = kstNow.getUTCFullYear();
    const month = kstNow.getUTCMonth();
    const day = kstNow.getUTCDate();

    // UTC로 다시 변환 (-9시간)
    return new Date(Date.UTC(year, month, day, -9, 0, 0, 0));
  }

  /**
   * 주어진 날짜가 KST 기준 오늘인지 확인합니다
   *
   * @param dateString - ISO 날짜 문자열
   * @param todayKST - KST 기준 오늘 자정
   * @returns 오늘이면 true, 아니면 false
   */
  private isTodayKST(dateString: string, todayKST: Date): boolean {
    try {
      const date = new Date(dateString);
      const dateKST = new Date(date.getTime());

      // 내일 자정 계산
      const tomorrowKST = new Date(todayKST.getTime() + 24 * 60 * 60 * 1000);

      // 오늘 자정 <= 날짜 < 내일 자정
      return dateKST >= todayKST && dateKST < tomorrowKST;
    } catch (error) {
      this.logger.warn(`Failed to check date: ${dateString}`);
      return false;
    }
  }

  /**
   * 텍스트에서 HTML 태그 및 엔티티를 제거합니다
   *
   * @param text - 정리할 텍스트
   * @returns 정리된 텍스트
   *
   * 제거 항목:
   * - HTML 태그 (<tag>)
   * - HTML 엔티티 (&nbsp;, &amp;, &lt;, &gt;, &quot;, &#39;, &apos;)
   * - 앞뒤 공백
   */
  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')      // HTML 태그 제거
      .replace(/&nbsp;/g, ' ')      // 공백 엔티티 변환
      .replace(/&amp;/g, '&')       // & 엔티티 변환
      .replace(/&lt;/g, '<')        // < 엔티티 변환
      .replace(/&gt;/g, '>')        // > 엔티티 변환
      .replace(/&quot;/g, '"')      // " 엔티티 변환
      .replace(/&#39;/g, "'")       // ' 숫자 엔티티 변환
      .replace(/&apos;/g, "'")      // ' 엔티티 변환
      .replace(/&#x27;/g, "'")      // ' 16진수 엔티티 변환
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec)) // 기타 숫자 엔티티
      .trim();                       // 앞뒤 공백 제거
  }

  /**
   * 속보/x보 제목인지 확인합니다
   *
   * @param title - 뉴스 제목
   * @returns 속보/x보 제목이면 true
   *
   * 필터링 패턴:
   * - "속보", "긴급", "단독" 등의 접두사
   * - "1보", "2보", "3보", "4보", ... "n보" 형식
   * - "[속보]", "[단독]", "[긴급]" 등의 대괄호 형식
   */
  private isBreakingNewsDuplicate(title: string): boolean {
    // 속보/x보 패턴 매칭
    const breakingNewsPattern = /(\[?속보\]?|\[?긴급\]?|\[?단독\]?|[0-9]+보)/;
    const hasPattern = breakingNewsPattern.test(title);

    if (hasPattern) {
      this.logger.debug(`Breaking news title filtered: ${title}`);
    }

    return hasPattern;
  }
}
