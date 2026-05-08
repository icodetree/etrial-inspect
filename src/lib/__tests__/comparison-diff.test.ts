import { buildViolationKey, delta, diffAuditResults } from '../comparison/diff';
import { AuditResult, Violation } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    pageUrl: 'https://example.com',
    pageTitle: '테스트 페이지',
    depth1: '메인',
    depth2: '',
    depth3: '',
    depth4: '',
    platform: 'PC',
    inspector: '홍길동',
    inspectionDate: '2026-05-01',
    violationNumber: 1,
    kwcagId: '1.1.1',
    kwcagName: '적절한 대체 텍스트 제공',
    principle: '인식의 용이성',
    axeRuleId: 'image-alt',
    description: '이미지에 대체 텍스트가 없습니다.',
    impact: 'critical',
    affectedCode: '<img src="a.png">',
    help: '이미지에 alt 속성을 추가하세요.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.4/image-alt',
    selector: 'img.hero',
    ...overrides,
  };
}

function makeAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    startTime: '2026-05-01T10:00:00Z',
    endTime: '2026-05-01T10:05:00Z',
    totalPages: 5,
    totalViolations: 3,
    pages: [{ url: 'https://example.com', title: '홈', depth1: '메인', depth2: '', depth3: '', depth4: '' }],
    violations: [makeViolation()],
    summary: {
      byPrinciple: { '인식의 용이성': 2, '운용의 용이성': 1 },
      byImpact: { critical: 1, serious: 2 },
      byKwcagItem: { '1.1.1': 1 },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildViolationKey', () => {
  it('모든 필드를 포함하여 일관된 키를 생성한다', () => {
    const key = buildViolationKey({
      kwcagId: '1.1.1',
      pageUrl: 'https://example.com',
      selector: 'img.hero',
      axeRuleId: 'image-alt',
    });
    expect(key).toBe('1.1.1||https://example.com||img.hero||image-alt');
  });

  it('selector 가 없으면 생략한다', () => {
    const key = buildViolationKey({
      kwcagId: '1.1.1',
      pageUrl: 'https://example.com',
      axeRuleId: 'image-alt',
    });
    expect(key).toBe('1.1.1||https://example.com||image-alt');
  });

  it('axeRuleId 가 없으면 생략한다', () => {
    const key = buildViolationKey({
      kwcagId: '1.1.1',
      pageUrl: 'https://example.com',
      selector: 'img.hero',
    });
    expect(key).toBe('1.1.1||https://example.com||img.hero');
  });

  it('동일한 입력에 대해 항상 같은 키를 반환한다', () => {
    const input = { kwcagId: '2.1.1', pageUrl: 'https://a.com', selector: '#btn' };
    expect(buildViolationKey(input)).toBe(buildViolationKey(input));
  });
});

describe('delta', () => {
  it('증가를 양수로 표현한다', () => {
    expect(delta(3, 5)).toEqual({ before: 3, after: 5, delta: 2 });
  });

  it('감소를 음수로 표현한다', () => {
    expect(delta(10, 7)).toEqual({ before: 10, after: 7, delta: -3 });
  });

  it('변화 없음은 0이다', () => {
    expect(delta(4, 4)).toEqual({ before: 4, after: 4, delta: 0 });
  });

  it('0에서 0은 delta 0이다', () => {
    expect(delta(0, 0)).toEqual({ before: 0, after: 0, delta: 0 });
  });
});

describe('diffAuditResults', () => {
  it('동일한 결과 비교 시 delta 가 모두 0이고 신규/해소 위반이 없다', () => {
    const result = makeAuditResult();
    const comparison = diffAuditResults(result, result, 'id-a', 'id-b');

    expect(comparison.baseId).toBe('id-a');
    expect(comparison.currentId).toBe('id-b');
    expect(comparison.scoreDelta.delta).toBe(0);
    expect(comparison.violationCountDelta.delta).toBe(0);
    expect(comparison.pageCountDelta.delta).toBe(0);
    expect(comparison.newViolations).toHaveLength(0);
    expect(comparison.resolvedViolations).toHaveLength(0);
    expect(comparison.persistentCount).toBe(1); // 1 violation persists
  });

  it('개선된 결과 비교 시 해소된 위반이 존재한다', () => {
    const base = makeAuditResult({
      totalViolations: 3,
      violations: [
        makeViolation({ kwcagId: '1.1.1', selector: '#a' }),
        makeViolation({ kwcagId: '1.3.1', selector: '#b' }),
        makeViolation({ kwcagId: '2.1.1', selector: '#c' }),
      ],
    });
    const current = makeAuditResult({
      totalViolations: 1,
      violations: [
        makeViolation({ kwcagId: '1.1.1', selector: '#a' }),
      ],
    });

    const comparison = diffAuditResults(base, current, 'base', 'current');

    expect(comparison.violationCountDelta.delta).toBe(-2);
    expect(comparison.resolvedViolations).toHaveLength(2);
    expect(comparison.newViolations).toHaveLength(0);
    expect(comparison.persistentCount).toBe(1);
    expect(comparison.resolvedViolations.map(v => v.kwcagId).sort()).toEqual(['1.3.1', '2.1.1']);
  });

  it('악화된 결과 비교 시 신규 위반이 존재한다', () => {
    const base = makeAuditResult({
      totalViolations: 1,
      violations: [
        makeViolation({ kwcagId: '1.1.1', selector: '#a' }),
      ],
    });
    const current = makeAuditResult({
      totalViolations: 3,
      violations: [
        makeViolation({ kwcagId: '1.1.1', selector: '#a' }),
        makeViolation({ kwcagId: '3.1.1', selector: '#d' }),
        makeViolation({ kwcagId: '4.1.1', selector: '#e' }),
      ],
    });

    const comparison = diffAuditResults(base, current, 'base', 'current');

    expect(comparison.violationCountDelta.delta).toBe(2);
    expect(comparison.newViolations).toHaveLength(2);
    expect(comparison.resolvedViolations).toHaveLength(0);
    expect(comparison.persistentCount).toBe(1);
  });

  it('절단된 결과에 truncationWarning 을 설정한다', () => {
    const base = makeAuditResult();
    const truncatedCurrent = {
      ...makeAuditResult(),
      _truncated: '50/200 violations shown',
    };

    const comparison = diffAuditResults(
      base,
      truncatedCurrent as unknown as AuditResult,
      'base',
      'current',
    );

    expect(comparison.truncationWarning).toBeDefined();
    expect(comparison.truncationWarning).toContain('불완전');
    expect(comparison.truncationWarning).toContain('50/200');
  });

  it('violations 가 빈 배열이어도 오류 없이 동작한다', () => {
    const base = makeAuditResult({ violations: [], totalViolations: 0 });
    const current = makeAuditResult({ violations: [], totalViolations: 0 });

    const comparison = diffAuditResults(base, current, 'a', 'b');

    expect(comparison.newViolations).toHaveLength(0);
    expect(comparison.resolvedViolations).toHaveLength(0);
    expect(comparison.persistentCount).toBe(0);
    expect(comparison.violationCountDelta.delta).toBe(0);
  });

  it('byImpact/byPrinciple 의 키가 한쪽에만 있어도 올바르게 비교한다', () => {
    const base = makeAuditResult({
      summary: {
        byPrinciple: { '인식의 용이성': 5 },
        byImpact: { critical: 3 },
        byKwcagItem: {},
      },
    });
    const current = makeAuditResult({
      summary: {
        byPrinciple: { '운용의 용이성': 2 },
        byImpact: { minor: 1 },
        byKwcagItem: {},
      },
    });

    const comparison = diffAuditResults(base, current, 'a', 'b');

    // base 에만 있던 키는 after=0
    expect(comparison.byPrincipleDelta['인식의 용이성']).toEqual({
      before: 5, after: 0, delta: -5,
    });
    // current 에만 있는 키는 before=0
    expect(comparison.byPrincipleDelta['운용의 용이성']).toEqual({
      before: 0, after: 2, delta: 2,
    });
    expect(comparison.byImpactDelta['critical']).toEqual({
      before: 3, after: 0, delta: -3,
    });
    expect(comparison.byImpactDelta['minor']).toEqual({
      before: 0, after: 1, delta: 1,
    });
  });

  it('SEO 점수가 없으면 0으로 처리한다', () => {
    const base = makeAuditResult({ seoResult: undefined });
    const current = makeAuditResult({ seoResult: undefined });

    const comparison = diffAuditResults(base, current, 'a', 'b');

    expect(comparison.scoreDelta).toEqual({ before: 0, after: 0, delta: 0 });
  });

  it('baseDate/currentDate 는 startTime 에서 가져온다', () => {
    const base = makeAuditResult({ startTime: '2026-04-01T00:00:00Z' });
    const current = makeAuditResult({ startTime: '2026-05-01T00:00:00Z' });

    const comparison = diffAuditResults(base, current, 'a', 'b');

    expect(comparison.baseDate).toBe('2026-04-01T00:00:00Z');
    expect(comparison.currentDate).toBe('2026-05-01T00:00:00Z');
  });

  it('baseUrl/currentUrl 은 첫 페이지 URL 에서 추출한다', () => {
    const base = makeAuditResult({
      pages: [{ url: 'https://a.com', title: 'A', depth1: '', depth2: '', depth3: '', depth4: '' }],
    });
    const current = makeAuditResult({
      pages: [{ url: 'https://b.com', title: 'B', depth1: '', depth2: '', depth3: '', depth4: '' }],
    });

    const comparison = diffAuditResults(base, current, 'a', 'b');

    expect(comparison.baseUrl).toBe('https://a.com');
    expect(comparison.currentUrl).toBe('https://b.com');
  });
});
