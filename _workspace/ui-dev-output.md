# UI 재구성 결과 (SaaS 대시보드 스타일)

## 변경 파일 목록

### 신규 생성
- `src/lib/utils.ts` - cn() 유틸리티 (clsx + tailwind-merge)
- `src/components/layout/Sidebar.tsx` - 좌측 사이드바 네비게이션
- `src/components/ui/badge.tsx` - Badge 컴포넌트 (shadcn 스타일)
- `src/components/ui/separator.tsx` - Separator 컴포넌트 (Radix UI)

### 수정
- `src/app/globals.css` - Tailwind v4 `@import "tailwindcss"` 추가, shadcn HSL CSS 변수 추가
- `src/app/layout.tsx` - Sidebar 레이아웃으로 전면 교체 (lang="ko", Inter 폰트)
- `src/app/page.tsx` - 대시보드 레이아웃 재구성 (통계 카드 4개 + 2열 Config/Terminal + History)
- `src/components/ui/Button.tsx` - ShadButton(새) + Button(레거시) 병행 export
- `src/components/ui/Card.tsx` - ShadCard(새) + Card(레거시) 병행 export
- `postcss.config.mjs` - `@tailwindcss/postcss` 사용 (Tailwind v4 호환)
- `tailwind.config.ts` - darkMode 배열 타입 수정

### 버그 수정
- `src/services/notion/NotionService.ts` - properties 타입 오류 수정

## 주요 구조 변경

### 레이아웃
- 기존: 헤더 + 단일 컬럼
- 변경: 좌측 사이드바(220px) + 메인 콘텐츠(flex-1)

### 대시보드 페이지 (page.tsx)
- 상단: 페이지 타이틀 + 진단 시작/내보내기 버튼
- 통계 카드 4개: 진단 횟수, 발견 위반, 진단 상태, 페이지 수
- 2열: AuditConfigForm + AuditTerminal
- 하단: HistoryList

### 사이드바 메뉴
- 진단 (/) / 보고서 (/report) / 이력 (/#history) / 체크리스트 (/report/checklist)
- 설정 / 도움말
- Pro 업그레이드 카드

## 접근성 체크리스트
- [x] Sidebar에 `role="navigation"` + `aria-label="메인 내비게이션"` 부여
- [x] 활성 메뉴에 `aria-current="page"` 적용
- [x] 아이콘에 `aria-hidden="true"` 적용
- [x] `lang="ko"` 설정
- [x] 키보드 접근: Link 컴포넌트 사용으로 자연스러운 탭 순서 보장
- [x] section에 `aria-label` 부여 (진단 설정, 진단 로그, 진단 이력)

## 빌드 상태
npm run build: 성공
