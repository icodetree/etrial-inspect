# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

E-Tribe internal tool that audits client websites for **KWCAG 2.1/2.2 accessibility**, **SEO**, and **GEO (AI-friendliness)**, then exports Notion / Excel / PDF reports. Stack: Next.js 16 App Router, React 19, TypeScript strict, Playwright + axe-core. Korean is the primary language for docs, UI strings, and commit messages.

## Common commands

```bash
npm run dev              # next dev (http://localhost:3000)
npm run build            # next build (also runs type check via tsc plugin)
npm run start            # production server
npm run lint             # eslint (next/core-web-vitals + next/typescript)
npm test                 # jest (node env)
npm test -- --testPathPattern=<file>   # single test file
npm test -- --coverage   # coverage

# Headless audit run (used by GitHub Actions CI):
TARGET_URL=https://example.com npx tsx scripts/run-audit.ts
```

`postinstall` runs `playwright install chromium` automatically. The repo also bundles `eng.traineddata` / `kor.traineddata` at the root for Tesseract OCR — do not delete them, image-alt-text validation depends on them.

## Architecture

### Audit flow (the spine of the codebase)

```
AuditConfig (UI form / scripts/run-audit.ts)
  → src/services/AuditExecutor.ts        # orchestrator, emits progress events
  → src/lib/crawler.ts                   # Playwright crawler, sitemap.xml fallback, SPA-aware
  → src/lib/accessibility-auditor.ts     # axe-core run + custom rules
  → src/lib/custom-rules.ts              # KWCAG-specific rules not covered by axe
  → src/lib/kwcag-mapping.ts             # axe ruleId → KWCAG 2.1/2.2 항목 (REQUIRED conversion)
  → src/lib/seo-analyzer.ts              # @capyseo/core + seo-analyzer wrapper
  → AuditResult (src/types/index.ts)
      → src/services/notion/NotionService.ts   # save report to Notion
      → src/lib/excel-generator.ts             # multi-sheet xlsx
      → src/lib/pdf-report-generator.ts        # PDF
```

**Hard rule:** never surface raw axe-core results to UI / reports. Every violation must pass through `kwcag-mapping.ts` first. The UI assumes KWCAG-shaped data.

### SPA support (recent, non-obvious)

Recent commits added auto-SPA detection — there is no longer a manual `isSpa` toggle. The crawler probes the first page's framework and branches:
- `src/lib/spa-readiness.ts` waits for hydration before snapshotting.
- `src/lib/crawler.ts` discovers SPA routes via runtime DOM inspection in addition to sitemap.xml.
- Confidence metadata is attached to each crawled page; downstream services may use it.

When debugging "missing pages on a SPA," start with `spa-readiness.ts` and the SPA tests in `src/lib/__tests__/{accessibility-auditor,crawler}.spa.test.ts`.

### Environment-dependent limits

`AuditExecutor` and `crawler` branch on `process.env.VERCEL === '1'` (and Lambda) to lower `maxDepth` / `maxPages` / per-page timeouts so audits stay within serverless time budgets. Local dev gets the full traversal. When changing limits, change *both* paths or you'll get parity bugs only in prod.

### Notion integration constraints

`NotionService.saveAuditResult()` chunks JSON into ≤100 blocks per Notion API call (Notion's hard limit). Don't bypass the chunker even for "small" reports — large violation lists are common. Notion failures must log and continue, not abort the audit (see `audit-dev` agent rules).

### Heavy native deps & Next bundling

`next.config.ts` lists `serverExternalPackages` (playwright-core, @sparticuz/chromium, tesseract.js, sharp, axe-core, seo-analyzer family). When adding a package that depends on native binaries or that pulls in fs/path at module load, you almost certainly need to add it here too — otherwise Next 16's bundler will choke at build time.

`outputFileTracingIncludes` for `/api/**` explicitly bundles the Chromium binary, Tesseract worker, and `public/tessdata/**`. Screenshots are excluded from tracing to keep deploy size down.

## TypeScript / paths / tests

- `@/*` → `./src/*` is the only path alias. Honor it; don't reach with `../../../`.
- Strict mode is on. `noEmit` is true (Next + tsc plugin handles emit).
- Jest's `moduleNameMapper` re-points three packages (`@capyseo/core`, `@houtini/geo-analyzer`, `seo-analyzer`) directly at their built `dist/index.js` because they ship ESM that ts-jest can't transform. If you add a similar ESM-only package and tests fail at import, follow the same pattern in `jest.config.js` and update `transformIgnorePatterns`.
- Test locations are inconsistent: most live in `src/lib/__tests__/` and `src/services/__tests__/`, but `NotionService.test.ts` sits next to its source. Match the surrounding convention rather than relocating.

## Coding conventions (`.agent/rules/`)

`.agent/rules/Index.md` declares `trigger: always_on`. These docs are the source of truth for HTML/CSS/naming/a11y conventions used in this codebase — not generic React or Tailwind defaults. Before writing UI code, consult the relevant file:

- HTML / semantic tags / CSS / naming: `Coding-Style.md`, `HTML.md`, `HTML-Semantic-Tags.md`, `CSS.md`, `Naming.md`, `UI-Structure.md`
- Accessibility: `Accessibility-Basic.md`, `Accessibility-Components.md`, `Accessibility-Checklist2.1.md`, `WAI-ARIA.md`
- Per-component a11y patterns (button, form, table, tab, select, checkbox, pagination, switch): `.agent/rules/components/`

Use **CSS Modules** (`.module.css` / `.module.scss`) — no inline styles. Use `globals.css` CSS variables for tokens. `'use client'` only when actually needed.

## Agent team (`.claude/agents/`)

Three specialist subagents are configured for this repo. Use them via the Agent tool when the task fits:

- **audit-dev** — `src/lib/`, `src/services/`, `src/app/api/`, `.github/workflows/`. Owns the audit engine, Notion/GitHub integration, KWCAG mapping.
- **ui-dev** — `src/features/`, `src/components/`, `src/app/page.tsx`, CSS modules. Must follow `.agent/rules/`.
- **qa** — runs Jest, performs **boundary-crossing checks** (e.g., `AuditExecutor` output shape vs. `NotionService` input vs. UI props), verifies KWCAG checklist items.

Inter-agent handoffs are written to `_workspace/{audit-dev,ui-dev,qa}-output.md`. When orchestrating work yourself, follow the same protocol so subagents have continuity.

Project-local skills (`.claude/skills/`): `etrial-dev` (orchestrator), `feature-plan` (TDD planning → `docs/plans/PLAN_*.md`), `a11y-guide` (KWCAG coding helper).

## Current status (2026-05-08, v2.5.0)

운영 중: 접근성 진단(KWCAG 2.2), SEO, AI 친화도, 이미지 OCR 진단, Claude Vision AI 정밀 분석(유료 옵션), Notion/Excel/PDF 리포트, SSE 실시간 진행률, SPA 자동 감지, Notion API 재시도(exponential backoff), 비교 분석(/report/compare), 크롤링 메모리 최적화(페이지 풀링+적응적 동시성).

3순위 완료 (2026-05-08): 비교 분석(diff 로직 + 비교 페이지 + 히스토리 비교 선택), 크롤링 메모리 최적화(memory-monitor + 페이지 풀링 + 적응적 동시성 + 컨텍스트 정리). 전체 테스트 461개 통과.

이미지 OCR 매칭률: 전체 25.3%, 텍스트 이미지 35.4% (lottegrs.com 33p/470img 기준). Claude Vision 1회 비용 ~$0.50.

미개발: PDF 제안서(2~3d, 착수 가능), KWCAG 체크리스트 페이지(1~2d), 대규모 리팩토링(Phase 0 미착수).

상세 현황: `docs/STATUS.md` / 완료 이력: `docs/history/` / 미개발: `docs/pending/`

## Things that look weird but are intentional

- `auth_state.json` at the repo root — Playwright storage state for crawling sites behind login. Don't commit credentials into it; treat it as local dev state.
- `.next/` and `tsconfig.tsbuildinfo` are present locally; both are gitignored.
- `tmp_readme.md` is a scratch file kept around as a working draft, not the canonical README.
