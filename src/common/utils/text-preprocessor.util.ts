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
   * [제목 앞 번호 제거]
   * - "1. ", "2. ", "6. " 등 → 제거
   *
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
      // 제목 앞 번호 제거 (예: "1. ", "6. ", "10. " → 제거)
      .replace(/^\d+\.\s+/, '')
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
      .replace(/號/g, '호')
      // 일반 한자 치환 (자막용)
      .replace(/前/g, '전')
      .replace(/後/g, '후')
      .replace(/中/g, '중')
      .replace(/韓/g, '한')
      .replace(/美/g, '미')
      .replace(/日/g, '일')
      .replace(/北/g, '북')
      .replace(/南/g, '남')
      .replace(/東/g, '동')
      .replace(/西/g, '서')
      .replace(/大/g, '대')
      .replace(/小/g, '소')
      .replace(/新/g, '신')
      .replace(/舊/g, '구')
      .replace(/元/g, '원')
      .replace(/副/g, '부');
  }

  /**
   * TTS가 자연스럽게 읽을 수 있도록 텍스트를 정제합니다
   *
   * @param text - 원본 텍스트
   * @returns 정제된 텍스트
   *
   * 정제 항목:
   * - 기자 정보 제거 (서울=뉴스1, xxx 기자 등)
   * - 특수문자 제거 (괄호, 따옴표, 기타 기호, 온점/쉼표 제외)
   * - 여러 개의 공백을 하나로 통합
   * - 문장 끝 정리 (마침표, 느낌표, 물음표만 유지)
   * - 불필요한 개행 제거
   * - 숫자와 문자 사이 띄어쓰기 정리
   */
  static normalizeTextForTTS(text: string): string {
    return text
      // 기자 정보 패턴 제거
      .replace(/\([^)]*=\s*[^)]*\)/g, '') // (서울=뉴스1), (부산=연합뉴스) 등
      .replace(/[가-힣]{2,}\s+기자/g, '') // xxx 기자, 홍길동 기자 등
      .replace(/\s*기자\s*/g, ' ') // 남은 "기자" 단어 제거
      // 따옴표 제거 (큰따옴표, 작은따옴표, 전각 따옴표)
      .replace(/["'"""'']/g, '')
      // 괄호와 내용 제거 (영어, 한자, 부가 설명 등)
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\{[^}]*\}/g, '')
      // 특수기호 제거 (온점, 쉼표, 느낌표, 물음표 제외)
      .replace(/[~`!@#$%^&*_+=|\\<>]/g, '')
      .replace(/[-–—]/g, ' ') // 하이픈 계열은 공백으로
      .replace(/[/]/g, ' ') // 슬래시도 공백으로
      .replace(/[;:]/g, '') // 세미콜론, 콜론 제거
      // 연속된 공백을 하나로 통합
      .replace(/\s+/g, ' ')
      // 문장 부호 앞뒤 공백 정리
      .replace(/\s*([.,!?])\s*/g, '$1 ')
      // 문장 끝 이후 공백 정리
      .replace(/([.!?])\s+/g, '$1 ')
      // 개행 문자를 공백으로 변환 (자연스러운 흐름)
      .replace(/\n+/g, ' ')
      // 숫자와 한글 사이 띄어쓰기 통일
      .replace(/(\d)\s*([가-힣])/g, '$1 $2')
      .replace(/([가-힣])\s*(\d)/g, '$1 $2')
      // 앞뒤 공백 제거
      .trim();
  }

  /**
   * 텍스트를 TTS 및 뉴스 스크립트에 적합하게 완전히 전처리합니다
   *
   * @param text - 원본 텍스트
   * @returns 전처리된 텍스트
   *
   * 처리 순서:
   * 1. 한자를 한글로 변환
   * 2. TTS용 텍스트 정제
   */
  static preprocessForNews(text: string): string {
    // 1. 한자를 한글로 변환
    const hanjaConverted = TextPreprocessor.preprocessText(text);

    // 2. TTS용 정제
    const ttsReady = TextPreprocessor.normalizeTextForTTS(hanjaConverted);

    return ttsReady;
  }

  /**
   * 35글자 초과 문장을 분리합니다 (자막 가독성)
   *
   * @param text - 원본 텍스트
   * @param maxLength - 최대 문장 길이 (기본값: 35)
   * @returns 분리된 텍스트
   *
   * 분리 규칙:
   * - 문장 부호(. ! ?)로 먼저 분리
   * - 35글자 초과 시 쉼표(,)로 분리
   * - 그래도 초과 시 접속사나 공백으로 분리
   */
  static splitLongSentences(text: string, maxLength: number = 35): string {
    // 문장 부호로 문장 분리
    const sentences = text.split(/([.!?])\s*/);
    const result: string[] = [];

    for (let i = 0; i < sentences.length; i++) {
      let sentence = sentences[i];

      // 문장 부호만 있는 경우 이전 문장에 붙이기
      if (sentence.match(/^[.!?]$/)) {
        if (result.length > 0) {
          result[result.length - 1] += sentence;
        }
        continue;
      }

      // 빈 문자열 건너뛰기
      if (!sentence.trim()) continue;

      // 35글자 이하면 그대로 추가
      if (sentence.length <= maxLength) {
        result.push(sentence.trim());
        continue;
      }

      // 35글자 초과 시 쉼표로 분리
      const parts = sentence.split(/,\s*/);
      let currentPart = '';

      for (const part of parts) {
        // 현재 부분에 추가했을 때 35글자 초과하는지 확인
        const testPart = currentPart ? currentPart + ', ' + part : part;

        if (testPart.length <= maxLength) {
          currentPart = testPart;
        } else {
          // 현재 부분이 있으면 결과에 추가
          if (currentPart) {
            result.push(currentPart.trim());
          }

          // 새 부분이 35글자 초과하면 공백으로 분리
          if (part.length > maxLength) {
            const words = part.split(/\s+/);
            let line = '';

            for (const word of words) {
              const testLine = line ? line + ' ' + word : word;

              if (testLine.length <= maxLength) {
                line = testLine;
              } else {
                if (line) {
                  result.push(line.trim());
                }
                line = word;
              }
            }

            if (line) {
              currentPart = line;
            } else {
              currentPart = '';
            }
          } else {
            currentPart = part;
          }
        }
      }

      // 남은 부분 추가
      if (currentPart) {
        result.push(currentPart.trim());
      }
    }

    return result.join('. ').replace(/\.\s*\./g, '.').trim();
  }
}
