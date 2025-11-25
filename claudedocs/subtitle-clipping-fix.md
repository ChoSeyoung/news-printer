# Shorts 자막 잘림 현상 수정

## 문제점
문장이 길어지면 자막이 화면에 더 보이지 않고 잘리는 현상 발생

## 원인 분석
`src/media/services/shorts-video.service.ts`의 `wrapText()` 메서드와 자막 렌더링 코드에서:

1. **하드코딩된 줄 수 제한**: 자막을 최대 2줄로 제한 (`maxLines: 2`)
2. **비효율적인 텍스트 분할**: 긴 단어 처리 시 불필요한 반복 체크
3. **한글 텍스트 처리 미흡**: 공백 기준 분리는 있으나 최적화 필요

### 기존 동작
- 제목: 최대 2줄, 18자/줄 = 최대 36자
- 자막: 최대 2줄, 18자/줄 = 최대 36자
- **36자 초과 텍스트는 모두 잘림**

## 수정 내용

### 1. `wrapText()` 메서드 개선

**파일**: `src/media/services/shorts-video.service.ts:129-174`

**개선 사항**:
- 불필요한 중간 체크 제거 (성능 향상)
- 긴 단어 분할 로직 단순화
- maxLines 제한을 마지막에 한 번만 적용
- 모든 텍스트를 먼저 처리 후 필요시 잘라내는 방식

```typescript
private wrapText(text: string, maxCharsPerLine: number, maxLines?: number): string {
  const lines: string[] = [];
  let currentLine = '';

  const words = text.split(' ');

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;

    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }

      // 단어가 maxCharsPerLine보다 길면 문자 단위로 분할
      if (word.length > maxCharsPerLine) {
        let remaining = word;
        while (remaining.length > 0) {
          const chunk = remaining.substring(0, maxCharsPerLine);
          lines.push(chunk);
          remaining = remaining.substring(maxCharsPerLine);
        }
      } else {
        currentLine = word;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  // maxLines 제한이 있으면 해당 줄 수만 반환
  if (maxLines && lines.length > maxLines) {
    return lines.slice(0, maxLines).join('\n');
  }

  return lines.join('\n');
}
```

### 2. 자막 렌더링 줄 수 제한 제거

**파일**: `src/media/services/shorts-video.service.ts:227-253`

**변경 사항**:
- 시간 동기화 자막: `wrapText(subtitle.text, 18, 2)` → `wrapText(subtitle.text, 18)`
- 전체 스크립트 자막: `wrapText(script, 18, 2)` → `wrapText(script, 18)`
- 제목은 그대로 2줄 제한 유지 (`wrapText(title, 18, 2)`)

```typescript
// 시간 동기화 자막 추가 (줄 수 제한 제거 - 전체 텍스트 표시)
if (subtitles && subtitles.length > 0) {
  for (const subtitle of subtitles) {
    // 줄 수 제한 없이 전체 텍스트를 표시 (가독성 우선)
    const wrappedSubtitle = this.wrapText(subtitle.text, 18);
    // ... 자막 렌더링
  }
} else {
  // 자막 타이밍이 없으면 전체 스크립트를 고정 표시 (줄 수 제한 없음)
  const wrappedScript = this.wrapText(script, 18);
  // ... 자막 렌더링
}
```

## 결과

### 수정 전
- 자막 최대 2줄 (36자) 제한
- 긴 문장은 잘려서 보이지 않음
- 정보 손실 발생

### 수정 후
- 자막 줄 수 제한 없음
- 전체 텍스트가 모두 표시됨
- 18자/줄로 자동 줄바꿈
- 가독성 우선 정책

## 영향 범위
- **shorts-video.service.ts**: 자막 렌더링 로직
- **제목**: 여전히 2줄 제한 (상단 고정 영역)
- **자막**: 제한 없음 (하단 스크롤 가능 영역)

## 테스트 권장 사항
1. 짧은 문장 (10자 이하): 1줄로 표시되는지 확인
2. 중간 문장 (20-30자): 2줄로 적절히 줄바꿈되는지 확인
3. 긴 문장 (50자 이상): 3줄 이상으로 전체 표시되는지 확인
4. 공백 없는 긴 단어: 18자 단위로 강제 분할되는지 확인

## 빌드 확인
```bash
npx tsc --noEmit  # ✅ 컴파일 에러 없음
```
