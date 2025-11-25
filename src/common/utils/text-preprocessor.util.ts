/**
 * 텍스트 전처리 유틸리티
 *
 * YouTube 업로드 직전에 제목과 설명을 전처리합니다.
 */
export class TextPreprocessor {
  /**
   * 텍스트 전처리: 정치 관련 한자 및 이니셜을 한글로 치환
   *
   * @param text - 원본 텍스트
   * @returns 치환된 텍스트
   *
   * 치환 규칙:
   * [현직 대통령]
   * - "李" → "이재명"
   * - "尹" → "윤석열"
   *
   * [전직 대통령 - 한자]
   * - "盧" → "노무현"
   *
   * [전직 대통령 - 영문 이니셜]
   * - "YS" → "김영삼"
   * - "DJ" → "김대중"
   * - "MB" → "이명박"
   * - "MH" → "노무현"
   *
   * [유력 정치인]
   * - "JP" → "김종필"
   *
   * [정치 용어 한자]
   * - "與" → "여당"
   * - "野" → "야당"
   * - "靑" → "청와대"
   * - "檢" → "검찰"
   * - "黨" → "당"
   * - "親" → "친"
   * - "非" → "비"
   * - "發" → "발"
   * - "號" → "호"
   */
  static preprocessText(text: string): string {
    return text
      // 현직 대통령 이름 치환 (한자)
      .replace(/李/g, '이재명')
      .replace(/尹/g, '윤석열')

      // 전직 대통령 치환 (한자)
      .replace(/盧/g, '노무현')

      // 전직 대통령 및 정치인 치환 (영문 이니셜)
      // \b는 단어 경계를 의미 - "YS"가 단독으로 있을 때만 치환
      .replace(/\bYS\b/g, '김영삼')
      .replace(/\bDJ\b/g, '김대중')
      .replace(/\bMB\b/g, '이명박')
      .replace(/\bJP\b/g, '김종필')
      .replace(/\bMH\b/g, '노무현')

      // 정치 관련 한자 치환
      .replace(/與/g, '여당')
      .replace(/野/g, '야당')
      .replace(/靑/g, '청와대')
      .replace(/檢/g, '검찰')
      .replace(/黨/g, '당')
      .replace(/親/g, '친')
      .replace(/非/g, '비')
      .replace(/發/g, '발')
      .replace(/號/g, '호');
  }
}
