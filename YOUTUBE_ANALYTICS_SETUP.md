# YouTube Analytics API 설정 가이드

YouTube Analytics API를 활성화하여 영상 성과 메트릭, 검색 키워드, 시청자 데모그래픽 데이터를 수집하는 방법입니다.

---

## 📋 목차

1. [사전 준비](#1-사전-준비)
2. [Google Cloud Console 설정](#2-google-cloud-console-설정)
3. [OAuth 스코프 추가](#3-oauth-스코프-추가)
4. [재인증 수행](#4-재인증-수행)
5. [테스트 및 확인](#5-테스트-및-확인)
6. [트러블슈팅](#6-트러블슈팅)

---

## 1. 사전 준비

### 필요한 정보
- Google Cloud 프로젝트 ID: `css-1-219408` (현재 프로젝트)
- 기존 OAuth 클라이언트 ID: `159866076810-qdum1h0tlqrd2ee5urlqo3ot9r52r4on.apps.googleusercontent.com`

### 현재 상태 확인
```bash
# 현재 OAuth 토큰 확인
cat credentials/youtube-tokens.json

# 현재 스코프 확인 (scope 필드 참조)
# 현재: youtube.upload, youtube
# 필요: youtube.readonly, yt-analytics.readonly 추가
```

---

## 2. Google Cloud Console 설정

### 2.1 YouTube Analytics API 활성화

1. **Google Cloud Console 접속**
   - https://console.cloud.google.com/
   - 프로젝트 선택: `css-1-219408`

2. **API 라이브러리로 이동**
   - 왼쪽 메뉴: **API 및 서비스** → **라이브러리**
   - 또는 직접 링크: https://console.cloud.google.com/apis/library

3. **YouTube Analytics API 검색 및 활성화**
   - 검색창에 `YouTube Analytics API` 입력
   - **YouTube Analytics API** 선택
   - **사용 설정** 버튼 클릭

4. **YouTube Data API v3 확인**
   - 이미 활성화되어 있어야 함 (기존 업로드 기능 사용 중)
   - 만약 비활성화되어 있다면 함께 활성화

---

## 3. OAuth 스코프 추가

### 3.1 OAuth 동의 화면 수정

1. **OAuth 동의 화면으로 이동**
   - 왼쪽 메뉴: **API 및 서비스** → **OAuth 동의 화면**
   - 또는 직접 링크: https://console.cloud.google.com/apis/credentials/consent

2. **앱 수정 (EDIT APP)**
   - 기존 설정된 앱 정보 확인
   - **EDIT APP** 또는 **앱 수정** 버튼 클릭

3. **범위 (Scopes) 추가**
   - **2단계: 범위** 또는 **Scopes** 섹션으로 이동
   - **범위 추가 또는 삭제** 버튼 클릭

4. **필수 스코프 선택**

   다음 스코프들을 **모두** 선택하세요:

   ✅ **기존 스코프 (유지)**:
   - `https://www.googleapis.com/auth/youtube` - YouTube 계정 관리
   - `https://www.googleapis.com/auth/youtube.upload` - 동영상 업로드

   ✅ **신규 스코프 (추가 필요)**:
   - `https://www.googleapis.com/auth/youtube.readonly` - YouTube 계정 읽기 (메타데이터)
   - `https://www.googleapis.com/auth/yt-analytics.readonly` - YouTube Analytics 보고서 조회
   - `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` - 수익 데이터 조회 (선택사항)

5. **저장**
   - **업데이트** 또는 **SAVE AND CONTINUE** 버튼 클릭
   - 나머지 단계는 변경 없이 **저장 후 계속** 진행

### 3.2 OAuth 클라이언트 확인

1. **사용자 인증 정보로 이동**
   - 왼쪽 메뉴: **API 및 서비스** → **사용자 인증 정보**
   - 또는 직접 링크: https://console.cloud.google.com/apis/credentials

2. **기존 OAuth 클라이언트 확인**
   - OAuth 2.0 클라이언트 ID 섹션에서 기존 클라이언트 찾기
   - 클라이언트 ID: `159866076810-qdum1h0tlqrd2ee5urlqo3ot9r52r4on`

3. **리디렉션 URI 확인**
   - 승인된 리디렉션 URI: `http://localhost:3000/auth/youtube/callback`
   - 변경 불필요 (기존 설정 유지)

---

## 4. 재인증 수행

스코프를 추가했으므로 **새로운 OAuth 토큰을 발급**받아야 합니다.

### 4.1 기존 토큰 백업

```bash
# 기존 토큰 백업 (만약을 위해)
cp credentials/youtube-tokens.json credentials/youtube-tokens.backup.json
```

### 4.2 기존 토큰 삭제

```bash
# 기존 토큰 삭제하여 재인증 강제
rm credentials/youtube-tokens.json
```

### 4.3 서버 시작 및 재인증

```bash
# 개발 서버 시작
npm run start:dev
```

### 4.4 OAuth 인증 URL 접속

서버 시작 후 브라우저에서 다음 URL에 접속:

```
http://localhost:3000/auth/youtube
```

### 4.5 Google 계정 로그인 및 권한 승인

1. **Google 계정 선택**
   - YouTube 채널이 있는 Google 계정으로 로그인

2. **권한 승인 화면 확인**

   다음 권한들이 요청되어야 합니다:
   - ✅ YouTube 계정 관리
   - ✅ YouTube에 동영상 업로드
   - ✅ YouTube 계정 정보 읽기
   - ✅ YouTube Analytics 보고서 조회

   **중요**: 모든 권한에 체크하고 **허용** 버튼 클릭

3. **리디렉션 확인**
   - 성공 시: `http://localhost:3000/auth/youtube/callback?code=...`로 리디렉션
   - "YouTube authentication successful!" 메시지 표시

### 4.6 새 토큰 생성 확인

```bash
# 새 토큰 파일 생성 확인
ls -lh credentials/youtube-tokens.json

# 새 토큰의 scope 필드 확인
cat credentials/youtube-tokens.json | grep scope
```

**예상 출력**:
```json
"scope": "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly"
```

---

## 5. 테스트 및 확인

### 5.1 Analytics API 초기화 확인

서버 재시작 후 로그 확인:

```bash
npm run start:dev
```

**성공 시 로그**:
```
[AnalyticsService] YouTube Analytics API initialized successfully
```

**실패 시 로그** (스코프 부족):
```
[ERROR] [AnalyticsService] YouTube API credentials not configured
```

### 5.2 테스트 영상으로 메트릭 조회

기존에 업로드한 테스트 영상 ID: `-5dSlRPGfoM`

#### 메트릭 조회 테스트
```bash
curl http://localhost:3000/media/analytics/-5dSlRPGfoM/metrics
```

**예상 응답**:
```json
{
  "success": true,
  "data": {
    "videoId": "-5dSlRPGfoM",
    "title": "...",
    "views": 0,
    "likes": 0,
    "averageViewDuration": 0,
    "averageViewPercentage": 0,
    "clickThroughRate": 0,
    "subscribersGained": 0,
    "publishedAt": "2025-01-18T...",
    "categoryId": "25"
  }
}
```

#### 검색 키워드 조회 테스트
```bash
curl http://localhost:3000/media/analytics/-5dSlRPGfoM/keywords
```

#### 종합 리포트 생성 테스트
```bash
curl http://localhost:3000/media/analytics/-5dSlRPGfoM/report
```

#### 고성과 영상 조회 테스트
```bash
curl "http://localhost:3000/media/analytics/high-performers?threshold=1.5&limit=10"
```

---

## 6. 트러블슈팅

### 문제 1: "insufficient permissions" 에러

**원인**: OAuth 토큰에 필요한 스코프가 없음

**해결**:
1. Google Cloud Console에서 스코프 추가 확인 (3단계)
2. 기존 토큰 삭제: `rm credentials/youtube-tokens.json`
3. 재인증 수행 (4단계)

---

### 문제 2: "YouTube Analytics API has not been used" 에러

**원인**: YouTube Analytics API가 프로젝트에서 활성화되지 않음

**해결**:
1. Google Cloud Console → API 라이브러리
2. "YouTube Analytics API" 검색
3. **사용 설정** 클릭
4. 서버 재시작

---

### 문제 3: 재인증 후에도 스코프가 업데이트되지 않음

**원인**: 브라우저 캐시 또는 Google 계정 설정에서 이전 권한 승인 기억

**해결**:

1. **Google 계정 권한 취소**
   - https://myaccount.google.com/permissions 접속
   - "News Printer" 또는 프로젝트 이름 찾기
   - **액세스 권한 삭제** 클릭

2. **토큰 삭제 및 재인증**
   ```bash
   rm credentials/youtube-tokens.json
   npm run start:dev
   # http://localhost:3000/auth/youtube 재접속
   ```

3. **브라우저 캐시 삭제**
   - 시크릿 모드 사용 권장

---

### 문제 4: 데이터가 0으로 표시됨

**원인**: 신규 업로드 영상이라 Analytics 데이터 수집 전 (24-48시간 소요)

**정상 동작**:
- 업로드 직후: 모든 메트릭 0
- 24시간 후: 조회수, 시청 시간 등 집계 시작
- 48시간 후: 검색 키워드, 데모그래픽 데이터 집계

**확인 방법**:
- YouTube Studio에서 동일한 영상의 Analytics 확인
- News Printer Analytics API와 동일한 데이터가 표시되어야 함

---

### 문제 5: "Invalid credentials" 에러

**원인**: OAuth 클라이언트 정보 불일치 또는 만료

**해결**:

1. **credentials/youtube-oauth-credentials.json 확인**
   ```bash
   cat credentials/youtube-oauth-credentials.json
   ```

2. **Google Cloud Console에서 클라이언트 정보 재다운로드**
   - API 및 서비스 → 사용자 인증 정보
   - OAuth 클라이언트 ID 옆 다운로드 아이콘 클릭
   - `youtube-oauth-credentials.json`으로 저장
   - `credentials/` 폴더에 덮어쓰기

3. **토큰 재발급**
   ```bash
   rm credentials/youtube-tokens.json
   npm run start:dev
   ```

---

## ✅ 설정 완료 체크리스트

- [ ] Google Cloud Console에서 YouTube Analytics API 활성화
- [ ] OAuth 동의 화면에서 스코프 추가
  - [ ] `youtube.readonly`
  - [ ] `yt-analytics.readonly`
- [ ] 기존 토큰 삭제
- [ ] 재인증 수행 (`http://localhost:3000/auth/youtube`)
- [ ] 새 토큰의 scope 필드에 모든 스코프 포함 확인
- [ ] 서버 로그에서 Analytics API 초기화 성공 확인
- [ ] 테스트 API 호출 성공 (`/media/analytics/:videoId/metrics`)

---

## 📊 활용 가능한 Analytics 기능

설정 완료 후 사용 가능한 기능:

### 1. 영상별 성과 메트릭
```bash
GET /media/analytics/:videoId/metrics
```
- 조회수, 좋아요, 평균 시청 시간, CTR, 구독자 증가 등

### 2. 검색 유입 키워드
```bash
GET /media/analytics/:videoId/keywords
```
- 상위 25개 검색 키워드 및 조회수

### 3. 종합 분석 리포트
```bash
GET /media/analytics/:videoId/report
```
- 메트릭 + 키워드 + 데모그래픽 + 트래픽 소스 종합

### 4. 고성과 영상 식별
```bash
GET /media/analytics/high-performers?threshold=1.5&limit=10
```
- CTR이 평균의 1.5배 이상인 상위 10개 영상

### 5. 자동 최적화 (OptimizationService)
- 매주 월요일 오전 2시: 고성과 영상 패턴 학습 및 최적화 적용
- 매일 오전 3시: 성과 데이터 수집 및 저장

---

## 📞 지원

Analytics API 설정 중 문제가 발생하면:

1. **서버 로그 확인**
   ```bash
   npm run start:dev | grep "AnalyticsService"
   ```

2. **Google Cloud Console 활동 로그**
   - https://console.cloud.google.com/logs
   - "YouTube Analytics API" 관련 에러 검색

3. **YouTube API 할당량 확인**
   - https://console.cloud.google.com/apis/api/youtubeanalytics.googleapis.com/quotas
   - 일일 할당량 초과 여부 확인

---

**설정 완료 후 CONFIGURATION_STATUS.md의 ⚠️ YouTube Analytics API 항목이 ✅로 변경됩니다.**
