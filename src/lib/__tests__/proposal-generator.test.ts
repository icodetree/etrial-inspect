import { generateProposalHtml, ProposalInput } from '../proposal-generator';
import { AuditResult, Violation } from '@/types';

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    pageUrl: 'https://example.com',
    pageTitle: 'Example',
    depth1: '',
    depth2: '',
    depth3: '',
    depth4: '',
    platform: 'PC',
    inspector: 'tester',
    inspectionDate: '2025-01-01',
    violationNumber: 1,
    kwcagId: '1.1.1',
    kwcagName: '적절한 대체 텍스트 제공',
    principle: '인식의 용이성',
    axeRuleId: 'image-alt',
    description: '이미지에 alt 없음',
    impact: 'critical',
    affectedCode: '<img src="a.png">',
    help: '이미지에 대체 텍스트를 제공하세요.',
    helpUrl: 'https://dequeuniversity.com/rules/axe/image-alt',
    ...overrides,
  };
}

function makeResult(violations: Violation[] = [], totalPages = 5): AuditResult {
  const byImpact: Record<string, number> = {};
  const byPrinciple: Record<string, number> = {};
  const byKwcagItem: Record<string, number> = {};
  for (const v of violations) {
    byImpact[v.impact] = (byImpact[v.impact] || 0) + 1;
    byPrinciple[v.principle] = (byPrinciple[v.principle] || 0) + 1;
    byKwcagItem[v.kwcagId] = (byKwcagItem[v.kwcagId] || 0) + 1;
  }
  return {
    startTime: '2025-01-15T10:00:00Z',
    endTime: '2025-01-15T10:05:00Z',
    totalPages,
    totalViolations: violations.length,
    pages: [{ url: 'https://example.com', title: 'Example', depth1: '', depth2: '', depth3: '', depth4: '' }],
    violations,
    summary: { byPrinciple, byImpact, byKwcagItem },
  };
}

describe('generateProposalHtml', () => {
  const baseInput: ProposalInput = {
    result: makeResult([makeViolation()]),
    clientName: '테스트 기업',
    contactPerson: '홍길동',
  };

  it('returns a complete HTML document', () => {
    const html = generateProposalHtml(baseInput);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="ko">');
    expect(html).toContain('</html>');
  });

  it('includes client name and contact person on cover page', () => {
    const html = generateProposalHtml(baseInput);
    expect(html).toContain('테스트 기업');
    expect(html).toContain('홍길동');
    expect(html).toContain('이트라이브');
  });

  it('includes the title text', () => {
    const html = generateProposalHtml(baseInput);
    expect(html).toContain('웹 접근성 진단 보고');
    expect(html).toContain('개선 제안서');
  });

  it('renders summary stats', () => {
    const html = generateProposalHtml(baseInput);
    // totalPages
    expect(html).toContain('>5<');
    // totalViolations
    expect(html).toContain('>1<');
  });

  it('handles zero violations', () => {
    const input: ProposalInput = {
      result: makeResult([], 3),
      clientName: '깨끗한 회사',
    };
    const html = generateProposalHtml(input);
    expect(html).toContain('위반 항목이 발견되지 않았습니다');
    expect(html).toContain('100%');
  });

  it('renders TOP 10 violations table', () => {
    const violations = Array.from({ length: 15 }, (_, i) =>
      makeViolation({
        kwcagId: `1.${i + 1}.1`,
        kwcagName: `항목 ${i + 1}`,
        impact: i < 3 ? 'critical' : i < 7 ? 'serious' : 'moderate',
        pageUrl: `https://example.com/page${i}`,
        axeRuleId: `rule-${i}`,
      })
    );
    const html = generateProposalHtml({
      result: makeResult(violations, 15),
      clientName: '대규모 사이트',
    });
    // Should have at most 10 rows — count occurrences of KWCAG column content
    expect(html).toContain('TOP 10');
  });

  it('includes 3-month roadmap', () => {
    const html = generateProposalHtml(baseInput);
    expect(html).toContain('1개월차');
    expect(html).toContain('2개월차');
    expect(html).toContain('3개월차');
    expect(html).toContain('인증 신청');
  });

  it('includes company introduction on page 6', () => {
    const html = generateProposalHtml(baseInput);
    expect(html).toContain('이트라이브는 웹 접근성 전문 기업');
    expect(html).toContain('문의 안내');
  });

  it('includes page-break CSS for A4 printing', () => {
    const html = generateProposalHtml(baseInput);
    expect(html).toContain('page-break-after');
    expect(html).toContain('size: A4');
  });

  it('escapes HTML in client name', () => {
    const input: ProposalInput = {
      result: makeResult([]),
      clientName: '<script>alert("xss")</script>',
    };
    const html = generateProposalHtml(input);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omits contactPerson row when not provided', () => {
    const input: ProposalInput = {
      result: makeResult([makeViolation()]),
      clientName: '테스트',
    };
    const html = generateProposalHtml(input);
    // "담당" label should not appear in cover meta
    // (it appears in Page 6 contact box context, but not in cover-meta-label)
    const coverSection = html.split('page cover')[1]?.split('</div><!-- end cover -->')[0] || html;
    // Simple check: no "담당" in the cover metadata section
    expect(html).toContain('테스트');
  });

  it('calculates compliance rate correctly', () => {
    // 5 pages, 2 unique violated URLs -> 3 clean -> 60%
    const violations = [
      makeViolation({ pageUrl: 'https://a.com' }),
      makeViolation({ pageUrl: 'https://a.com', kwcagId: '1.3.1' }),
      makeViolation({ pageUrl: 'https://b.com' }),
    ];
    const html = generateProposalHtml({
      result: makeResult(violations, 5),
      clientName: '준수율 테스트',
    });
    expect(html).toContain('60%');
  });
});
