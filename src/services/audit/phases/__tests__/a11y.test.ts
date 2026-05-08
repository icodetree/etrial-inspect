/**
 * a11y.ts phase — uniqueViolationMap 중복 제거 로직 단위 테스트
 *
 * runA11yPhase 전체를 호출하면 AccessibilityAuditor 초기화(Playwright 필요)가
 * 필수이므로, 중복 제거 로직의 핵심인 signature 기반 dedup 을 검증하기 위해
 * AccessibilityAuditor 와 fs 를 mock 한다.
 */

import type { PageInfo, Violation } from '@/types';
import type { PageAuditResult } from '@/lib/accessibility-auditor';

// AccessibilityAuditor mock
const mockAuditPage = jest.fn();
const mockInit = jest.fn().mockResolvedValue(undefined);
const mockLoadStorageState = jest.fn().mockResolvedValue(undefined);
const mockAuditorClose = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/accessibility-auditor', () => ({
  AccessibilityAuditor: jest.fn().mockImplementation(() => ({
    init: mockInit,
    auditPage: mockAuditPage,
    loadStorageState: mockLoadStorageState,
    close: mockAuditorClose,
  })),
}));

jest.mock('@/lib/browser-utils', () => ({
  getBrowserErrorGuide: jest.fn().mockReturnValue('browser error guide'),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));

import { runA11yPhase } from '../a11y';

/** 테스트용 기본 PageAuditResult 생성 헬퍼 */
function makePageAuditResult(
  overrides: Partial<PageAuditResult> & { violations: PageAuditResult['violations'] },
): PageAuditResult {
  return {
    url: 'http://example.com',
    violations: overrides.violations,
    passes: 0,
    incomplete: 0,
    inapplicable: 0,
    timestamp: new Date().toISOString(),
    screenshotPaths: [],
    ...overrides,
  };
}

/** 기본 A11yPhaseInput 을 생성하는 헬퍼 */
function makeInput(pages: PageInfo[], violations: Violation[] = []) {
  return {
    config: { targetUrl: 'http://example.com', platform: 'PC', inspector: '시스템' } as any,
    authStatePath: '/tmp/auth.json',
    useStorageState: false,
    pages,
    signal: undefined,
    onProgress: undefined,
    log: jest.fn(),
    violations,
  };
}

/** 테스트용 PageInfo 생성 */
function makePage(url: string): PageInfo {
  return {
    url,
    title: 'Test',
    depth1: '홈',
    depth2: '',
    depth3: '',
    depth4: '',
  };
}

describe('runA11yPhase — 중복 제거 로직', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('동일 signature 의 violation 은 중복 제거되고 occurrenceCount 가 증가한다', async () => {
    // 두 페이지에서 동일한 위반 (같은 axeRuleId + selector + html)
    const kwcagViolation = {
      kwcagId: '5.1.1',
      kwcagName: '대체 텍스트',
      principle: '인식의 용이성',
      axeRuleId: 'image-alt',
      description: '이미지에 대체 텍스트가 없습니다',
      impact: 'critical',
      help: 'alt 속성을 추가하세요',
      helpUrl: 'https://example.com',
      nodes: [
        {
          html: '<img src="logo.png">',
          target: ['img.logo'],
          failureSummary: 'alt missing',
        },
      ],
    };

    mockAuditPage
      .mockResolvedValueOnce(makePageAuditResult({ violations: [kwcagViolation] }))
      .mockResolvedValueOnce(makePageAuditResult({ violations: [kwcagViolation] }));

    const violations: Violation[] = [];
    const input = makeInput(
      [makePage('http://example.com/page1'), makePage('http://example.com/page2')],
      violations,
    );

    await runA11yPhase(input);

    // 중복 제거로 violations 배열에는 1개만 존재
    expect(violations).toHaveLength(1);
    expect(violations[0].occurrenceCount).toBe(2);
  });

  test('다른 signature (다른 axeRuleId) 는 보존된다', async () => {
    const violation1 = {
      kwcagId: '5.1.1',
      kwcagName: '대체 텍스트',
      principle: '인식의 용이성',
      axeRuleId: 'image-alt',
      description: 'alt missing',
      impact: 'critical',
      help: 'Add alt',
      helpUrl: '',
      nodes: [{ html: '<img src="a.png">', target: ['img.a'], failureSummary: 'alt missing' }],
    };
    const violation2 = {
      kwcagId: '7.1.1',
      kwcagName: '키보드 접근성',
      principle: '운용의 용이성',
      axeRuleId: 'keyboard-access',
      description: 'not keyboard accessible',
      impact: 'serious',
      help: 'Add tabindex',
      helpUrl: '',
      nodes: [{ html: '<div onclick="x()">', target: ['div.btn'], failureSummary: 'no keyboard' }],
    };

    mockAuditPage.mockResolvedValueOnce(
      makePageAuditResult({ violations: [violation1, violation2] }),
    );

    const violations: Violation[] = [];
    await runA11yPhase(makeInput([makePage('http://example.com')], violations));

    expect(violations).toHaveLength(2);
    expect(violations[0].axeRuleId).toBe('image-alt');
    expect(violations[1].axeRuleId).toBe('keyboard-access');
  });

  test('다른 signature (같은 rule 이지만 다른 selector) 는 보존된다', async () => {
    const makeViolation = (selector: string) => ({
      kwcagId: '5.1.1',
      kwcagName: '대체 텍스트',
      principle: '인식의 용이성',
      axeRuleId: 'image-alt',
      description: 'alt missing',
      impact: 'critical',
      help: 'Add alt',
      helpUrl: '',
      nodes: [{ html: '<img src="x.png">', target: [selector], failureSummary: 'alt missing' }],
    });

    mockAuditPage.mockResolvedValueOnce(
      makePageAuditResult({
        violations: [makeViolation('img.logo'), makeViolation('img.hero')],
      }),
    );

    const violations: Violation[] = [];
    await runA11yPhase(makeInput([makePage('http://example.com')], violations));

    expect(violations).toHaveLength(2);
  });

  test('빈 페이지 배열 입력 시 정상 동작 (violations 빈 배열)', async () => {
    const violations: Violation[] = [];
    const result = await runA11yPhase(makeInput([], violations));

    expect(violations).toHaveLength(0);
    expect(result.pageAuditResults).toHaveLength(0);
    expect(mockAuditPage).not.toHaveBeenCalled();
  });

  test('auditPage 에러 시 해당 페이지를 건너뛰고 다음 페이지 진행', async () => {
    mockAuditPage
      .mockRejectedValueOnce(new Error('page timeout'))
      .mockResolvedValueOnce(
        makePageAuditResult({
          violations: [
            {
              kwcagId: '5.1.1',
              kwcagName: '대체 텍스트',
              principle: '인식의 용이성',
              axeRuleId: 'image-alt',
              description: 'alt missing',
              impact: 'critical',
              help: 'Add alt',
              helpUrl: '',
              nodes: [{ html: '<img>', target: ['img'], failureSummary: 'alt' }],
            },
          ],
        }),
      );

    const violations: Violation[] = [];
    await runA11yPhase(
      makeInput(
        [makePage('http://example.com/broken'), makePage('http://example.com/ok')],
        violations,
      ),
    );

    // 첫 페이지 에러에도 두 번째 페이지 결과가 수집됨
    expect(violations).toHaveLength(1);
  });

  test('공통 UI 요소(header/nav/footer)는 isCommon=true 로 마킹된다', async () => {
    mockAuditPage.mockResolvedValueOnce(
      makePageAuditResult({
        violations: [
          {
            kwcagId: '5.1.1',
            kwcagName: '대체 텍스트',
            principle: '인식의 용이성',
            axeRuleId: 'image-alt',
            description: 'alt missing',
            impact: 'critical',
            help: '',
            helpUrl: '',
            nodes: [
              { html: '<img>', target: ['header > nav > img'], failureSummary: 'alt' },
            ],
          },
        ],
      }),
    );

    const violations: Violation[] = [];
    await runA11yPhase(makeInput([makePage('http://example.com')], violations));

    expect(violations).toHaveLength(1);
    expect(violations[0].isCommon).toBe(true);
  });

  test('일반 콘텐츠 영역은 isCommon=false 로 마킹된다', async () => {
    mockAuditPage.mockResolvedValueOnce(
      makePageAuditResult({
        violations: [
          {
            kwcagId: '5.1.1',
            kwcagName: '대체 텍스트',
            principle: '인식의 용이성',
            axeRuleId: 'image-alt',
            description: 'alt missing',
            impact: 'critical',
            help: '',
            helpUrl: '',
            nodes: [
              { html: '<img>', target: ['main > section > img'], failureSummary: 'alt' },
            ],
          },
        ],
      }),
    );

    const violations: Violation[] = [];
    await runA11yPhase(makeInput([makePage('http://example.com')], violations));

    expect(violations[0].isCommon).toBe(false);
  });

  test('onProgress 콜백이 페이지 완료마다 호출된다', async () => {
    mockAuditPage.mockResolvedValue(makePageAuditResult({ violations: [] }));

    const onProgress = jest.fn();
    const input = {
      ...makeInput([makePage('http://a.com'), makePage('http://b.com')]),
      onProgress,
    };

    await runA11yPhase(input);

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'progress', current: expect.any(Number), total: 2 }),
    );
  });

  test('violation 에 violationNumber 가 순차 부여된다', async () => {
    const makeViolation = (ruleId: string) => ({
      kwcagId: '5.1.1',
      kwcagName: '대체 텍스트',
      principle: '인식의 용이성',
      axeRuleId: ruleId,
      description: 'desc',
      impact: 'critical',
      help: '',
      helpUrl: '',
      nodes: [{ html: '<div>', target: ['div'], failureSummary: 'fail' }],
    });

    mockAuditPage.mockResolvedValueOnce(
      makePageAuditResult({
        violations: [makeViolation('rule-a'), makeViolation('rule-b'), makeViolation('rule-c')],
      }),
    );

    const violations: Violation[] = [];
    await runA11yPhase(makeInput([makePage('http://example.com')], violations));

    expect(violations[0].violationNumber).toBe(1);
    expect(violations[1].violationNumber).toBe(2);
    expect(violations[2].violationNumber).toBe(3);
  });
});
