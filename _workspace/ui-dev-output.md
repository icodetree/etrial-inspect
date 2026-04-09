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
