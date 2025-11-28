/**
 * 한글 텍스트 분석 유틸리티
 *
 * 뉴스 기사에서 의미있는 한글 키워드를 추출합니다.
 * 정규식 기반으로 2-10자 길이의 한글 단어를 추출하고,
 * 불용어를 필터링하여 의미있는 명사 위주로 반환합니다.
 */
export class KoreanTextAnalyzer {
  /**
   * 불용어 리스트
   * 조사, 대명사, 일반어, 단위 등 분석에서 제외할 단어들
   */
  private static readonly STOPWORDS = new Set([
    // 조사
    '은',
    '는',
    '이',
    '가',
    '을',
    '를',
    '의',
    '에',
    '에서',
    '로',
    '으로',
    '와',
    '과',
    '도',
    '만',
    '까지',
    '부터',
    '에게',
    '한테',
    '께',
    '보다',
    '처럼',
    '같이',

    // 대명사
    '이것',
    '그것',
    '저것',
    '여기',
    '거기',
    '저기',
    '우리',
    '그들',
    '자신',
    '이곳',
    '그곳',
    '저곳',

    // 일반 명사 (의미 없는)
    '것',
    '등',
    '및',
    '또한',
    '또',
    '그리고',
    '하지만',
    '그러나',
    '따라서',
    '매우',
    '많이',
    '아주',
    '정말',
    '진짜',
    '너무',
    '약',
    '대략',

    // 단위
    '개',
    '명',
    '건',
    '회',
    '번',
    '차',
    '점',
    '곳',
    '군데',
    '가지',

    // 시간 관련 (일반적)
    '때',
    '경우',
    '시',
    '분',
    '초',

    // 동사/형용사 어간 (자주 등장)
    '하다',
    '되다',
    '있다',
    '없다',
    '이다',
    '아니다',
    '같다',
    '다르다',
    '크다',
    '작다',

    // 접속어/부사
    '그래서',
    '그런데',
    '그리고',
    '하지만',
    '그러나',
    '또는',
    '혹은',
    '만약',
    '왜냐하면',

    // 기타
    '통해',
    '위해',
    '대해',
    '관해',
    '따르면',
    '의하면',
    '이번',
    '지난',
    '다음',
    '올해',
    '작년',
    '내년',
  ]);

  /**
   * 텍스트에서 한글 키워드 추출
   *
   * @param text - 분석할 텍스트 (뉴스 본문)
   * @returns 추출된 키워드 배열 (빈도순 정렬)
   */
  static extractKeywords(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    // 1. 한글 단어 추출 (2-10자)
    // [\u3131-\u3163\uAC00-\uD7A3] = 한글 자모 + 완성형 한글
    const koreanWordRegex = /[\uAC00-\uD7A3]{2,10}/g;
    const words = text.match(koreanWordRegex) || [];

    // 2. 단어 빈도수 계산
    const wordCount = new Map<string, number>();
    for (const word of words) {
      // 불용어 필터링
      if (this.STOPWORDS.has(word)) {
        continue;
      }

      // 숫자가 포함된 단어 제외 (예: 제1야당)
      if (/\d/.test(word)) {
        continue;
      }

      // 특수문자 제거 후 체크
      const cleaned = word.trim();
      if (cleaned.length < 2) {
        continue;
      }

      wordCount.set(cleaned, (wordCount.get(cleaned) || 0) + 1);
    }

    // 3. 빈도수 기준 정렬
    const sortedWords = Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1]) // 빈도수 내림차순
      .map(([word]) => word);

    return sortedWords;
  }

  /**
   * 키워드 정규화
   * 유사한 단어를 하나로 통합 (선택적 기능)
   *
   * @param keywords - 정규화할 키워드 배열
   * @returns 정규화된 키워드 배열
   */
  static normalizeKeywords(keywords: string[]): string[] {
    // 현재는 단순 반환, 추후 확장 가능
    // 예: "국회의원" vs "국회" 통합 로직
    return keywords;
  }

  /**
   * 키워드 유사도 체크
   * 두 키워드가 유사한지 판단 (포함 관계)
   *
   * @param keyword1 - 첫 번째 키워드
   * @param keyword2 - 두 번째 키워드
   * @returns 유사 여부
   */
  static isSimilar(keyword1: string, keyword2: string): boolean {
    if (keyword1 === keyword2) {
      return true;
    }

    // 한 단어가 다른 단어를 포함하는 경우
    if (keyword1.includes(keyword2) || keyword2.includes(keyword1)) {
      return true;
    }

    return false;
  }

  /**
   * 불용어 추가
   * 커스텀 불용어를 추가할 수 있습니다.
   *
   * @param words - 추가할 불용어 배열
   */
  static addStopwords(words: string[]): void {
    words.forEach((word) => this.STOPWORDS.add(word));
  }

  /**
   * 현재 불용어 목록 조회
   *
   * @returns 불용어 배열
   */
  static getStopwords(): string[] {
    return Array.from(this.STOPWORDS);
  }
}
