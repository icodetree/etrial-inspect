# PLAN: 전사 리팩토링 계획 (2026-05-06)

> e-able-a11y 프로젝트 전체 기술 부채 진단 및 단계별 리팩토링 계획.
> 입력: `audit-dev` / `ui-dev` / `qa` 3개 전문 에이전트의 병렬 분석 결과.
> 작성: etrial-dev 오케스트레이션, 2026-05-06.

---

## 0. 핵심 진단 요약

| 영역 | 가장 시급한 문제 | 영향도 |
|------|------------------|--------|
| **테스트** | `npm test` 13 suites / 149 tests 중 **32개 실패**. 메인이 빨간 상태. | ⚠️ Blocker |
| **감사 엔진** | `crawler.ts` 803줄 / `AuditExecutor.ts` 655줄(`runAudit` 단독 430줄) — God module + 환경 분기 4곳 산재 | High |
| **UI** | CSS Modules + 인라인 `style={{}}` 202회 + 미사용 Tailwind/shadcn — **3중 스타일링 혼재** | High |
| **타입 계약** | `Violation` 진화 시 NotionService 테스트 자동 깨짐 = 경계 통합 테스트 부재 | High |
| **a11y 자기위반** | `<div onClick>` 핵심 카드 4개, 모달 focus trap/aria-modal 부재 | Medium |
| **데드코드** | `fix-notion.js`, `test-notion.js`, `tmp_readme.md` 루트 방치 | Low |

**결론**: 테스트 그린화 + 스타일링 의사결정이 **모든 다른 작업의 전제**다. 이걸 먼저 잡지 않으면 어떤 리팩토링도 회귀 원인을 분간할 수 없다.

---

## 1. Phase 0 — 기준선 확보 (1.5~2일, 선결 필수)

> 이 단계 전에는 다른 어떤 리팩토링도 시작하지 않는다.

### 0-1. 깨진 4 suite 그린화 (qa 우선 #0)
- 대상: `accessibility-auditor.test.ts`, `accessibility-auditor.spa.test.ts`, `NotionService.test.ts`, `browser-utils.test.ts`
- 원인:
  - `Violation` 타입에 `platform`, `inspector`, `depth*` 등 신규 필드가 추가되었는데 NotionService 테스트의 `toEqual`이 갱신 안 됨
  - `browser-utils`에서 `channel: 'chrome'` 환경 분기 어서션이 현 구현과 불일치
  - `accessibility-auditor` 두 suite은 fixture/모킹 drift
- 작업: 0.5~1d / 리스크: 낮 / 담당: **qa 주도, audit-dev 협업**

### 0-2. 데드코드 정리 (audit-dev #7)
- 삭제 또는 `scripts/maintenance/` 이동: `/fix-notion.js` (102줄), `/test-notion.js` (13줄)
- `tmp_readme.md` 처리 결정 (보관 vs 삭제 vs README 정식 승격)
- 작업: 0.25d / 리스크: 0

### 0-3. 스타일링 정책 결정 (ui-dev 의사결정)
- `.agent/rules/CSS.md`는 CSS Modules 명시 → **Tailwind/shadcn 제거 방향이 컨벤션 정합**
- 미사용 의존성 정리 후보: `class-variance-authority`, `tailwind-merge`, `@radix-ui/react-{dialog,dropdown-menu,tooltip}` (import 0건)
- 잔류 의존성: `@radix-ui/react-{separator,slot}` 만 실사용
- 작업: 0.5d (결정 회의 + 의존성 정리 dry-run) / 리스크: 중

**Phase 0 완료 게이트**: `npm test` 그린, 데드코드 제거, 스타일링 방향 합의 문서화.

---

## 2. Phase 1 — 안전망 깔기 (2~3일)

### 1-1. kwcag-mapping 단위 테스트 (qa #1)
- 대상: `src/lib/kwcag-mapping.ts` (455줄, 테스트 0건)
- 형태: table-driven 테스트 — 주요 axe ruleId 30개 + unknown fallback (`'기타'`) 동작
- 명분: "raw axe 금지" 게이트의 회귀가 즉시 보고서로 새는 걸 방지
- 작업: 0.5d / 리스크: 낮

### 1-2. AuditExecutor ↔ NotionService 통합 픽스처 (qa #2~#3)
- `AuditResult` 픽스처 1개 정의 → `AuditExecutor.runAudit` 결과 / `NotionService.saveAuditResult` 입력 / `excel-generator` 입력 3자 동시 통과 검증
- Notion 청킹 경계 케이스 (>100 blocks, 2000자 surrogate pair) 명시적 커버
- `Violation`/`AuditResult`에 옵션 필드(`summary.spa`, `warnings`, `screenshotUrl`) 직렬화/역직렬화 검증
- 작업: 1~1.5d / 리스크: 중

### 1-3. 핵심 `any` 제거 (audit-dev #4 부분)
- `kwcag-mapping.ts:419` `violations: any[]` → `axe.Result[]`
- `AuditExecutor.ts:28` `onProgress: any` → `ProgressEvent` discriminated union 정의
- `NotionService.ts:424,716` `notion.request as any` 타입화
- `github/dispatch/route.ts:80` `error: any`, `(run: any)` 타입화
- 작업: 0.5d / 리스크: 낮

**Phase 1 완료 게이트**: 1-1 ~ 1-3 모두 그린, 신규 안전망이 다음 단계 회귀 감지에 작동.

---

## 3. Phase 2 — 공통 추출 / 중복 제거 (3~4일)

### 2-1. `lib/runtime-config.ts` 도출 (audit-dev #2)
- 산재: `AuditExecutor.ts:73,528`, `crawler.ts:481`, `browser-utils.ts:13` — `process.env.VERCEL` 분기 4곳
- 산출: `getRuntimeProfile()` → `{maxDepth, maxPages, crawlConcurrency, gotoTimeoutMs}` 단일 객체
- 동시 추출: `buildExcludePatterns(userInput)` — `runAudit` ↔ `runCrawlAltTextAudit`에 50줄 복붙 제거
- 작업: 0.75d / 리스크: 중 (Vercel/로컬 timeout 회귀 가능 → Phase 1-2 픽스처로 검증)

### 2-2. `lib/waf-detector.ts` 추출 (audit-dev #1 일부)
- 중복: `crawler.ts:386-409` ↔ `accessibility-auditor.ts:201-223`
- 산출: Cloudflare/WAF 챌린지 감지 + 백오프 로직 단일 모듈
- 작업: 0.5d / 리스크: 낮 (최근 추가된 commit a9f5940/59ee490 핵심 자산 — 단위 테스트 동시 작성)

### 2-3. `lib/api-helpers.ts` (audit-dev #6)
- 중복: `history/save`, `alttext/save` 등에서 `baseOrigin` 계산 동일 코드
- 응답 shape 불일치: `{error}` vs `{error, details}` vs `{message}` 혼재
- 산출: `apiError(status, code, msg)`, `resolveBaseOrigin(req)` 헬퍼
- 작업: 0.5d / 리스크: 낮

### 2-4. 공통 컴포넌트 단일화 (ui-dev #2)
- `src/components/ui/Button.tsx`, `Card.tsx`에 legacy + ShadButton/ShadCard 이중 정의 → **ShadButton/ShadCard 미사용으로 전량 제거**, legacy 단일 유지
- `fullWidth`를 인라인 style 분기 → modifier class로
- 호출부 import 일괄 치환
- 작업: 1d / 리스크: 낮

**Phase 2 완료 게이트**: 추출된 공통 모듈이 단위 테스트 동반, 호출처에서 중복 코드 0회.

---

## 4. Phase 3 — God Module 분해 (1.5~2주)

> 안전망(Phase 1)과 공통 추출(Phase 2)이 끝난 뒤에야 진입.

### 3-1. `crawler.ts` 분리 (audit-dev #1)
- 803줄 → `lib/crawler/{core,sitemap,spa-discovery,history-hook}.ts` 4개 모듈
- WAF 감지는 이미 Phase 2-2에서 추출 완료
- 작업: 3~4d / 리스크: **상** (모든 진단의 spine, SPA 자동감지 회귀 가능)
- 안전망: 기존 `crawler.spa.test.ts` + 신규 `crawler.core.test.ts`/`history-hook.test.ts`

### 3-2. `AuditExecutor.ts` phase 모듈화 (audit-dev #3)
- 655줄, `runAudit` 단일 함수 430줄 → `services/audit/phases/{login,crawl,a11y,seo,summarize}.ts`
- 브라우저 ctx 생성 코드 3중 중복 → `lib/browser-session.ts`
- abort 부분 결과 반환 계약(L431-454) **반드시 보존**
- 작업: 3~4d / 리스크: **상**

### 3-3. `NotionService.ts` 도메인 분리 (audit-dev #5)
- 742줄, audit/alt-text 두 도메인이 한 클래스 → `NotionAuditWriter` / `NotionAltTextWriter` 분리
- 청킹 로직 → `notion-blocks.ts` 공통화 (100블록 / 2000자 / surrogate pair 처리 보존)
- 작업: 1.5~2d / 리스크: 중

### 3-4. `ReportViewer` 분해 (ui-dev 중간 #5)
- 621줄에 필터·페이지네이션·탭·내보내기(JSON/Excel/PDF/Notion)·모달 일체 → `.agent/rules/components/{pagination,tab}.md` 패턴별 분리
- 작업: 1.5d / 리스크: 중

**Phase 3 완료 게이트**: 분리된 모든 모듈에 단위 테스트, Phase 1-2 픽스처가 그대로 통과.

---

## 5. Phase 4 — UI 정합성 / 접근성 (3~5일)

### 4-1. 시맨틱 / a11y 위반 수정 (ui-dev #3, 자기 도그푸딩)
- `report/checklist/page.tsx:177-192` `<div onClick>` 4개 → `<button>`
- `ViolationDetailModal.tsx` overlay → focus trap / aria-modal / focus return / cleanup 중복 제거 (L46-49 버그)
- `AuditConfigForm.tsx:46-67` PC/Mobile 토글 → `role="radiogroup"` + `aria-checked`
- 작업: 1.5d / 리스크: 낮~중 (모달 회귀 테스트 필수)

### 4-2. 인라인 스타일 → CSS 변수 (ui-dev #1)
- 우선 대상: `src/app/page.tsx`, `AuditConfigForm.tsx`, `Sidebar.tsx`
- raw hex (`#111827`/`#6b7280`/`#ef4444`/`#9ca3af`) → `globals.css`의 `--c-*` 토큰
- `globals.css` 이중 토큰(shadcn HSL + 레거시 `--c-*`) → `--c-*` 단일화
- 작업: 1.5~2d / 리스크: 중 (시각 회귀)

### 4-3. 도메인 경계 정상화 (ui-dev 중간 #1)
- `features/audit/AuditConfigForm`, `features/alttext/AltTextAuditForm` → `@/app/page.module.css` import 제거 (역방향 의존)
- 각 features 자체 module로 이전
- 작업: 0.5d / 리스크: 낮

### 4-4. `'use client'` 축소 (ui-dev 중간 #2)
- 23개 페이지/컴포넌트 중 인터랙션 없는 항목 식별 → 서버 컴포넌트화
- `app/help`, `app/report/[id]/error.tsx` 우선 검토
- 작업: 0.75d / 리스크: 낮

### 4-5. SCSS 통일 (ui-dev 중간 #3)
- `HistoryList.module.scss` 단 1개 → `.module.css`
- `sass` devDependency 제거 가능성 검토
- 작업: 0.25d / 리스크: 0

**Phase 4 완료 게이트**: 인라인 `style={{}}` 0회, `<div onClick>` 0회, 모달 focus trap 통과, axe-self-audit 무위반.

---

## 6. 의존 그래프 (왜 이 순서인가)

```
Phase 0 (테스트 그린 + 데드코드 + 스타일 정책)
   │
   ├─→ Phase 1 (kwcag-mapping 단위 + AuditResult 픽스처 + any 제거)
   │      │
   │      └─→ Phase 2-1 runtime-config ──┐
   │      └─→ Phase 2-2 waf-detector ────┤
   │      └─→ Phase 2-3 api-helpers ─────┼─→ Phase 3 (God module 분해)
   │      └─→ Phase 2-4 공통 컴포넌트 ───┘            │
   │                                                  │
   └─→ Phase 4 (UI 정합성) ←─────────────────────────┘
```

- Phase 0 미완 → 어디서 깨졌는지 분간 불가 → 모든 후속 차단
- Phase 1 미완 → Phase 3에서 회귀 감지 못함 → 매우 위험
- Phase 2 미완 → Phase 3에서 같은 코드를 두 번 분해하게 됨
- Phase 4는 Phase 1-2와 병렬 가능, Phase 3 ReportViewer 분해와는 직렬

---

## 7. 손대면 위험한 핫스팟

| 영역 | 위험 | 보호 장치 |
|------|------|-----------|
| `crawler.ts` History API hook (L78-140 + L750-797) | SPA 자동발견 핵심, binding silent 실패 | 동일 정확도 단위 테스트 선행 |
| `AuditExecutor` abort 흐름 (L431-454) | 부분 결과 반환 계약 깨지면 UX 회귀 | Phase 1-2 픽스처에 abort 케이스 포함 |
| `NotionService` 청킹 (100블록/2000자 한계) | Notion API 하드 제한 | `notion-blocks.ts` 추출 시 surrogate pair 처리(L367) 보존 |
| `process.env.VERCEL` 분기 통합 | 로컬/prod 다른 코드 패스 | 양쪽 timeout/concurrency 회귀 테스트 필수 |
| `kwcag-mapping` `'기타'` fallback (L440-451) | 즉시 제거 시 미매핑 axe 룰이 UI에서 사라짐 | 통계 노출 1주 → 단계적 폐기 |
| `AuditOverlay` + SSE (commit 67c82f3) | progress 스트림 강결합, 구독/언마운트 회귀 | mock SSE 통합 테스트 선행 |
| `layout.tsx` + Sidebar `--sidebar-width` | localStorage / `documentElement.style` 직접 조작, SSR hydration mismatch | 서버 컴포넌트화 금지 |
| `app/report/[id]/loading.tsx`, `error.tsx` | Next 16 segment-level UI 규약 | 디렉토리 이동 금지 |

---

## 8. 일정 / 비용 추정

| Phase | 작업량 | 누적 |
|-------|--------|------|
| 0 — 기준선 확보 | 1.5~2d | 2d |
| 1 — 안전망 | 2~3d | 5d |
| 2 — 공통 추출 | 3~4d | 9d |
| 3 — God module 분해 | 8~11d | 20d |
| 4 — UI 정합성 | 4~5d | 25d |

**총 4~5주 (1인 풀타임 기준)**. Phase 1과 Phase 4 일부는 audit-dev / ui-dev 병렬 가능 → 2인 작업 시 3~3.5주.

---

## 9. 다음 액션 (즉시 가능)

체크리스트:
- [ ] **Phase 0-1 그린화**: `qa` 에이전트에 깨진 4 suite 수정 위임
- [ ] **Phase 0-2 데드코드 정리**: `audit-dev`에 `fix-notion.js` / `test-notion.js` / `tmp_readme.md` 처리 위임
- [ ] **Phase 0-3 스타일링 정책 결정 회의**: Tailwind/shadcn 제거 가닥 — 의사결정 컨펌 후 의존성 dry-run
- [ ] Phase 1 진입 전에 위 3건 모두 머지 확인

---

## 부록 A. 검토했지만 우선순위 낮음

- `seo-analyzer.ts` (1336줄): God module이지만 11개 카테고리가 자연 경계, SEO 도메인 별도 진단으로 분리
- `spa-readiness.ts` (248줄): 단일 책임 양호, 손대지 않음
- `cost-calculator.ts` (194줄), `ai-prompt-generator.ts` (150줄): 안정적, 의존성 적음
- `custom-rules.ts` (137줄): `helpUrl`의 `antigravity` placeholder 교체만 필요
- `next.config.ts` `puppeteer-core`: 실 사용 흔적 없음 → 제거 후보
- jest ESM 우회 (`@capyseo/core` 등 dist 리매핑): 외부 ESM-only 한계로 현 시점 합리적, `experimental-vm-modules` 전환은 별도 트랙
- 테스트 위치 불일치 (`NotionService.test.ts`만 옆에): 그린화 후 일괄 정리

## 부록 B. 분석 입력 출처

- `audit-dev` 분석 (감사 엔진/서비스/API 레이어) — 2026-05-06
- `ui-dev` 분석 (UI/컴포넌트/페이지 레이어, .agent/rules/ 위반 점검) — 2026-05-06
- `qa` 분석 (테스트 커버리지/경계 계약/`npm test` 현황) — 2026-05-06
- 통합: etrial-dev 오케스트레이션
