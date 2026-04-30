/**
 * AccessibilityAuditor — SPA 통합 거동 테스트
 *
 * waitForSpaReady 와의 연동, status/framework/hydrationMs 가 PageAuditResult 로
 * 전파되는지, 0건+저DOM+감지된 프레임워크 케이스에서 partial 로 강등되는지 검증한다.
 */

const mockScreenshot = jest.fn().mockResolvedValue(undefined);
const mockTitle = jest.fn().mockResolvedValue('SPA Page');
const mockGoto = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockLocator = jest.fn().mockReturnValue({
  first: () => ({ boundingBox: () => Promise.resolve(null) }),
});
const mockEvaluate = jest.fn().mockResolvedValue([]);

const mockPage = {
  goto: mockGoto,
  waitForLoadState: jest.fn().mockResolvedValue(undefined),
  title: mockTitle,
  screenshot: mockScreenshot,
  close: mockClose,
  locator: mockLocator,
  $$: jest.fn().mockResolvedValue([]),
  evaluate: mockEvaluate,
  url: jest.fn().mockReturnValue('https://spa.example.com'),
  keyboard: { press: jest.fn() },
  $: jest.fn().mockResolvedValue(null),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
};

const mockNewPage = jest.fn().mockResolvedValue(mockPage);
const mockNewContext = jest.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: jest.fn().mockResolvedValue(undefined),
  storageState: jest.fn().mockResolvedValue(undefined),
});

jest.mock('playwright-core', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: mockNewContext,
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

const mockAnalyze = jest.fn();
jest.mock('@axe-core/playwright', () => {
  return jest.fn().mockImplementation(() => ({
    withTags: jest.fn().mockReturnThis(),
    analyze: mockAnalyze,
    include: jest.fn().mockReturnThis(),
  }));
});

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    existsSync: jest.fn().mockReturnValue(true),
    mkdirSync: jest.fn(),
    readFileSync: jest.fn().mockReturnValue('/* fake axe */'),
  };
});

jest.mock('../browser-utils', () => ({
  getBrowserLaunchOptions: jest.fn().mockResolvedValue({ headless: true }),
}));

jest.mock('../custom-rules', () => ({
  CUSTOM_RULE_SCRIPT: '(function(){ return []; })()',
}));

const mockWaitForSpaReady = jest.fn();
jest.mock('../spa-readiness', () => ({
  waitForSpaReady: (...args: unknown[]) => mockWaitForSpaReady(...args),
}));

import { AccessibilityAuditor } from '../accessibility-auditor';

describe('AccessibilityAuditor — SPA 통합', () => {
  let auditor: AccessibilityAuditor;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAnalyze.mockResolvedValue({ violations: [] });
    auditor = new AccessibilityAuditor({
      enableDynamicCheck: false,
      screenshotOnViolation: false,
    });
    await auditor.init();
  });

  afterEach(async () => {
    try { await auditor.close(); } catch { /* ignore */ }
  });

  test('정상 SPA — readiness ready + 위반 0 + DOM 충분 → status=success', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      framework: 'react',
      renderStrategy: 'CSR',
      hydrationMs: 1234,
      domNodeCount: 500,
      status: 'ready',
      notes: [],
    });

    const result = await auditor.auditPage('https://spa.example.com');

    expect(result.status).toBe('success');
    expect(result.framework).toBe('react');
    expect(result.renderStrategy).toBe('CSR');
    expect(result.hydrationMs).toBe(1234);
    expect(result.domNodeCount).toBe(500);
    expect(result.violations).toHaveLength(0);
  });

  test('readiness partial → status=partial 로 전파', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      framework: 'react',
      renderStrategy: 'CSR',
      hydrationMs: 5000,
      domNodeCount: 300,
      status: 'partial',
      notes: ['networkidle-timeout'],
    });

    const result = await auditor.auditPage('https://slow-spa.example.com');

    expect(result.status).toBe('partial');
    expect(result.failureReason).toContain('partial');
    expect(result.failureReason).toContain('networkidle-timeout');
  });

  test('위반 0건 + 저-DOM + 프레임워크 감지 → success 가 partial 로 강등', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      framework: 'react',
      renderStrategy: 'CSR',
      hydrationMs: 200,
      domNodeCount: 5, // < 30
      status: 'ready',
      notes: [],
    });

    const result = await auditor.auditPage('https://empty-spa.example.com');

    expect(result.status).toBe('partial');
    expect(result.failureReason).toBe('low-dom-content');
    expect(result.violations).toHaveLength(0);
  });

  test('위반 0건 + 저-DOM + 프레임워크 unknown → success 유지 (정적 사이트 회귀 방지)', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      framework: 'unknown',
      renderStrategy: 'unknown',
      hydrationMs: 100,
      domNodeCount: 5,
      status: 'ready',
      notes: [],
    });

    const result = await auditor.auditPage('https://tiny-static.example.com');

    expect(result.status).toBe('success');
  });

  test('goto 실패 → status=failed, title=Error, violations 비어있음', async () => {
    mockGoto.mockRejectedValueOnce(new Error('net::ERR_NAME_NOT_RESOLVED'));

    const result = await auditor.auditPage('https://nonexistent.example.com');

    expect(result.status).toBe('failed');
    expect(result.title).toBe('Error');
    expect(result.violations).toHaveLength(0);
    expect(result.failureReason).toContain('goto-failed');
  });

  test('readiness 자체가 throw → partial + readiness-error', async () => {
    mockWaitForSpaReady.mockRejectedValueOnce(new Error('boom'));

    const result = await auditor.auditPage('https://spa.example.com');

    expect(result.status).toBe('partial');
    expect(result.failureReason).toBe('readiness-error');
  });

  test('axe analyze 가 throw → status=failed + audit-throw', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      framework: 'react',
      renderStrategy: 'CSR',
      hydrationMs: 100,
      domNodeCount: 200,
      status: 'ready',
      notes: [],
    });
    mockAnalyze.mockRejectedValueOnce(new Error('axe explosion'));

    const result = await auditor.auditPage('https://spa.example.com');

    expect(result.status).toBe('failed');
    expect(result.failureReason).toContain('audit-throw');
    expect(result.framework).toBe('react'); // readiness 결과는 보존
  });

  test('AuditOptions.readySelector 가 waitForSpaReady 로 전달된다', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      framework: 'react',
      renderStrategy: 'CSR',
      hydrationMs: 100,
      domNodeCount: 200,
      status: 'ready',
      notes: [],
    });

    const customAuditor = new AccessibilityAuditor({
      enableDynamicCheck: false,
      screenshotOnViolation: false,
      readySelector: '[data-test=app-ready]',
      networkIdleMs: 20000,
    });
    await customAuditor.init();

    await customAuditor.auditPage('https://spa.example.com');

    expect(mockWaitForSpaReady).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        readySelector: '[data-test=app-ready]',
        networkIdleMs: 20000,
      })
    );

    await customAuditor.close();
  });
});
