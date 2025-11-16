# GitHub Actions 자동화 설정 가이드

## 📋 개요

이 프로젝트는 GitHub Actions를 통해 매일 자동으로 뉴스를 수집하고 YouTube에 업로드합니다.

**자동 실행 시간**: 매일 오전 9시 (한국 시간 기준, UTC 0시)

## 🔐 필수 Secrets 설정

GitHub 저장소의 Settings → Secrets and variables → Actions로 이동하여 다음 secrets를 추가해야 합니다:

### 1. GEMINI_API_KEY
- **설명**: Google Gemini API 키 (뉴스 스크립트 생성용)
- **발급 방법**:
  1. https://aistudio.google.com/app/apikey 접속
  2. "Create API Key" 클릭
  3. 생성된 키 복사
- **값 예시**: `AIzaSyA...`

### 2. GOOGLE_CLOUD_CREDENTIALS
- **설명**: Google Cloud Text-to-Speech API 인증 JSON (음성 생성용)
- **발급 방법**:
  1. https://console.cloud.google.com/ 접속
  2. 프로젝트 선택 또는 생성
  3. "APIs & Services" → "Credentials" 이동
  4. "Create Credentials" → "Service Account" 선택
  5. 서비스 계정 생성 후 "Keys" 탭에서 JSON 키 다운로드
  6. Text-to-Speech API 활성화 필요
- **값**: JSON 파일 전체 내용을 복사하여 붙여넣기
  ```json
  {
    "type": "service_account",
    "project_id": "your-project",
    "private_key_id": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...",
    "client_email": "...",
    ...
  }
  ```

### 3. YOUTUBE_CLIENT_SECRET
- **설명**: YouTube OAuth 2.0 클라이언트 시크릿
- **발급 방법**:
  1. https://console.cloud.google.com/ 접속
  2. "APIs & Services" → "Credentials" 이동
  3. "Create Credentials" → "OAuth 2.0 Client IDs" 선택
  4. Application type: "Desktop app"
  5. 생성 후 "Download JSON" 클릭
  6. YouTube Data API v3 활성화 필요
- **값**: 다운로드한 `client_secret.json` 파일 전체 내용

### 4. YOUTUBE_TOKENS
- **설명**: YouTube 인증 토큰 (OAuth 인증 후 생성)
- **발급 방법**:
  1. 로컬에서 한 번 YouTube 인증 완료
  2. `.tokens/youtube-tokens.json` 파일 내용 복사
  3. 아직 인증하지 않았다면:
     ```bash
     # 로컬 서버 실행
     npm run start:dev

     # 브라우저에서 인증
     http://localhost:3000/auth/youtube/authorize

     # 인증 완료 후 토큰 파일 확인
     cat .tokens/youtube-tokens.json
     ```
- **값**: `.tokens/youtube-tokens.json` 파일 전체 내용
  ```json
  {
    "access_token": "...",
    "refresh_token": "...",
    "scope": "...",
    "token_type": "Bearer",
    "expiry_date": ...
  }
  ```

## 🚀 설정 완료 후

### 자동 실행
- 매일 오전 9시(한국 시간)에 자동으로 실행됩니다
- 실행 결과는 Actions 탭에서 확인 가능

### 수동 실행
1. GitHub 저장소의 "Actions" 탭으로 이동
2. "Auto Publish News" 워크플로우 선택
3. "Run workflow" 버튼 클릭
4. 옵션 설정:
   - `category`: 뉴스 카테고리 (기본값: politics)
   - `limit`: 뉴스 개수 (기본값: 10)
5. "Run workflow" 확인

## 📊 실행 결과 확인

### GitHub Actions 요약
- 워크플로우 실행 완료 후 Summary에서 결과 확인 가능:
  - 총 처리 개수
  - 성공/실패 개수
  - 업로드된 YouTube 영상 링크

### 로그 확인
- 실패한 경우 "server-logs" 아티팩트 다운로드하여 상세 로그 확인
- 모든 실행 결과는 "publish-results" 아티팩트에 JSON 형태로 저장

## ⚠️ 주의사항

### YouTube API 할당량
- 일일 할당량: 10,000 쿼터 포인트
- 영상 업로드: 1,600 포인트/개
- **하루 최대 6개 영상 업로드 권장** (10,000 / 1,600 ≈ 6)
- 초과 시 다음날까지 대기 필요

### 비용
- **완전 무료** (무료 티어 할당량 내에서 사용 시)
- Google Cloud TTS: 월 400만 문자 무료
- Gemini API: 월 150만 토큰 무료
- GitHub Actions: 월 2,000분 무료 (이 워크플로우는 5-10분 소요)

### 보안
- Secrets는 절대 코드에 포함하지 마세요
- `.env`, `google-credentials.json`, `client_secret.json`, `.tokens/` 등은 `.gitignore`에 포함
- 토큰은 정기적으로 갱신 권장

## 🔧 문제 해결

### 워크플로우 실패 시
1. Actions 탭에서 실패한 워크플로우 클릭
2. 빨간색으로 표시된 단계 확인
3. "server-logs" 아티팩트 다운로드하여 상세 로그 확인

### YouTube 인증 만료 시
1. 로컬에서 재인증:
   ```bash
   npm run start:dev
   # http://localhost:3000/auth/youtube/authorize 접속
   ```
2. 새로운 토큰으로 `YOUTUBE_TOKENS` Secret 업데이트

### API 할당량 초과 시
- YouTube API: 다음날까지 대기
- TTS/Gemini: 유료 플랜 전환 또는 다음 달까지 대기

## 📝 스케줄 변경

`.github/workflows/auto-publish-news.yml` 파일에서 cron 표현식 수정:

```yaml
on:
  schedule:
    # 매일 오후 6시 (한국 시간 기준, UTC 9시)
    - cron: '0 9 * * *'
```

**Cron 표현식 예시**:
- `0 0 * * *` - 매일 오전 9시 (한국 시간)
- `0 */6 * * *` - 6시간마다
- `0 0 * * 1` - 매주 월요일 오전 9시
- `0 0 1 * *` - 매월 1일 오전 9시

## 📞 문제 발생 시

1. GitHub Actions 실행 로그 확인
2. Secrets 설정 재확인
3. API 할당량 확인
4. 로컬에서 먼저 테스트해보기

---

설정 완료 후 자동으로 뉴스가 YouTube에 업로드됩니다! 🎉
