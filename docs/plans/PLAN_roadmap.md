# etrial-inspect 개발 로드맵 (2026-04-14 기준)

## 프로젝트 완성도

현재 **v2.1.0** 수준 — 핵심 기능 완성, 보완·고도화 단계

---

## 기존 계획 문서 완료 현황

| 계획 문서 | 상태 | 비고 |
|-----------|------|------|
| PLAN_notion_integration_v2.md | ✅ 완료 | 저장/조회/이력 API 전체 구현 |
| PLAN_fix_json_retrieval.md | ✅ 완료 | JSON chunking 재조립 버그 수정 |
| PLAN_audit_history_list.md | ✅ 완료 | Soft delete + HistoryList UI |
| proposal-pdf-plan.md | ⏸ 보류 해제 대상 | SEO/AI 탭 완성으로 조건 충족 |

---

## 1순위 — 즉시 착수 가능

### ① PDF 제안서 자동 생성
**배경**: `proposal-pdf-plan.md`가 "SEO/AI 탭 완성 후 진행" 조건이었으나, 현재 AI최적화 탭까지 구현 완료됨

**구현 필요 파일**:
- `src/lib/proposal-generator.ts` — HTML/CSS 기반 제안서 템플릿 생성
- `src/app/api/proposal/route.ts` — Playwright PDF 변환 API 엔드포인트
- `src/components/ProposalModal.tsx` — 회사명·담당자 입력 모달
- `src/app/report/[id]/page.tsx` — "제안서 생성" 버튼 추가 (기존 파일 수정)

**예상 소요**: 2~3일

---

### ② KWCAG 체크리스트 페이지
**배경**: `src/app/report/checklist/` 폴더는 존재하나 `page.tsx` 미구현

**구현 필요 파일**:
- `src/app/report/checklist/page.tsx` — KWCAG 전체 항목 + 진단 결과 연계 표시

**재사용 가능**:
- `src/lib/kwcag-mapping.ts` — 이미 구현된 KWCAG ID-Rule 매핑 활용

**예상 소요**: 1~2일

---

## 2순위 — 품질·안정성 강화

### ③ UI 컴포넌트 테스트 추가
**현황**: `src/lib/`, `src/services/` 테스트는 완비. `src/features/` UI 컴포넌트 테스트 없음

**대상 컴포넌트**:
- `src/features/audit/components/AuditTerminal.tsx`
- `src/features/history/components/HistoryList.tsx`
- `src/features/report/components/ReportViewer.tsx`
- `src/features/seo/components/AIDetailView.tsx`

**방법**: React Testing Library 도입

**예상 소요**: 3~5일

---

### ④ Notion API 에러 재시도 로직
**현황**: 네트워크 오류 시 단순 throw만 함, 재시도 없음

**구현 위치**: `src/services/notion/NotionService.ts`

**구현 내용**: Exponential backoff (최대 3회 재시도, 1s → 2s → 4s)

**예상 소요**: 1일

---

### ⑤ 진단 중 상세 진행률 표시
**현황**: 텍스트 로그만 출력, 전체 대비 현재 페이지 수 미표시

**구현 위치**: `src/features/audit/components/AuditTerminal.tsx`

**구현 내용**: `현재 페이지 / 전체 페이지` 진행 바 + 예상 잔여 시간

**예상 소요**: 1일

---

## 3순위 — 고도화 기능

### ⑥ 비교 분석 (이전 vs 현재 진단)
- 이전 진단 결과와 점수·위반 수 차이 시각화
- `src/features/history/components/HistoryList.tsx` + `src/features/report/components/ReportViewer.tsx` 연동

### ⑦ 자동 스케줄링 진단
- GitHub Actions cron 활용 주기적 자동 진단
- 완료 후 Notion 자동 저장

### ⑧ 대규모 크롤링 메모리 최적화
- Playwright 페이지 풀 또는 순차 닫기 구현
- `src/lib/crawler.ts` 개선

---

## 기술 부채

| 항목 | 심각도 | 위치 |
|------|--------|------|
| UI 컴포넌트 테스트 부재 | 중간 | `src/features/**/*.tsx` |
| Notion API 재시도 없음 | 중간 | `src/services/notion/NotionService.ts` |
| Electron 경로 TODO | 낮음 | `src/services/AuditExecutor.ts:14` |
| 브라우저 메모리 관리 | 중간 | `src/lib/crawler.ts` |
