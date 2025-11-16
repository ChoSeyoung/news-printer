import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { parseStringPromise } from 'xml2js';
import { NewsItemDto } from './dto/news-item.dto';
import { RssFeed, RssItem } from './interfaces/rss-feed.interface';
import { ArticleScraperService } from './services/article-scraper.service';
import { GeminiService } from './services/gemini.service';

/**
 * 뉴스 서비스
 *
 * 조선일보 RSS 피드에서 뉴스를 가져오고, 필요시 전체 기사 내용과 AI 스크립트를 생성합니다.
 *
 * 주요 기능:
 * - RSS 피드 파싱 및 뉴스 아이템 추출
 * - 전체 기사 내용 스크래핑
 * - Gemini AI를 통한 앵커/리포터 스크립트 생성
 * - KST 시간대 처리 및 오늘 날짜 필터링
 */
@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);

  /** 조선일보 RSS 피드 기본 URL */
  private readonly baseUrl = 'https://www.chosun.com/arc/outboundfeeds/rss/category';

  /** HTTP 요청 타임아웃 (밀리초) */
  private readonly timeout = 10000;

  constructor(
    private readonly articleScraper: ArticleScraperService,
    private readonly geminiService: GeminiService,
  ) {}

  /**
   * RSS 피드에서 뉴스를 가져옵니다
   *
   * @param category - 뉴스 카테고리 (politics, economy, society 등)
   * @param limit - 가져올 뉴스 개수 (기본값: 10)
   * @param includeFullContent - 전체 기사 내용 및 AI 스크립트 포함 여부 (기본값: false)
   * @returns 뉴스 아이템 배열
   *
   * 처리 과정:
   * 1. RSS 피드 URL 생성 및 HTTP 요청
   * 2. XML 데이터를 JSON으로 파싱
   * 3. 뉴스 아이템 추출 및 오늘 날짜 필터링
   * 4. includeFullContent가 true인 경우:
   *    - 기사 전체 내용 스크래핑
   *    - Gemini AI로 앵커/리포터 스크립트 생성
   */
  async fetchNews(
    category: string = 'politics',
    limit: number = 10,
    includeFullContent: boolean = false,
  ): Promise<NewsItemDto[]> {
    const rssUrl = `${this.baseUrl}/${category}/?outputType=xml`;

    this.logger.log(`Fetching RSS feed from: ${rssUrl}`);

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

      // 뉴스 아이템 추출 (오늘 날짜 필터링 포함)
      const newsItems = this.extractNewsItems(parsedData, category);

      // 요청한 개수만큼만 반환
      const limitedItems = newsItems.slice(0, limit);

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
      this.handleError(error, rssUrl);
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
   * @param category - 뉴스 카테고리
   * @returns 필터링된 뉴스 아이템 배열
   *
   * 필터링 규칙:
   * - title과 link가 있는 아이템만 포함
   * - 오늘(KST 기준) 발행된 뉴스만 포함
   */
  private extractNewsItems(rssFeed: RssFeed, category: string): NewsItemDto[] {
    try {
      const channel = rssFeed.rss.channel;

      // item이 배열인지 단일 객체인지 확인 (RSS 피드 구조에 따라 다름)
      const items = Array.isArray(channel.item) ? channel.item : [channel.item];

      if (!items || items.length === 0) {
        this.logger.warn('No items found in RSS feed');
        return [];
      }

      // 오늘 날짜 (KST 기준) 가져오기
      const todayKST = this.getTodayKST();

      return items
        .filter((item) => item && item.title && item.link) // 필수 필드 검증
        .map((item: RssItem) => this.mapToNewsItemDto(item, category)) // DTO 변환
        .filter((newsItem) => this.isTodayKST(newsItem.pubDate, todayKST)); // 오늘 날짜 필터링
    } catch (error) {
      this.logger.error('Failed to extract news items', error);
      throw new HttpException(
        'Failed to extract news items',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * RSS 아이템을 NewsItemDto로 변환합니다
   *
   * @param item - RSS 아이템
   * @param category - 뉴스 카테고리
   * @returns NewsItemDto 객체
   */
  private mapToNewsItemDto(item: RssItem, category: string): NewsItemDto {
    // UTC를 KST로 변환
    const pubDateKST = this.convertUTCtoKST(item.pubDate);

    return {
      title: this.cleanText(item.title),
      link: item.link,
      description: item.description ? this.cleanText(item.description) : '',
      pubDate: pubDateKST,
      category: category,
      guid: item.guid || item.link,
    };
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
      const kstOffset = 9 * 60;
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
   * - HTML 엔티티 (&nbsp;, &amp;, &lt;, &gt;, &quot;)
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
      .trim();                       // 앞뒤 공백 제거
  }

  /**
   * HTTP 요청 에러를 처리하고 적절한 예외를 발생시킵니다
   *
   * @param error - 에러 객체
   * @param url - 요청 URL
   * @throws HttpException - 에러 유형에 따른 적절한 HTTP 예외
   *
   * 에러 유형별 처리:
   * - ECONNABORTED: 요청 타임아웃 (408)
   * - HTTP 응답 에러: Bad Gateway (502)
   * - 네트워크 에러: Service Unavailable (503)
   * - 기타: Internal Server Error (500)
   */
  private handleError(error: unknown, url: string): never {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;

      // 타임아웃 에러
      if (axiosError.code === 'ECONNABORTED') {
        this.logger.error(`Request timeout for URL: ${url}`);
        throw new HttpException(
          'Request timeout - RSS feed took too long to respond',
          HttpStatus.REQUEST_TIMEOUT,
        );
      }

      // HTTP 응답 에러 (서버가 응답했지만 에러 상태 코드 반환)
      if (axiosError.response) {
        this.logger.error(
          `HTTP error ${axiosError.response.status} for URL: ${url}`,
        );
        throw new HttpException(
          `RSS feed returned error: ${axiosError.response.status}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      // 네트워크 에러 (요청이 전송되지 않음)
      if (axiosError.request) {
        this.logger.error(`Network error for URL: ${url}`);
        throw new HttpException(
          'Network error - could not reach RSS feed',
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
    }

    // 기타 예상치 못한 에러
    this.logger.error(`Unexpected error fetching RSS: ${error}`);
    throw new HttpException(
      'Failed to fetch news',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
