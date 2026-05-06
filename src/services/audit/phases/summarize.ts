/**
 * Phase: 결과 집계 (순수 함수에 가까움).
 *
 * `runAudit` 의 후반부(약 312~420 LOC)에서 추출:
 *   1) byPrinciple / byImpact / byKwcagItem 집계
 *   2) reliability 메트릭 (pagesAudited / pagesFailed / pagesPartial / avgDomNodes / avgHydrationMs)
 *   3) SPA summary (detectedFramework / renderStrategy / suspectedSpa / routes 출처 카운트)
 *   4) warnings (라우트 0개, SPA 의심 + partial 페이지 존재 등)
 *   5) abort 시 취소 메시지 unshift
 *
 * 이 phase 는 IO 가 없는 순수 함수라 단위 테스트 부담이 가장 적다.
 */
import type {
  AuditResult,
  AuditReliabilitySummary,
  AuditSpaSummary,
  RenderStrategyLabel,
  SpaFrameworkLabel,
  Violation,
} from '@/types';
import type { SummarizePhaseInput } from '../types';

export interface SummarizePhaseResult {
  summary: AuditResult['summary'];
  warnings: string[];
}

/**
 * 위반 목록과 페이지 진단 결과로부터 AuditResult 의 summary 와 warnings 를 생성.
 *
 * abort 흐름에서도 호출 가능하다 — 취소 시 호출자가 warnings 의 첫 줄에 취소 메시지를
 * unshift 하도록, 본 함수는 abort 여부에 따라 추가 메시지를 노출한다.
 */
export function summarize(input: SummarizePhaseInput): SummarizePhaseResult {
  const {
    needsCrawl,
    needsAccessibility,
    pages,
    violations,
    pageAuditResults,
    routeSourceCounts,
    signal,
  } = input;

  // ── reliability / SPA 메트릭 ────────────────────────────────────────────
  let reliability: AuditReliabilitySummary | undefined;
  let spaSummary: AuditSpaSummary | undefined;

  if (pageAuditResults.length > 0) {
    const pagesAudited = pageAuditResults.length;
    const pagesFailed = pageAuditResults.filter((r) => r.status === 'failed').length;
    const pagesPartial = pageAuditResults.filter((r) => r.status === 'partial').length;

    const domNodes = pageAuditResults
      .map((r) => r.domNodeCount)
      .filter((n): n is number => typeof n === 'number');
    const hydrations = pageAuditResults
      .map((r) => r.hydrationMs)
      .filter((n): n is number => typeof n === 'number');
    const avgDomNodes = domNodes.length
      ? Math.round(domNodes.reduce((a, b) => a + b, 0) / domNodes.length)
      : 0;
    const avgHydrationMs = hydrations.length
      ? Math.round(hydrations.reduce((a, b) => a + b, 0) / hydrations.length)
      : 0;

    reliability = {
      pagesAudited,
      pagesFailed,
      pagesPartial,
      avgDomNodes,
      avgHydrationMs,
    };

    // 프레임워크 / 렌더 전략 — 다수결 (unknown 제외)
    const frameworkCounts = new Map<SpaFrameworkLabel, number>();
    const renderCounts = new Map<RenderStrategyLabel, number>();
    for (const r of pageAuditResults) {
      if (r.framework && r.framework !== 'unknown') {
        frameworkCounts.set(r.framework, (frameworkCounts.get(r.framework) || 0) + 1);
      }
      if (r.renderStrategy && r.renderStrategy !== 'unknown') {
        renderCounts.set(r.renderStrategy, (renderCounts.get(r.renderStrategy) || 0) + 1);
      }
    }
    const detectedFramework: SpaFrameworkLabel =
      [...frameworkCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    const renderStrategy: RenderStrategyLabel =
      [...renderCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';

    const suspectedSpa =
      detectedFramework !== 'unknown' ||
      (avgDomNodes > 0 && avgDomNodes < 30 && pages.length === 1) ||
      (routeSourceCounts.fromCrawl === 0 && pages.length <= 1);

    spaSummary = {
      detectedFramework,
      renderStrategy,
      suspectedSpa,
      routesFromCrawl: routeSourceCounts.fromCrawl,
      routesFromSitemap: routeSourceCounts.fromSitemap,
    };
  }

  // ── warnings ────────────────────────────────────────────────────────────
  const warnings: string[] = [];
  if (needsCrawl && pages.length === 0) {
    warnings.push(
      '라우트를 발견하지 못했습니다. SPA 사이트라면 "SPA 모드"를 켜고 다시 진단해주세요.',
    );
  } else if (
    needsAccessibility &&
    violations.length === 0 &&
    spaSummary?.suspectedSpa &&
    reliability &&
    reliability.pagesPartial > 0
  ) {
    warnings.push(
      'SPA로 의심되는 사이트에서 일부 페이지의 진단 신뢰도가 낮습니다. 결과의 "부분" 표시를 확인해주세요.',
    );
  }

  // 사용자 취소 시 그 시점까지의 결과를 부분 보고서로 반환
  if (signal?.aborted) {
    warnings.unshift(
      `사용자가 진단을 취소했습니다. 현재까지 발견된 ${pages.length}개 페이지·${violations.length}건 위반만 표시됩니다.`,
    );
  }

  // ── 위반 집계 ───────────────────────────────────────────────────────────
  const summary: AuditResult['summary'] = {
    byPrinciple: {} as Record<string, number>,
    byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<string, number>,
    byKwcagItem: {} as Record<string, number>,
    reliability,
    spa: spaSummary,
  };

  for (const v of violations as Violation[]) {
    summary.byPrinciple[v.principle] = (summary.byPrinciple[v.principle] || 0) + 1;
    summary.byImpact[v.impact] = (summary.byImpact[v.impact] || 0) + 1;
    summary.byKwcagItem[v.kwcagId] = (summary.byKwcagItem[v.kwcagId] || 0) + 1;
  }

  return { summary, warnings };
}

/**
 * abort 흐름의 catch 블록에서 사용하는 최소 부분 결과 빌더.
 *
 * runAudit 의 try 본문이 throw 했지만 signal 이 aborted 인 경우, summarize() 보다
 * 더 적은 정보(violation 집계만)로도 부분 결과를 만들어야 해 별도 함수로 분리.
 */
export function buildAbortPartialSummary(pages: number, violations: number): {
  summary: AuditResult['summary'];
  warnings: string[];
} {
  return {
    summary: {
      byPrinciple: {},
      byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      byKwcagItem: {},
    },
    warnings: [
      `사용자가 진단을 취소했습니다. 현재까지 발견된 ${pages}개 페이지·${violations}건 위반만 표시됩니다.`,
    ],
  };
}
