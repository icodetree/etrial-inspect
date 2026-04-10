# SEO/AI 탭 UI 재설계 결과 (SOYOYU 스타일)

## 변경 파일 목록

### 완전 재작성
- `src/features/seo/components/SEODetailView.tsx` - SOYOYU 스타일 SEO 종합 분석 뷰
- `src/features/seo/components/SEODetailView.module.css` - SEO 뷰 스타일 (카드 그리드, 원형 게이지 등)
- `src/features/seo/components/AIDetailView.tsx` - AI 최적화 뷰 (llms.txt + 크롤러 + issues)
- `src/features/seo/components/AIDetailView.module.css` - AI 뷰 스타일

### 수정
- `src/features/report/components/ReportViewer.tsx` - 탭 라벨 변경 ("SEO 종합 분석", "AI 최적화")

## 주요 컴포넌트 구조

### SEODetailView.tsx
- `ScoreCircle` - SVG stroke-dasharray 기반 원형 점수 게이지
- `PageSummary` - URL/Canonical/Title/Description/H1/Robots/Lang 서머리 카드
- `CategoryCard` - 10개 카테고리 카드 (아이콘, 점수, 상태텍스트, critical/warning/passed 도트)
- `CategoryDetail` - 클릭 시 펼쳐지는 상세 패널 (Issues + Passed 접기/펼치기)
- 탭바 - 전체 + 10개 카테고리 필터 (pill 버튼)
- 카테고리 그리드 - 3열 반응형 (900px 이하 2열, 560px 이하 1열)

### AIDetailView.tsx
- 헤더 원형 점수 게이지
- llms.txt 분석 카드 (존재 여부, 구조, 품질, 제안)
- AI 크롤러 접근성 카드 (GPTBot/ClaudeBot/Google-Extended/BingBot 허용/차단)
- Issues 목록 카드 (geo 카테고리 이슈)
- AI 전문가 검증 버튼 그룹 (기존 프롬프트 복사 기능 유지)

### 점수 색상 체계
- 0~49: 빨간(#ef4444), "많이 개선해야 해요"
- 50~69: 주황(#f59e0b), "괜찮아요"
- 70~89: 초록(#22c55e), "훌륭해요!"
- 90~100: 파랑(#3b82f6), "완벽해요!"

## TypeScript 에러
- 수정된 파일에서 TS 에러 없음
- 기존 browser-utils.test.ts 에러는 이번 작업 범위 밖

## QA 확인 사항

### 키보드 접근성
- [ ] 탭바 버튼 Tab/Enter 키 동작
- [ ] 카테고리 카드 버튼 Tab/Enter/Space 키 동작 + aria-pressed
- [ ] 상세 패널 닫기 버튼 키보드 접근
- [ ] 통과 항목 접기/펼치기 버튼 aria-expanded

### 스크린리더
- [ ] ScoreCircle aria-label "종합 점수 N점" 읽힘
- [ ] 카테고리 카드 aria-label "카테고리명, 점수 N점, 상태텍스트" 읽힘
- [ ] 이슈 severity 텍스트 읽힘
- [ ] 프롬프트 복사 성공 메시지 aria-live="polite" 동작
- [ ] nav aria-label="카테고리 필터" 랜드마크 인식

### 색상 대비
- [ ] 점수 색상 (#ef4444, #f59e0b, #22c55e, #3b82f6) 흰색 배경 대비 AA 기준 확인
- [ ] 탭 활성 상태 (#2563eb 배경 + 흰색 텍스트) 대비 확인
- [ ] 이슈 severity 텍스트 배경 대비 확인

### 관련 KWCAG 항목
- 1.1.1 대체 텍스트 (아이콘 aria-hidden, 점수 aria-label)
- 2.1.1 키보드 접근 (모든 인터랙티브 요소)
- 1.4.3 명도 대비 (점수 색상, 탭 색상)
- 4.1.2 이름/역할/값 (aria-pressed, aria-expanded, role="list")

---

## SEO 탭 컴포넌트 접근성 개선 (2026-04-09)

### 변경 파일
- `src/features/seo/components/SEODetailView.tsx`

### 변경 내용

#### 1. WAI-ARIA 탭 패턴 적용
- `<nav>` 태그를 `<div role="tablist">` 로 변경
- 각 탭 버튼에 `role="tab"`, `id="seo-tab-{tab}"`, `aria-selected`, `aria-controls` 추가
- `aria-pressed` 제거하고 `aria-selected` 사용 (탭 패턴 표준)
- 탭패널 영역에 `role="tabpanel"`, `id="seo-tabpanel-{activeTab}"`, `aria-labelledby` 추가

#### 2. Roving Tabindex
- `tabIndex={activeTab === tab ? 0 : -1}` 적용
- 탭 그룹 내에서 Tab 키는 활성 탭에만 포커스, 비활성 탭은 Arrow 키로 이동

#### 3. 키보드 Arrow Key 네비게이션
- `handleTabKeyDown` 핸들러 추가
- ArrowLeft / ArrowRight: 이전/다음 탭으로 순환 이동 + 포커스 이동
- Home: 첫 번째 탭으로 이동
- End: 마지막 탭으로 이동
- `useRef`로 탭 버튼 배열 참조하여 `tabRefs.current[index]?.focus()` 호출

#### 4. 카테고리 카드 aria-expanded
- `aria-pressed` 를 `aria-expanded` 로 변경 (상세 패널 열림/닫힘 의미에 적합)

### QA 검증 요청
- 컴포넌트: SEODetailView 탭바
- 검증 항목: 키보드 접근 (ArrowLeft/Right/Home/End), 스크린리더 (role=tablist/tab/tabpanel, aria-selected)
- 관련 KWCAG: 2.1.1 키보드 접근, 4.1.2 이름/역할/값

---

## AuditConfigForm: maxPages/maxDepth 입력 필드 추가 (2026-04-09)

### 변경 파일
- `src/features/audit/components/AuditConfigForm.tsx`

### 변경 내용
- "제외 경로" 아래, 버튼 위에 2열 그리드(`styles.row`)로 두 개의 숫자 입력 필드 추가
- **최대 페이지 수** (`maxPages`): `type="number"`, min=1, max=1000, placeholder="기본값 (Vercel: 5 / 로컬: 1000)"
- **최대 깊이** (`maxDepth`): `type="number"`, min=1, max=20, placeholder="기본값 (Vercel: 2 / 로컬: 10)"
- 빈 값 시 `parseInt(value) || undefined`로 처리하여 config에 포함하지 않음
- `label htmlFor` + `input id` 연결로 접근성 확보 (`audit-max-pages`, `audit-max-depth`)
- 기존 `styles.row` (2열 grid) 재사용으로 플랫폼/점검자 행과 일관된 레이아웃

### 빌드 결과
- `npm run build` 성공 확인

### QA 검증 요청
- 컴포넌트: AuditConfigForm maxPages/maxDepth 필드
- 검증 항목: 키보드 접근 (Tab 이동, 숫자 입력), 스크린리더 (label 연결), 빈 값 처리
- 관련 KWCAG: 1.3.1 정보와 관계, 2.1.1 키보드 접근, 3.3.2 레이블 또는 설명

---

## /report/[id] Loading/Error UI 추가 (2026-04-09)

### 변경 파일
- `src/app/report/[id]/loading.tsx` (신규) - Suspense 로딩 UI
- `src/app/report/[id]/loading.module.css` (신규) - 로딩 스타일
- `src/app/report/[id]/error.tsx` (신규) - 런타임 에러 바운더리
- `src/app/report/[id]/error.module.css` (신규) - 에러 스타일
- `src/app/report/[id]/page.tsx` (수정) - try/catch 에러 처리 보강

### 변경 내용

#### loading.tsx
- CSS spinner 애니메이션 (CSS 변수 `--c-border`, `--c-primary` 활용)
- `role="status"` + `aria-label="리포트 로딩 중"` -- 스크린리더가 로딩 상태 인식
- 인라인 스타일 대신 CSS Module 사용

#### error.tsx
- `'use client'` 지시어 (Next.js error boundary 필수)
- `role="alert"` -- 스크린리더가 에러 메시지 즉시 알림
- SVG 경고 아이콘 `aria-hidden="true"` 처리
- "다시 시도" 버튼 -- `reset()` 호출로 재렌더링
- `:focus-visible` 아웃라인으로 키보드 포커스 시각화
- CSS 변수 활용 (`--c-danger`, `--c-danger-bg`, `--c-primary`, `--c-primary-hover`)

#### page.tsx 개선
- Notion 환경 변수 미설정 시 `<div>` 반환 대신 `throw new Error` -- error.tsx가 캐치
- `notionService.getAuditResult()` 호출을 try/catch로 감싸고 상세 에러 메시지 포함

### 빌드 결과
- TypeScript 타입 체크 통과 (기존 browser-utils.test.ts 에러만 존재, 이번 작업 범위 밖)

### QA 검증 요청
- 컴포넌트: /report/[id] loading.tsx, error.tsx
- 검증 항목: 스크린리더(role="status" 로딩 인식, role="alert" 에러 알림), 키보드(다시 시도 버튼 focus-visible), 색상 대비(spinner 색상, 에러 텍스트)
- 관련 KWCAG: 1.3.1 정보와 관계, 2.1.1 키보드 접근, 4.1.3 상태 메시지
