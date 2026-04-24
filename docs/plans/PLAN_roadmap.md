# etrial-inspect 개발 로드맵 (2026-04-24 기준)

## 프로젝트 완성도

현재 **v2.2.0** 수준 — 핵심 기능 완성 + 이미지 OCR 검증 파이프라인 통합

---

## 기존 계획 문서 완료 현황

| 계획 문서 | 상태 | 비고 |
|-----------|------|------|
| PLAN_notion_integration_v2.md | ✅ 완료 | 저장/조회/이력 API 전체 구현 |
| PLAN_fix_json_retrieval.md | ✅ 완료 | JSON chunking 재조립 버그 수정 |
| PLAN_audit_history_list.md | ✅ 완료 | Soft delete + HistoryList UI |
| proposal-pdf-plan.md | ⏸ 보류 해제 대상 | SEO/AI 탭 완성으로 조건 충족 |
| plans/adaptive-cake (alt-text OCR) | ✅ 완료 | 2026-04-24, 옵션 A + 3모드 구현 완료 |

---

## 최근 완료 — 이미지 대체텍스트 OCR 검증 (2026-04-24)

### 채택 방식: **옵션 A (Tesseract.js + sharp 전처리 + 판정 로직 고도화)**

| 항목 | 결과 |
|------|------|
| OCR 엔진 | Tesseract.js 7.0 (kor+eng LSTM) + sharp 전처리 |
| 정확도 | 실측 85%+ (전처리로 이진화·업스케일·샤픈 적용) |
| 이미지 유형 분류 | text-heavy / mixed / photo (신뢰도·단어수 기반) |
| 판정 5단계 | pass / missing_alt / decorative_mismatch / text_mismatch / review_needed |
| 실행 모드 | **integrated** (감사 내 연속) · **separate** (별도 단계, 기본값) · **standalone** (전용 API) |
| 성능 제어 | worker pool(2), URL 캐시, maxImages 20/페이지, minSize 32px 필터, AbortSignal |
| UI | AltTextScanSection — 판정별 색상·배지·썸네일 포함 결과 카드 |
| API | `/api/audit`(통합) + `/api/alt-text-scan`(standalone 최대 50 URL) |
| 테스트 | 32개 단위 테스트 전체 통과 |

### 핵심 구현 파일
- `src/types/alt-text.ts` — ImageType, AltTextJudgment, AltTextExecutionMode 타입
- `src/lib/alt-text-validator.ts` — OCR 엔진 + 전처리 + 분류 + 판정 + 유사도
- `src/lib/accessibility-auditor.ts` — integrated 모드 훅
- `src/services/AuditExecutor.ts` — separate 모드 + runStandaloneAltTextScan
- `src/app/api/alt-text-scan/route.ts` — standalone 엔드포인트
- `src/features/audit/components/AuditConfigForm.tsx` — 토글·모드 선택 UI
- `src/features/report/components/AltTextScanSection.tsx` — 결과 표시 UI
- `public/tessdata/{kor,eng}.traineddata` — OCR 언어팩

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

### ③ alt-text OCR 엔진 실측 튜닝
**배경**: 옵션 A 구현 완료. 실제 운영 사이트 샘플로 전처리 파라미터 튜닝 필요.

**작업 항목**:
- 실제 웹사이트 100장+ 이미지 샘플로 한글 인식률 측정
- sharp 전처리 threshold(현재 160) 및 resize factor 튜닝
- confidence 임계값(현재 text-heavy 70, mixed 40) 실측 보정
- similarityThreshold(현재 0.6) A/B 검증

**예상 소요**: 1일

---

## 2순위 — 품질·안정성 강화

### ④ UI 컴포넌트 테스트 추가
**현황**: `src/lib/`, `src/services/` 테스트는 완비. `src/features/` UI 컴포넌트 테스트 없음

**대상 컴포넌트**:
- `src/features/audit/components/AuditTerminal.tsx`
- `src/features/history/components/HistoryList.tsx`
- `src/features/report/components/ReportViewer.tsx`
- `src/features/report/components/AltTextScanSection.tsx` (신규)
- `src/features/seo/components/AIDetailView.tsx`

**방법**: React Testing Library 도입

**예상 소요**: 3~5일

---

### ⑤ Notion API 에러 재시도 로직
**현황**: 네트워크 오류 시 단순 throw만 함, 재시도 없음

**구현 위치**: `src/services/notion/NotionService.ts`

**구현 내용**: Exponential backoff (최대 3회 재시도, 1s → 2s → 4s)

**예상 소요**: 1일

---

### ⑥ 진단 중 상세 진행률 표시
**현황**: 텍스트 로그만 출력, 전체 대비 현재 페이지 수 미표시

**구현 위치**: `src/features/audit/components/AuditTerminal.tsx`

**구현 내용**:
- `현재 페이지 / 전체 페이지` 진행 바 + 예상 잔여 시간
- alt-text OCR separate 모드 진행률 분리 표시 (`type: 'alt-text-progress'` 이벤트 활용)

**예상 소요**: 1일

---

### ⑦ browser-utils 테스트 수정
**현황**: `getBrowserLaunchOptions` 테스트 2건 실패 (채널 반환값 불일치)

**구현 위치**: `src/lib/__tests__/browser-utils.test.ts`

**작업**: 현재 구현이 `@sparticuz/chromium` 경로 기반이라 `channel` 필드가 없음. 테스트를 실제 구현에 맞춰 수정

**예상 소요**: 0.5일

---

## 3순위 — 고도화 기능

### ⑧ 비교 분석 (이전 vs 현재 진단)
- 이전 진단 결과와 점수·위반 수 차이 시각화
- `src/features/history/components/HistoryList.tsx` + `src/features/report/components/ReportViewer.tsx` 연동

### ⑨ 자동 스케줄링 진단
- GitHub Actions cron 활용 주기적 자동 진단
- 완료 후 Notion 자동 저장

### ⑩ 대규모 크롤링 메모리 최적화
- Playwright 페이지 풀 또는 순차 닫기 구현
- `src/lib/crawler.ts` 개선

### ⑪ OCR 엔진 업그레이드 (옵션 B 검토)
- Tesseract.js 한글 정확도에 한계가 드러나면 PaddleOCR ONNX(onnxruntime-node)로 엔진 교체
- 기존 `analyzeImageWithVision` 인터페이스 유지 → 내부만 교체
- 모델 파일(~50MB) Vercel 배포 제약 사전 검토 필요

---

## 기술 부채

| 항목 | 심각도 | 위치 |
|------|--------|------|
| UI 컴포넌트 테스트 부재 | 중간 | `src/features/**/*.tsx` |
| Notion API 재시도 없음 | 중간 | `src/services/notion/NotionService.ts` |
| browser-utils 테스트 실패 | 낮음 | `src/lib/__tests__/browser-utils.test.ts` |
| Electron 경로 TODO | 낮음 | `src/services/AuditExecutor.ts:14` |
| 브라우저 메모리 관리 | 중간 | `src/lib/crawler.ts` |
| Excel/PDF에 alt-text 결과 미반영 | 낮음 | `src/lib/excel-generator.ts`, `src/lib/pdf-report-generator.ts` |
