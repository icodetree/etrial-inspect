/**
 * AccessibilityAuditor 단위 테스트
 *
 * Playwright / axe-core 외부 의존성은 모킹하고,
 * auditPage() 반환 구조, KWCAG 매핑, 에러 처리 등 경계면을 검증한다.
 */

// ---------------------------------------------------------------------------
// Mocks — 실제 브라우저/axe 없이 테스트
// ---------------------------------------------------------------------------

const mockScreenshot = jest.fn().mockResolvedValue(undefined);
const mockTitle = jest.fn().mockResolvedValue('테스트 페이지');
const mockGoto = jest.fn().mockResolvedValue(undefined);
const mockWaitForLoadState = jest.fn().mockResolvedValue(undefined);
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockLocatorBoundingBox = jest.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 30 });
const mockLocatorFirst = jest.fn().mockReturnValue({ boundingBox: mockLocatorBoundingBox });
const mockLocator = jest.fn().mockReturnValue({ first: mockLocatorFirst });
const mock$$ = jest.fn().mockResolvedValue([]);
// WAF 감지(arg=함수→boolean)와 CUSTOM_RULE_SCRIPT(arg=문자열→배열)를 모두 처리한다.
const mockEvaluate = jest.fn().mockImplementation((fnOrScript: unknown) => {
  if (typeof fnOrScript === 'string') return Promise.resolve([]);
  return Promise.resolve(false);
});

const mockPage = {
  goto: mockGoto,
  waitForLoadState: mockWaitForLoadState,
  title: mockTitle,
  screenshot: mockScreenshot,
  close: mockClose,
  locator: mockLocator,
  $$: mock$$,
  evaluate: mockEvaluate,
  url: jest.fn().mockReturnValue('https://example.com'),
  keyboard: { press: jest.fn() },
  $: jest.fn().mockResolvedValue(null),
  waitForTimeout: jest.fn().mockResolvedValue(undefined),
};

const mockNewPage = jest.fn().mockResolvedValue(mockPage);
const mockContextClose = jest.fn().mockResolvedValue(undefined);
const mockNewContext = jest.fn().mockResolvedValue({
  newPage: mockNewPage,
  close: mockContextClose,
  storageState: jest.fn().mockResolvedValue(undefined),
  addInitScript: jest.fn().mockResolvedValue(undefined),
});
const mockBrowserClose = jest.fn().mockResolvedValue(undefined);

jest.mock('playwright-core', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: mockNewContext,
      close: mockBrowserClose,
    }),
  },
}));

// AxeBuilder mock — analyze() 가 axe 결과 형태를 반환
const mockAnalyze = jest.fn();
const mockWithTags = jest.fn().mockReturnThis();

jest.mock('@axe-core/playwright', () => {
  return jest.fn().mockImplementation(() => ({
    withTags: mockWithTags,
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
    readFileSync: jest.fn().mockReturnValue('/* fake axe.min.js */'),
  };
});

jest.mock('../browser-utils', () => ({
  getBrowserLaunchOptions: jest.fn().mockResolvedValue({ headless: true }),
  getStealthContextOptions: jest.fn().mockReturnValue({}),
  STEALTH_INIT_SCRIPT: '',
}));

jest.mock('../custom-rules', () => ({
  CUSTOM_RULE_SCRIPT: '(function(){ return []; })()',
}));

// spa-readiness 는 별도 단위 테스트에서 검증한다.
// 여기서는 기본적으로 ready 상태로 모킹해 기존 테스트 시나리오에 영향이 없도록 한다.
const mockWaitForSpaReady = jest.fn().mockResolvedValue({
  framework: 'unknown',
  renderStrategy: 'unknown',
  hydrationMs: 50,
  domNodeCount: 200,
  status: 'ready',
  notes: [],
});

jest.mock('../spa-readiness', () => ({
  waitForSpaReady: (...args: unknown[]) => mockWaitForSpaReady(...args),
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks are set up)
// ---------------------------------------------------------------------------
import { AccessibilityAuditor, PageAuditResult } from '../accessibility-auditor';
import { KWCAGViolation } from '../kwcag-mapping';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** 최소한의 axe violation 객체를 생성한다 */
function makeAxeViolation(overrides: Record<string, unknown> = {}) {
  return {
    id: 'image-alt',
    impact: 'serious',
    description: 'Images must have alt text',
    help: 'Images must have alternate text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
    nodes: [
      {
        html: '<img src="logo.png">',
        target: ['img'],
        failureSummary: 'Fix: add alt attribute',
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccessibilityAuditor', () => {
  let auditor: AccessibilityAuditor;

  beforeEach(() => {
    jest.clearAllMocks();
    auditor = new AccessibilityAuditor({
      enableDynamicCheck: false, // 동적 검사 비활성 — 단위 테스트에서는 불필요
      screenshotOnViolation: false,
    });
  });

  afterEach(async () => {
    try { await auditor.close(); } catch { /* ignore */ }
  });

  // -----------------------------------------------------------------------
  // init / close 라이프사이클
  // -----------------------------------------------------------------------
  describe('init / close', () => {
    test('init()은 chromium.launch와 newContext를 호출한다', async () => {
      await auditor.init();
      const { chromium } = require('playwright-core');
      expect(chromium.launch).toHaveBeenCalledTimes(1);
      expect(mockNewContext).toHaveBeenCalledTimes(1);
    });

    test('close()는 context와 browser를 정리한다', async () => {
      await auditor.init();
      await auditor.close();
      expect(mockContextClose).toHaveBeenCalledTimes(1);
      expect(mockBrowserClose).toHaveBeenCalledTimes(1);
    });

    test('getBrowser()는 init 전에 null을 반환한다', () => {
      expect(auditor.getBrowser()).toBeNull();
    });

    test('getBrowser()는 init 후에 Browser 객체를 반환한다', async () => {
      await auditor.init();
      expect(auditor.getBrowser()).not.toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // auditPage — 반환 구조 검증
  // -----------------------------------------------------------------------
  describe('auditPage() 반환 구조', () => {
    beforeEach(async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation()],
      });
      await auditor.init();
    });

    test('PageAuditResult에 url, title, violations, screenshotPaths, timestamp가 존재한다', async () => {
      const result: PageAuditResult = await auditor.auditPage('https://example.com');

      expect(result).toHaveProperty('url', 'https://example.com');
      expect(result).toHaveProperty('title', '테스트 페이지');
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.screenshotPaths)).toBe(true);
      expect(typeof result.timestamp).toBe('string');
    });

    test('timestamp는 ISO 8601 형식이다', async () => {
      const result = await auditor.auditPage('https://example.com');
      // ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // -----------------------------------------------------------------------
  // KWCAG 매핑 검증 (경계면)
  // -----------------------------------------------------------------------
  describe('KWCAG 매핑 — axe rule → kwcagId 변환', () => {
    beforeEach(async () => {
      await auditor.init();
    });

    test('image-alt → KWCAG 1.1.1 (적절한 대체 텍스트 제공)', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation({ id: 'image-alt', impact: 'critical' })],
      });

      const result = await auditor.auditPage('https://example.com');
      const v = result.violations[0] as KWCAGViolation;

      expect(v.kwcagId).toBe('1.1.1');
      expect(v.kwcagName).toBe('적절한 대체 텍스트 제공');
      expect(v.principle).toBe('인식의 용이성');
    });

    test('color-contrast → KWCAG 1.4.1 (명도 대비)', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [
          makeAxeViolation({
            id: 'color-contrast',
            impact: 'serious',
            nodes: [
              {
                html: '<p style="color:#ccc">',
                target: ['p'],
                failureSummary: 'Expected contrast ratio of 4.5:1',
                any: [{ id: 'color-contrast', data: { contrastRatio: 2.5 } }],
                all: [],
                none: [],
              },
            ],
          }),
        ],
      });

      const result = await auditor.auditPage('https://example.com');
      const v = result.violations.find(
        (viol: KWCAGViolation) => viol.axeRuleId === 'color-contrast'
      );

      expect(v).toBeDefined();
      expect(v!.kwcagId).toBe('1.4.1');
    });

    test('html-has-lang → KWCAG 3.1.1 (기본 언어 표시)', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation({ id: 'html-has-lang', impact: 'serious' })],
      });

      const result = await auditor.auditPage('https://example.com');
      expect(result.violations[0].kwcagId).toBe('3.1.1');
    });

    test('duplicate-id → KWCAG 4.1.1 (마크업 오류 방지)', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation({ id: 'duplicate-id', impact: 'minor' })],
      });

      const result = await auditor.auditPage('https://example.com');
      expect(result.violations[0].kwcagId).toBe('4.1.1');
    });

    test('매핑되지 않은 axe 규칙은 kwcagId "기타"로 분류된다', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation({ id: 'some-unknown-rule', impact: 'moderate' })],
      });

      const result = await auditor.auditPage('https://example.com');
      expect(result.violations[0].kwcagId).toBe('기타');
      expect(result.violations[0].principle).toBe('기타');
    });
  });

  // -----------------------------------------------------------------------
  // violations 필수 필드 검증
  // -----------------------------------------------------------------------
  describe('violations 필수 필드', () => {
    beforeEach(async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation()],
      });
      await auditor.init();
    });

    test('각 violation에 impact, axeRuleId, description, help이 존재한다', async () => {
      const result = await auditor.auditPage('https://example.com');

      for (const v of result.violations) {
        expect(v).toHaveProperty('impact');
        expect(v).toHaveProperty('axeRuleId');
        expect(v).toHaveProperty('description');
        expect(v).toHaveProperty('help');
      }
    });

    test('각 violation에 nodes 배열이 존재하고 html, target, failureSummary를 포함한다', async () => {
      const result = await auditor.auditPage('https://example.com');

      for (const v of result.violations) {
        expect(Array.isArray(v.nodes)).toBe(true);
        for (const node of v.nodes) {
          expect(node).toHaveProperty('html');
          expect(node).toHaveProperty('target');
          expect(node).toHaveProperty('failureSummary');
        }
      }
    });
  });

  // -----------------------------------------------------------------------
  // impact null 처리
  // -----------------------------------------------------------------------
  describe('impact null/undefined 처리', () => {
    test('impact가 null인 violation은 "minor"로 대체된다', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation({ impact: null })],
      });
      await auditor.init();

      const result = await auditor.auditPage('https://example.com');
      expect(result.violations[0].impact).toBe('minor');
    });
  });

  // -----------------------------------------------------------------------
  // 색상 대비 3.0 필터링
  // -----------------------------------------------------------------------
  describe('color-contrast 3.0 필터링', () => {
    test('contrastRatio >= 3.0 인 노드는 필터링되어 violations에 포함되지 않는다', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [
          {
            id: 'color-contrast',
            impact: 'serious',
            description: 'Color contrast',
            help: 'Ensure contrast',
            helpUrl: 'https://example.com',
            nodes: [
              {
                html: '<p>above threshold</p>',
                target: ['p.above'],
                failureSummary: 'Expected 4.5:1',
                any: [{ id: 'color-contrast', data: { contrastRatio: 3.5 } }],
                all: [],
                none: [],
              },
              {
                html: '<p>below threshold</p>',
                target: ['p.below'],
                failureSummary: 'Expected 4.5:1',
                any: [{ id: 'color-contrast', data: { contrastRatio: 2.0 } }],
                all: [],
                none: [],
              },
            ],
          },
        ],
      });
      await auditor.init();

      const result = await auditor.auditPage('https://example.com');
      // 3.5 >= 3.0 이므로 필터링됨, 2.0 < 3.0 이므로 남음
      const ccViolation = result.violations.find(
        (v: KWCAGViolation) => v.axeRuleId === 'color-contrast'
      );
      expect(ccViolation).toBeDefined();
      expect(ccViolation!.nodes).toHaveLength(1);
      expect(ccViolation!.nodes[0].html).toContain('below threshold');
    });

    test('모든 노드가 3.0 이상이면 해당 violation 자체가 제거된다', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [
          {
            id: 'color-contrast',
            impact: 'serious',
            description: 'Color contrast',
            help: 'Ensure contrast',
            helpUrl: '',
            nodes: [
              {
                html: '<p>good</p>',
                target: ['p'],
                failureSummary: 'Expected 4.5:1',
                any: [{ id: 'color-contrast', data: { contrastRatio: 4.0 } }],
                all: [],
                none: [],
              },
            ],
          },
        ],
      });
      await auditor.init();

      const result = await auditor.auditPage('https://example.com');
      expect(result.violations).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 에러 처리
  // -----------------------------------------------------------------------
  describe('에러 처리', () => {
    test('init 없이 auditPage 호출 시 에러를 던진다', async () => {
      await expect(auditor.auditPage('https://example.com')).rejects.toThrow(
        'Auditor not initialized'
      );
    });

    test('페이지 이동 실패 시 빈 violations 배열과 title "Error"를 반환한다', async () => {
      mockGoto.mockRejectedValueOnce(new Error('net::ERR_CONNECTION_REFUSED'));
      await auditor.init();

      const result = await auditor.auditPage('https://unreachable.example.com');
      expect(result.title).toBe('Error');
      expect(result.violations).toHaveLength(0);
      expect(result.url).toBe('https://unreachable.example.com');
    });
  });

  // -----------------------------------------------------------------------
  // 빈 violations
  // -----------------------------------------------------------------------
  describe('violations가 없는 경우', () => {
    test('위반 없는 페이지는 빈 violations 배열을 반환한다', async () => {
      mockAnalyze.mockResolvedValue({ violations: [] });
      await auditor.init();

      const result = await auditor.auditPage('https://perfect-site.example.com');
      expect(result.violations).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // 커스텀 룰 병합
  // -----------------------------------------------------------------------
  describe('커스텀 룰 병합', () => {
    test('page.evaluate에서 반환된 커스텀 위반이 axe 결과와 병합된다', async () => {
      mockAnalyze.mockResolvedValue({
        violations: [makeAxeViolation({ id: 'image-alt' })],
      });
      // CUSTOM_RULE_SCRIPT 호출(string arg)에만 커스텀 위반을 주입. WAF 함수 호출은 false 유지.
      // mockImplementationOnce 는 첫 호출(WAF)에서 소비되므로 mockImplementation 으로 영구 오버라이드.
      mockEvaluate.mockImplementation((fnOrScript: unknown) => {
        if (typeof fnOrScript === 'string') {
          return Promise.resolve([
            {
              id: 'custom-aria-tab-missing-selected',
              impact: 'serious',
              description: 'Tab missing aria-selected',
              help: 'Add aria-selected',
              helpUrl: '',
              nodes: [{ html: '<div role="tab">', target: ['[role="tab"]'], failureSummary: 'Missing aria-selected' }],
            },
          ]);
        }
        return Promise.resolve(false);
      });
      await auditor.init();

      const result = await auditor.auditPage('https://example.com');
      // image-alt (KWCAG 1.1.1) + custom-aria-tab-missing-selected (KWCAG 4.1.2)
      expect(result.violations.length).toBeGreaterThanOrEqual(2);

      const customV = result.violations.find(
        (v: KWCAGViolation) => v.axeRuleId === 'custom-aria-tab-missing-selected'
      );
      expect(customV).toBeDefined();
      expect(customV!.kwcagId).toBe('4.1.2');
    });
  });
});
