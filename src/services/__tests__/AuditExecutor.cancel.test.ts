/**
 * AuditExecutor.runAudit — 취소(abort) 흐름 테스트
 *
 * WebCrawler / AccessibilityAuditor / SEOAuditService 등은 모두 모킹.
 * runAudit 이 AbortSignal 을 받아 워커가 break 하고 부분 결과를 반환하는지,
 * crawler/auditor 가 finally 에서 close 되는지 검증한다.
 */

import type { AuditConfig, PageInfo } from '@/types';

const mockCrawlerInit = jest.fn().mockResolvedValue(undefined);
const mockCrawlerClose = jest.fn().mockResolvedValue(undefined);
const mockCrawlerLoadStorageState = jest.fn().mockResolvedValue(undefined);
const mockCrawl = jest.fn();

jest.mock('@/lib/crawler', () => ({
  WebCrawler: jest.fn().mockImplementation(() => ({
    init: mockCrawlerInit,
    close: mockCrawlerClose,
    loadStorageState: mockCrawlerLoadStorageState,
    crawl: (...args: unknown[]) => mockCrawl(...args),
  })),
}));

const mockAuditorInit = jest.fn().mockResolvedValue(undefined);
const mockAuditorClose = jest.fn().mockResolvedValue(undefined);
const mockAuditorLoadStorageState = jest.fn().mockResolvedValue(undefined);
const mockAuditPage = jest.fn();
const mockGetBrowser = jest.fn().mockReturnValue(null);

jest.mock('@/lib/accessibility-auditor', () => ({
  AccessibilityAuditor: jest.fn().mockImplementation(() => ({
    init: mockAuditorInit,
    close: mockAuditorClose,
    loadStorageState: mockAuditorLoadStorageState,
    auditPage: (...args: unknown[]) => mockAuditPage(...args),
    getBrowser: mockGetBrowser,
  })),
}));

jest.mock('@/lib/browser-utils', () => ({
  getBrowserErrorGuide: (e: unknown) => `guide:${(e as Error).message}`,
  getBrowserLaunchOptions: jest.fn().mockResolvedValue({ headless: true }),
}));

jest.mock('@/services/SEOAuditService', () => ({
  seoAuditService: {
    runFullAudit: jest.fn().mockResolvedValue({ score: 0 }),
  },
}));

jest.mock('playwright-core', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock('@/lib/alt-text-validator', () => ({
  scanPageForAltMismatches: jest.fn(),
  shutdownSharedWorkerPool: jest.fn().mockResolvedValue(undefined),
}));

import { runAudit } from '../AuditExecutor';

function makePages(n: number): PageInfo[] {
  return Array.from({ length: n }).map((_, i) => ({
    url: `https://example.com/p${i}`,
    title: `Page ${i}`,
    depth1: '',
    depth2: '',
    depth3: '',
    depth4: '',
  }));
}

const baseConfig = (overrides: Partial<AuditConfig> = {}): AuditConfig => ({
  targetUrl: 'https://example.com',
  enableLogin: false,
  enableAccessibilityCheck: true,
  enableSEOCheck: false,
  enableAICheck: false,
  platform: 'PC',
  inspector: 'tester',
  ...overrides,
});

describe('runAudit — abort/cancel 흐름', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('crawl 직후 signal 이 aborted 면 워커가 동작하지 않고 부분 결과를 반환한다', async () => {
    mockCrawl.mockResolvedValue({
      pages: makePages(3),
      totalFound: 3,
      errors: [],
      sourceCounts: { fromCrawl: 2, fromSitemap: 0 },
    });

    const controller = new AbortController();
    controller.abort(); // crawl 호출 후 워커 진입 전에 이미 aborted 인 것처럼

    const result = await runAudit(baseConfig(), undefined, controller.signal);

    // crawl 은 호출되었지만 auditPage 는 호출되지 않아야 함 — aborted 라 워커가 break
    expect(mockCrawl).toHaveBeenCalled();
    expect(mockAuditPage).not.toHaveBeenCalled();

    // 부분 결과: violations 0건, warnings 에 취소 메시지
    expect(result.violations).toHaveLength(0);
    expect(result.warnings && result.warnings[0]).toMatch(/취소/);
    expect(result.totalPages).toBe(3); // crawl 결과는 보존
  });

  test('정상 흐름(signal 미전달) 에서는 워커가 모든 페이지를 처리한다', async () => {
    mockCrawl.mockResolvedValue({
      pages: makePages(2),
      totalFound: 2,
      errors: [],
      sourceCounts: { fromCrawl: 1, fromSitemap: 0 },
    });
    mockAuditPage.mockResolvedValue({
      url: 'x',
      title: 't',
      violations: [],
      screenshotPaths: [],
      timestamp: new Date().toISOString(),
      status: 'success',
    });

    const result = await runAudit(baseConfig());

    expect(mockAuditPage).toHaveBeenCalledTimes(2);
    expect(result.warnings).toBeUndefined();
  });

  test('finally 에서 crawler/auditor 모두 close 가 보장된다 — 정상 종료', async () => {
    mockCrawl.mockResolvedValue({
      pages: makePages(1),
      totalFound: 1,
      errors: [],
      sourceCounts: { fromCrawl: 0, fromSitemap: 0 },
    });
    mockAuditPage.mockResolvedValue({
      url: 'x',
      title: 't',
      violations: [],
      screenshotPaths: [],
      timestamp: new Date().toISOString(),
      status: 'success',
    });

    await runAudit(baseConfig());

    expect(mockCrawlerClose).toHaveBeenCalled();
    expect(mockAuditorClose).toHaveBeenCalled();
  });

  test('finally 에서 close 가 보장된다 — abort 흐름', async () => {
    mockCrawl.mockResolvedValue({
      pages: makePages(2),
      totalFound: 2,
      errors: [],
      sourceCounts: { fromCrawl: 1, fromSitemap: 0 },
    });
    const controller = new AbortController();
    controller.abort();

    await runAudit(baseConfig(), undefined, controller.signal);

    expect(mockCrawlerClose).toHaveBeenCalled();
    expect(mockAuditorClose).toHaveBeenCalled();
  });
});
