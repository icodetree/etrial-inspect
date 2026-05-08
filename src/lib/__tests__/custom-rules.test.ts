/**
 * custom-rules.ts 단위 테스트
 *
 * CUSTOM_RULE_SCRIPT 는 브라우저에서 eval 되는 IIFE 문자열이다.
 * jsdom 환경을 직접 구성하여 DOM 요소에 대한 ARIA 룰 위반 감지를 검증한다.
 */
import { CUSTOM_RULE_SCRIPT } from '../custom-rules';

// jsdom 은 Jest node 환경에서 직접 생성하여 사용
import { JSDOM } from 'jsdom';

/** jsdom window 에서 CUSTOM_RULE_SCRIPT 를 실행하고 violations 을 반환한다. */
function runCustomRules(html: string): Array<{
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  nodes: Array<{ html: string; target: string[]; failureSummary: string }>;
}> {
  const dom = new JSDOM(html, { url: 'http://localhost', runScripts: 'dangerously' });
  // CUSTOM_RULE_SCRIPT 는 IIFE 이므로 window.eval 로 실행하면 document/Node 가 자연스럽게 바인딩된다.
  const result = dom.window.eval(CUSTOM_RULE_SCRIPT);
  return result;
}

describe('CUSTOM_RULE_SCRIPT', () => {
  describe('스크립트 유효성', () => {
    test('유효한 JavaScript 이며 eval 시 에러가 없다', () => {
      expect(() => runCustomRules('<html><body></body></html>')).not.toThrow();
    });

    test('위반 없는 페이지에서 빈 배열을 반환한다', () => {
      const violations = runCustomRules('<html><body><p>Hello</p></body></html>');
      expect(violations).toEqual([]);
    });

    test('반환 구조가 violations 배열 형태이다', () => {
      const violations = runCustomRules('<html><body></body></html>');
      expect(Array.isArray(violations)).toBe(true);
    });
  });

  describe('Rule 1: Tab — aria-selected / aria-controls 누락', () => {
    test('aria-selected 누락 시 custom-aria-tab-missing-selected 위반 감지', () => {
      const html = '<div role="tab" aria-controls="panel1">Tab 1</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-tab-missing-selected');
      expect(rule).toBeDefined();
      expect(rule!.impact).toBe('serious');
      expect(rule!.nodes).toHaveLength(1);
      expect(rule!.nodes[0].html).toContain('role="tab"');
    });

    test('aria-controls 누락 시 custom-aria-tab-missing-controls 위반 감지', () => {
      const html = '<div role="tab" aria-selected="true">Tab 1</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-tab-missing-controls');
      expect(rule).toBeDefined();
      expect(rule!.nodes).toHaveLength(1);
    });

    test('둘 다 있으면 tab 관련 위반 없음', () => {
      const html = '<div role="tab" aria-selected="true" aria-controls="p1">Tab</div>';
      const violations = runCustomRules(html);
      const tabViolations = violations.filter((v) => v.id.startsWith('custom-aria-tab'));
      expect(tabViolations).toHaveLength(0);
    });

    test('여러 tab 요소에서 동일 rule 에 nodes 가 누적된다', () => {
      const html = `
        <div role="tab">Tab 1</div>
        <div role="tab">Tab 2</div>
      `;
      const violations = runCustomRules(html);
      const selected = violations.find((v) => v.id === 'custom-aria-tab-missing-selected');
      expect(selected).toBeDefined();
      expect(selected!.nodes).toHaveLength(2);
    });
  });

  describe('Rule 2: Checkbox — aria-checked 누락', () => {
    test('aria-checked 누락 시 위반 감지', () => {
      const html = '<div role="checkbox">Option</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-checkbox-missing-checked');
      expect(rule).toBeDefined();
      expect(rule!.nodes).toHaveLength(1);
    });

    test('aria-checked 있으면 위반 없음', () => {
      const html = '<div role="checkbox" aria-checked="false">Option</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-checkbox-missing-checked');
      expect(rule).toBeUndefined();
    });
  });

  describe('Rule 3: Radio — aria-checked 누락', () => {
    test('aria-checked 누락 시 위반 감지', () => {
      const html = '<div role="radio">Choice</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-radio-missing-checked');
      expect(rule).toBeDefined();
    });

    test('aria-checked="true" 이면 위반 없음', () => {
      const html = '<div role="radio" aria-checked="true">Choice</div>';
      const violations = runCustomRules(html);
      expect(violations.find((v) => v.id === 'custom-aria-radio-missing-checked')).toBeUndefined();
    });
  });

  describe('Rule 4: Slider — aria-value* 속성 누락', () => {
    test('모든 value 속성 누락 시 위반 감지', () => {
      const html = '<div role="slider">Slider</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-slider-missing-values');
      expect(rule).toBeDefined();
      expect(rule!.nodes[0].failureSummary).toContain('aria-valuenow');
      expect(rule!.nodes[0].failureSummary).toContain('aria-valuemin');
      expect(rule!.nodes[0].failureSummary).toContain('aria-valuemax');
    });

    test('일부만 누락 시에도 위반 감지 (누락 속성만 표시)', () => {
      const html = '<div role="slider" aria-valuenow="5">Slider</div>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-slider-missing-values');
      expect(rule).toBeDefined();
      expect(rule!.nodes[0].failureSummary).not.toContain('aria-valuenow');
      expect(rule!.nodes[0].failureSummary).toContain('aria-valuemin');
    });

    test('모두 있으면 위반 없음', () => {
      const html = '<div role="slider" aria-valuenow="5" aria-valuemin="0" aria-valuemax="10">Slider</div>';
      const violations = runCustomRules(html);
      expect(violations.find((v) => v.id === 'custom-aria-slider-missing-values')).toBeUndefined();
    });
  });

  describe('Rule 5: Button — aria-pressed 유효하지 않은 값', () => {
    test('aria-pressed="invalid" 시 위반 감지', () => {
      const html = '<button aria-pressed="invalid">Toggle</button>';
      const violations = runCustomRules(html);
      const rule = violations.find((v) => v.id === 'custom-aria-button-invalid-pressed');
      expect(rule).toBeDefined();
      expect(rule!.nodes[0].failureSummary).toContain('invalid');
    });

    test('aria-pressed="true" 이면 위반 없음', () => {
      const html = '<button aria-pressed="true">Toggle</button>';
      const violations = runCustomRules(html);
      expect(violations.find((v) => v.id === 'custom-aria-button-invalid-pressed')).toBeUndefined();
    });

    test('aria-pressed="false" 이면 위반 없음', () => {
      const html = '<button aria-pressed="false">Toggle</button>';
      const violations = runCustomRules(html);
      expect(violations.find((v) => v.id === 'custom-aria-button-invalid-pressed')).toBeUndefined();
    });

    test('aria-pressed="mixed" 이면 위반 없음', () => {
      const html = '<button aria-pressed="mixed">Toggle</button>';
      const violations = runCustomRules(html);
      expect(violations.find((v) => v.id === 'custom-aria-button-invalid-pressed')).toBeUndefined();
    });

    test('aria-pressed 속성 자체가 없으면 위반 없음', () => {
      const html = '<button>Click</button>';
      const violations = runCustomRules(html);
      expect(violations.find((v) => v.id === 'custom-aria-button-invalid-pressed')).toBeUndefined();
    });
  });

  describe('violations 노드 구조', () => {
    test('node 에 html, target, failureSummary 필드가 존재한다', () => {
      const html = '<div role="checkbox">Check</div>';
      const violations = runCustomRules(html);
      const node = violations[0]?.nodes[0];
      expect(node).toBeDefined();
      expect(node).toHaveProperty('html');
      expect(node).toHaveProperty('target');
      expect(node).toHaveProperty('failureSummary');
      expect(Array.isArray(node.target)).toBe(true);
      expect(node.target.length).toBeGreaterThan(0);
    });

    test('html 은 200자 이내로 잘린다', () => {
      const longAttr = 'a'.repeat(300);
      const html = `<div role="checkbox" data-long="${longAttr}">Check</div>`;
      const violations = runCustomRules(html);
      const node = violations[0]?.nodes[0];
      expect(node.html.length).toBeLessThanOrEqual(200);
    });

    test('violation 의 helpUrl 이 한국 웹접근성 연구소 URL 이다', () => {
      const html = '<div role="checkbox">Check</div>';
      const violations = runCustomRules(html);
      expect(violations[0].helpUrl).toContain('wa.or.kr');
    });
  });
});
