# E-able A11y 개발 로드맵 v3.0 (2026-05-07 기준)

> v2.2.0 로드맵(PLAN_roadmap.md)과 리팩토링 계획(PLAN_refactor_2026-05-06.md),
> PDF 제안서 계획(proposal-pdf-plan.md), 미개발 사항(pending/README.md)을 통합.
> 이미 완료된 항목은 ✅로 표시하고 사유를 기재.

---

## 현재 버전: v2.3.0

### 최근 완료 (2026-05-07)

| 항목 | 상태 | 비고 |
|------|------|------|
| 크롤링 진행률 안정화 | ✅ 완료 | queuedUrls + peakFound 단조증가 |
| 집계 버퍼 구간 텍스트 | ✅ 완료 | [항목] 진행 중... 로그 + summarizing 상태 |
| 이미지 진단 로딩 오버레이 | ✅ 완료 | AltTextOverlay (레이더 애니메이션) |
| 사이드바 2뎁스 메뉴 | ✅ 완료 | 접근성/이미지 진단 각 하위 메뉴 |
| Notion 저장 오류 수정 | ✅ 완료 | Deleted/null-safety/validation_error 안내 |
| 이미지 보고서 페이지네이션 | ✅ 완료 | 100건 제한 제거, 20건/페이지 |
| SSE 실시간 진행률 | ✅ 완료 | crawl-scan SSE + SVG 게이지 + 경과 시간 |
| OCR 알고리즘 6가지 개선 | ✅ 완료 | 형태소/임계값/Levenshtein/PSM/동의어/이진화 |
| 통계 카드 필터링 | ✅ 완료 | 판정별 클릭 필터 토글 |
| Claude Vision AI 정밀 분석 | ✅ 완료 | 유료 옵션, 체크박스 선택, Haiku 4.5 |
| 설정 페이지 API 키 관리 | ✅ 완료 | Anthropic API 키 입력/삭제/마스킹 |
| 이미지 버퍼 캐시 | ✅ 완료 | 2차 다운로드 제거, 사이트 부하 23% 감소 |
| 진단 정지 버튼 | ✅ 완료 | AbortController 기반 취소 |
| 소요 시간 표시 | ✅ 완료 | 보고서 + Notion 저장 |

---

## 1순위 — 즉시 착수 가능

### ① PDF 제안서 자동 생성
- **예상 소요**: 2~3일
- **조건**: SEO/AI 탭 완성 (✅ 충족됨)
- **내용**: 6페이지 PDF (커버, 요약, Top 10 위반, 경쟁사 비교, 개선 로드맵, 강점)
- **구현 파일**:
  - `src/lib/proposal-generator.ts` — HTML/CSS 제안서 템플릿
  - `src/app/api/proposal/route.ts` — Playwright PDF 변환 API
  - `src/components/ProposalModal.tsx` — 회사명/담당자 입력 모달
  - `src/app/report/[id]/page.tsx` — "제안서 생성" 버튼 (수정)

### ② KWCAG 체크리스트 페이지 강화
- **예상 소요**: 1~2일
- **현황**: `/report/checklist` 폴더 존재, 기본 page.tsx 있으나 기능 부족
- **내용**: KWCAG 전체 항목 + 진단 결과 연계, `kwcag-mapping.ts` 활용

### ~~③ OCR 엔진 실측 튜닝~~ → ✅ 완료 (2026-05-07)
- 6가지 무료 알고리즘 개선으로 대체 완료
- 한국어 형태소 정규화, 동적 임계값, Levenshtein, PSM 튜닝, 동의어 사전, 적응형 이진화
- 추가 필요 시 실 사이트 데이터로 가중치 미세 조정

---

## 2순위 — 품질/안정성 강화

### ~~④ UI 컴포넌트 테스트~~ → ✅ 완료 (2026-05-08)
- React Testing Library + jest-environment-jsdom 도입
- AuditTerminal (6건), HistoryList (5건), AltTextScanSection (6건), AIDetailView (6건), AltTextOverlay (30건) — 총 53개 테스트
- 접근성 검증 포함 (role, aria-label, aria-live, aria-modal 등)

### ~~⑤ Notion API 재시도 로직~~ → ✅ 완료 (2026-05-08)
- `src/services/notion/notion-retry.ts` — withRetry 유틸 (exponential backoff 1s→2s→4s, 최대 3회)
- 재시도 대상: 429/500/502/503 + 네트워크 오류 (ECONNRESET/ETIMEDOUT)
- NotionAuditWriter + NotionAltTextWriter 모든 API 호출에 적용
- 6개 단위 테스트 통과

### ~~⑥ 진단 중 상세 진행률 표시~~ → ✅ 완료 (2026-05-07)
- SSE 실시간 진행률 + SVG 원형 게이지 + % 표시 + 경과 시간
- 접근성 진단 + 이미지 진단 모두 구현 완료

### ~~⑦ browser-utils 테스트 수정~~ → ✅ 완료 (2026-05-08)
- 기존 테스트가 이미 수정되어 통과 상태 확인 (Playwright executablePath 우선 사용, channel 미사용)

---

## 3순위 — 고급 기능

### ⑧ 비교 분석 (이전 vs 현재)
- 이전 진단 결과와 점수/위반 수 차이 시각화

### ⑨ 자동 스케줄링 진단
- GitHub Actions cron 활용 주기적 자동 진단 + Notion 자동 저장

### ⑩ 대규모 크롤링 메모리 최적화
- Playwright 페이지 풀 또는 순차 닫기

### ⑪ OCR 엔진 업그레이드
- Tesseract.js 한계 시 PaddleOCR ONNX 검토 (모델 ~50MB, Vercel 배포 제약 사전 검토)

---

## 대규모 리팩토링 (별도 트랙)

**계획 문서**: `docs/plans/PLAN_refactor_2026-05-06.md` (전체 5 Phase)

### 현황
- **Phase 0** (기준선 확보): 미착수 — 테스트 그린화 + 데드코드 정리 + 스타일 정책 결정
- **Phase 1~4**: Phase 0 완료 후 순차 진행

### Phase 요약

| Phase | 내용 | 소요 | 선행 조건 |
|-------|------|------|----------|
| 0 | 테스트 그린화, 데드코드, 스타일 정책 | 1.5~2d | 없음 |
| 1 | kwcag-mapping 테스트, AuditResult 픽스처, any 제거 | 2~3d | Phase 0 |
| 2 | runtime-config, waf-detector, api-helpers 추출 | 3~4d | Phase 1 |
| 3 | God 모듈 분해 (crawler, AuditExecutor, NotionService, ReportViewer) | 8~11d | Phase 2 |
| 4 | UI 정합성, 접근성 자체 위반, 인라인 스타일 제거 | 4~5d | Phase 3 |
| **총계** | | **4~5주** (1인) / **3~3.5주** (2인) | |

**참고**: Phase 2-1(runtime-config), 2-2(waf-detector), 2-3(api-helpers), 3-3(NotionService 분리)은 이미 부분적으로 완료됨 (2026-05-07 작업에서 일부 추출/분리 진행)

---

## 기술 부채

| 항목 | 심각도 | 위치 | 비고 |
|------|--------|------|------|
| ~~UI 컴포넌트 테스트 부재~~ | ~~중간~~ | `src/features/**/*.tsx` | ✅ ④에서 해결 (2026-05-08) |
| ~~Notion API 재시도 없음~~ | ~~중간~~ | `NotionService.ts` | ✅ ⑤에서 해결 (2026-05-08) |
| ~~browser-utils 테스트 실패~~ | ~~낮음~~ | `browser-utils.test.ts` | ✅ ⑦에서 해결 (2026-05-08) |
| 인라인 스타일 다수 | 중간 | 여러 컴포넌트 | 리팩토링 Phase 4 |
| CSS 3중 혼재 | 높음 | 프로젝트 전체 | 리팩토링 Phase 0-3 결정 |
| God 모듈 | 높음 | crawler, AuditExecutor | 리팩토링 Phase 3 |

---

## 이미지 OCR 매칭률 현황

- **대상**: lottegrs.com (33페이지, 470이미지)
- **전체 매칭률**: 25.3% (pass/전체)
- **텍스트 이미지 매칭률**: 35.4% (pass/사진 제외)
- **Claude Vision 1회 비용**: ~$0.50 (700원)
- **상세**: `docs/history/2026-05-07_image-ocr-matching-analysis.md`
