---
name: a11y-guide
description: KWCAG 2.1/2.2 기준 접근성 코드를 작성하거나 검토할 때 반드시 사용한다. HTML/CSS/WAI-ARIA 코딩, 접근성 위반 수정, 컴포넌트 접근성 구현 시 이 스킬을 사용할 것. "접근성", "aria", "KWCAG", "스크린리더", "키보드 접근", "색상 대비", "a11y", "WAI-ARIA"를 언급하면 즉시 이 스킬을 사용할 것.
---

# 접근성 개발 가이드 (a11y-guide)

이 프로젝트의 코딩 컨벤션은 `.agent/rules/`에 있다. **모든 코딩 작업에서 이 규칙이 최우선이다.**

## 규칙 파일 구조

```
.agent/rules/
├── Index.md                  ← 항상 먼저 확인 (always_on)
├── HTML.md                   ← HTML 기본 규칙
├── HTML-Semantic-Tags.md     ← 시맨틱 태그 사용
├── CSS.md                    ← CSS 작성 규칙
├── Naming.md                 ← 네이밍 컨벤션
├── UI-Structure.md           ← UI 구조 설계
├── Image.md                  ← 이미지 처리
├── Accessibility-Basic.md    ← 접근성 기본 개념
├── Accessibility-Components.md ← 컴포넌트별 접근성
├── Accessibility-Text-Guide.md ← 텍스트 접근성
├── Accessibility-Checklist2.1.md ← KWCAG 2.1 체크리스트
├── WAI-ARIA.md               ← WAI-ARIA 사용법
└── components/               ← 컴포넌트별 가이드
    ├── button.md, form.md, table.md
    ├── tab.md, select.md, checkbox.md
    ├── pagination.md, switch.md
    └── Prompt.md
```

## 작업 전 필수 확인

1. `.agent/rules/Index.md` — 코딩 컨벤션 개요 확인
2. 작업 컴포넌트 관련 파일 확인 (예: 버튼 작업 → `.agent/rules/components/button.md`)
3. `.agent/rules/Accessibility-Checklist2.1.md` — 해당 항목 체크

## KWCAG 2.1 핵심 원칙

| 원칙 | 핵심 요구사항 |
|------|-------------|
| 인식의 용이성 | 대체 텍스트, 자막, 색상 대비, 명확한 콘텐츠 |
| 운용의 용이성 | 키보드 접근, 충분한 시간, 깜빡임 없음, 탐색 가능 |
| 이해의 용이성 | 언어 명시, 예측 가능, 오류 정정 |
| 견고성 | 파싱 가능, 보조기술 호환 |

## 코드 패턴

### 접근 가능한 버튼

```tsx
// 아이콘 버튼 (텍스트 숨김)
<button type="button" aria-label="닫기">
  <span aria-hidden="true">×</span>
</button>

// 상태가 있는 버튼
<button
  type="button"
  aria-pressed={isActive}
  aria-label={isActive ? '활성 상태' : '비활성 상태'}
>
  토글
</button>
```

### 접근 가능한 폼

```tsx
// 연결된 레이블
<label htmlFor="url-input">대상 URL</label>
<input
  id="url-input"
  type="url"
  aria-required="true"
  aria-describedby="url-hint"
/>
<p id="url-hint">https://로 시작하는 전체 URL을 입력하세요</p>

// 에러 상태
<input
  aria-invalid={!!error}
  aria-describedby={error ? 'url-error' : undefined}
/>
{error && <p id="url-error" role="alert">{error}</p>}
```

### 접근 가능한 모달

```tsx
<dialog
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-desc"
>
  <h2 id="modal-title">제목</h2>
  <p id="modal-desc">설명</p>
  <button onClick={onClose}>닫기</button>
</dialog>
```

### 로딩 상태 알림

```tsx
<div aria-live="polite" aria-atomic="true">
  {isLoading ? '진단 중입니다...' : ''}
</div>
```

### CSS 색상 대비

```css
/* 텍스트: 최소 4.5:1 (AA), 권장 7:1 (AAA) */
/* 대형 텍스트(18px bold/24px): 최소 3:1 */
/* UI 컴포넌트/아이콘: 최소 3:1 */

.text-primary { color: #1a1a1a; }      /* 배경 #fff 대비 ~19:1 */
.text-secondary { color: #595959; }    /* 배경 #fff 대비 ~7:1 */
.text-disabled { color: #767676; }     /* 배경 #fff 대비 ~4.54:1 (AA 최소) */
```

## 검증 도구

이 프로젝트 자체가 axe-core 기반 감사 도구다. UI 개발 후 자체 진단을 실행해 검증할 수 있다:

```bash
# 개발 서버 실행 후 로컬에서 감사 실행
npm run dev
# 브라우저에서 http://localhost:3000 → URL에 localhost:3000 입력 → 진단 실행
```

## 상세 규칙 참조

작업 중 더 상세한 내용이 필요하면:
- 컴포넌트별: `.agent/rules/components/<컴포넌트>.md` 읽기
- KWCAG 체크리스트: `.agent/rules/Accessibility-Checklist2.1.md` 읽기
- WAI-ARIA 패턴: `.agent/rules/WAI-ARIA.md` 읽기
