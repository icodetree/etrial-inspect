/**
 * `summarize` 순수 함수 단위 테스트.
 *
 * AuditExecutor 분해의 일부로 추출된 집계 함수를 외부 의존 없이 검증.
 * (PageAuditResult / Violation 픽스처를 인라인으로 구성)
 */
import type { PageAuditResult } from '@/lib/accessibility-auditor';
import type { PageInfo, Violation } from '@/types';
import { buildAbortPartialSummary, summarize } from '../summarize';

const makePage = (url: string): PageInfo => ({
  url,
  title: url,
  depth1: '',
  depth2: '',
  depth3: '',
  depth4: '',
});

const makeViolation = (overrides: Partial<Violation> = {}): Violation => ({
  pageUrl: 'https://example.com/p1',
  pageTitle: 'p1',
  depth1: '',
  depth2: '',
  depth3: '',
  depth4: '',
  platform: 'PC',
  inspector: '시스템',
  inspectionDate: '2026-05-06',
  violationNumber: 1,
  kwcagId: '5.3.1',
  kwcagName: '대체 텍스트 제공',
  principle: '인식의 용이성',
  axeRuleId: 'image-alt',
  description: '이미지에 대체 텍스트가 없음',
  impact: 'serious',
  affectedCode: '<img>',
  help: '',
  helpUrl: '',
  selector: 'img',
  occurrenceCount: 1,
  isCommon: false,
  ...overrides,
});

const makePageAuditResult = (overrides: Partial<PageAuditResult> = {}): PageAuditResult => ({
  url: 'https://example.com/p1',
  title: 'p1',
  violations: [],
  screenshotPaths: [],
  timestamp: new Date().toISOString(),
  status: 'success',
  ...overrides,
});

describe('summarize — 위반 집계', () => {
  it('byPrinciple/byImpact/byKwcagItem 카운트 정확성', () => {
    const violations: Violation[] = [
      makeViolation({ principle: '인식의 용이성', impact: 'critical', kwcagId: '5.3.1' }),
      makeViolation({ principle: '인식의 용이성', impact: 'serious', kwcagId: '5.3.1' }),
      makeViolation({ principle: '운용의 용이성', impact: 'moderate', kwcagId: '6.1.1' }),
      makeViolation({ principle: '운용의 용이성', impact: 'minor', kwcagId: '6.1.1' }),
    ];

    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('https://example.com')],
      violations,
      pageAuditResults: [],
      routeSourceCounts: { fromCrawl: 1, fromSitemap: 0 },
    });

    expect(summary.byPrinciple['인식의 용이성']).toBe(2);
    expect(summary.byPrinciple['운용의 용이성']).toBe(2);
    expect(summary.byImpact.critical).toBe(1);
    expect(summary.byImpact.serious).toBe(1);
    expect(summary.byImpact.moderate).toBe(1);
    expect(summary.byImpact.minor).toBe(1);
    expect(summary.byKwcagItem['5.3.1']).toBe(2);
    expect(summary.byKwcagItem['6.1.1']).toBe(2);
  });

  it('byImpact 는 누락 카테고리도 0 으로 초기화', () => {
    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: false,
      needsAccessibility: false,
      pages: [],
      violations: [],
      pageAuditResults: [],
      routeSourceCounts: { fromCrawl: 0, fromSitemap: 0 },
    });
    expect(summary.byImpact).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
  });
});

describe('summarize — reliability 메트릭', () => {
  it('pagesAudited/pagesFailed/pagesPartial 분포 + 평균값 계산', () => {
    const pageAuditResults: PageAuditResult[] = [
      makePageAuditResult({ status: 'success', domNodeCount: 200, hydrationMs: 100 }),
      makePageAuditResult({ status: 'partial', domNodeCount: 100, hydrationMs: 200 }),
      makePageAuditResult({ status: 'failed', domNodeCount: 50 }),
    ];

    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('https://example.com')],
      violations: [],
      pageAuditResults,
      routeSourceCounts: { fromCrawl: 3, fromSitemap: 0 },
    });

    expect(summary.reliability).toBeDefined();
    expect(summary.reliability!.pagesAudited).toBe(3);
    expect(summary.reliability!.pagesFailed).toBe(1);
    expect(summary.reliability!.pagesPartial).toBe(1);
    expect(summary.reliability!.avgDomNodes).toBe(Math.round((200 + 100 + 50) / 3));
    // hydrationMs 는 2개만 정의됨 → 평균 150
    expect(summary.reliability!.avgHydrationMs).toBe(150);
  });

  it('pageAuditResults 가 비어있으면 reliability/spa 둘 다 undefined', () => {
    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: false,
      needsAccessibility: false,
      pages: [],
      violations: [],
      pageAuditResults: [],
      routeSourceCounts: { fromCrawl: 0, fromSitemap: 0 },
    });
    expect(summary.reliability).toBeUndefined();
    expect(summary.spa).toBeUndefined();
  });
});

describe('summarize — SPA 메타데이터', () => {
  it('프레임워크/렌더 전략 다수결 — react 다수, CSR 다수', () => {
    const pageAuditResults: PageAuditResult[] = [
      makePageAuditResult({ framework: 'react', renderStrategy: 'CSR', domNodeCount: 100 }),
      makePageAuditResult({ framework: 'react', renderStrategy: 'CSR', domNodeCount: 100 }),
      makePageAuditResult({ framework: 'vue', renderStrategy: 'SSR', domNodeCount: 100 }),
      makePageAuditResult({ framework: 'unknown', renderStrategy: 'unknown', domNodeCount: 100 }),
    ];

    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: pageAuditResults.map((r) => makePage(r.url)),
      violations: [],
      pageAuditResults,
      routeSourceCounts: { fromCrawl: 4, fromSitemap: 0 },
    });

    expect(summary.spa!.detectedFramework).toBe('react');
    expect(summary.spa!.renderStrategy).toBe('CSR');
    expect(summary.spa!.suspectedSpa).toBe(true);
    expect(summary.spa!.routesFromCrawl).toBe(4);
    expect(summary.spa!.routesFromSitemap).toBe(0);
  });

  it('suspectedSpa — 평균 DOM 매우 적음 + 단일 페이지 휴리스틱', () => {
    const pageAuditResults: PageAuditResult[] = [
      makePageAuditResult({ framework: 'unknown', renderStrategy: 'unknown', domNodeCount: 10 }),
    ];

    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('https://example.com')],
      violations: [],
      pageAuditResults,
      routeSourceCounts: { fromCrawl: 1, fromSitemap: 0 },
    });

    expect(summary.spa!.detectedFramework).toBe('unknown');
    // 평균 DOM=10 < 30, pages.length=1 → suspected
    expect(summary.spa!.suspectedSpa).toBe(true);
  });

  it('suspectedSpa — 라우트 발견 0개이고 페이지 ≤ 1 인 경우', () => {
    const pageAuditResults: PageAuditResult[] = [
      makePageAuditResult({ framework: 'unknown', renderStrategy: 'unknown', domNodeCount: 200 }),
    ];

    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('https://example.com')],
      violations: [],
      pageAuditResults,
      routeSourceCounts: { fromCrawl: 0, fromSitemap: 0 },
    });

    expect(summary.spa!.suspectedSpa).toBe(true);
  });

  it('suspectedSpa false — DOM 충분 + 라우트 다수 + 프레임워크 미감지', () => {
    const pageAuditResults: PageAuditResult[] = [
      makePageAuditResult({ framework: 'unknown', renderStrategy: 'unknown', domNodeCount: 500 }),
      makePageAuditResult({ framework: 'unknown', renderStrategy: 'unknown', domNodeCount: 500 }),
    ];

    const { summary } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('a'), makePage('b')],
      violations: [],
      pageAuditResults,
      routeSourceCounts: { fromCrawl: 2, fromSitemap: 0 },
    });

    expect(summary.spa!.suspectedSpa).toBe(false);
  });
});

describe('summarize — warnings 생성', () => {
  it('needsCrawl + 라우트 0개 → "라우트를 발견하지 못했습니다" 경고', () => {
    const { warnings } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [],
      violations: [],
      pageAuditResults: [],
      routeSourceCounts: { fromCrawl: 0, fromSitemap: 0 },
    });
    expect(warnings.some((w) => w.includes('라우트를 발견하지 못했습니다'))).toBe(true);
  });

  it('SPA 의심 + violations 0건 + partial 페이지 존재 → 신뢰도 경고', () => {
    const pageAuditResults: PageAuditResult[] = [
      makePageAuditResult({ status: 'partial', framework: 'react', domNodeCount: 50 }),
    ];

    const { warnings } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('https://example.com')],
      violations: [],
      pageAuditResults,
      routeSourceCounts: { fromCrawl: 1, fromSitemap: 0 },
    });

    expect(warnings.some((w) => w.includes('SPA로 의심되는'))).toBe(true);
  });

  it('signal aborted 시 취소 경고를 첫 줄에 unshift', () => {
    const controller = new AbortController();
    controller.abort();

    const { warnings } = summarize({
      config: { targetUrl: 'https://example.com' } as never,
      needsCrawl: true,
      needsAccessibility: true,
      pages: [makePage('a'), makePage('b')],
      violations: [makeViolation()],
      pageAuditResults: [],
      routeSourceCounts: { fromCrawl: 2, fromSitemap: 0 },
      signal: controller.signal,
    });

    expect(warnings[0]).toMatch(/취소/);
    expect(warnings[0]).toContain('2개 페이지');
    expect(warnings[0]).toContain('1건 위반');
  });
});

describe('buildAbortPartialSummary — catch 블록 안전망', () => {
  it('빈 byPrinciple/byKwcagItem + 0 으로 초기화된 byImpact + 취소 경고', () => {
    const { summary, warnings } = buildAbortPartialSummary(3, 5);
    expect(summary.byPrinciple).toEqual({});
    expect(summary.byKwcagItem).toEqual({});
    expect(summary.byImpact).toEqual({
      critical: 0, serious: 0, moderate: 0, minor: 0,
    });
    expect(warnings[0]).toMatch(/취소/);
    expect(warnings[0]).toContain('3개 페이지');
    expect(warnings[0]).toContain('5건 위반');
  });
});
