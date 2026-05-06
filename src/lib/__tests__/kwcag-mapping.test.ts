/**
 * kwcag-mapping 단위 테스트
 *
 * axe-core ruleId → KWCAG 2.2 항목 변환은 "raw axe 결과는 절대 UI에
 * 노출되면 안 된다" (CLAUDE.md Hard rule)는 게이트의 핵심이다.
 * 매핑 테이블 회귀 / 누락 / fallback 처리 모두를 검증한다.
 */

import {
  KWCAG_MAPPING,
  KWCAGItem,
  KWCAGViolation,
  convertAxeToKWCAG,
  getAllMappedAxeRules,
  getKWCAGByAxeRule,
  getKWCAGByPrinciple,
} from '../kwcag-mapping';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type AxeNode = {
  html: string;
  target: string[];
  failureSummary: string;
};

function makeAxeNode(overrides: Partial<AxeNode> = {}): AxeNode {
  return {
    html: '<img src="x.png">',
    target: ['img'],
    failureSummary: 'Fix any of the following: ...',
    ...overrides,
  };
}

function makeAxeViolation(overrides: {
  id: string;
  impact?: string | null;
  description?: string;
  help?: string;
  helpUrl?: string;
  nodes?: AxeNode[];
}) {
  return {
    id: overrides.id,
    impact: overrides.impact === undefined ? 'serious' : overrides.impact,
    description: overrides.description ?? `axe description for ${overrides.id}`,
    help: overrides.help ?? `axe help for ${overrides.id}`,
    helpUrl: overrides.helpUrl ?? `https://dequeuniversity.com/rules/axe/4.x/${overrides.id}`,
    nodes: overrides.nodes ?? [makeAxeNode()],
  };
}

// ---------------------------------------------------------------------------
// Table-driven 매핑 검증 (axe ruleId → KWCAG 항목)
// ---------------------------------------------------------------------------

/**
 * KWCAG_MAPPING 테이블을 직접 변경하지 않도록 보호하는 회귀 테스트.
 * 각 row 는 (axeRuleId, expected KWCAG id, expected principle) 의 3-튜플.
 */
const RULE_TO_KWCAG: Array<{
  axeRuleId: string;
  kwcagId: string;
  principle: KWCAGItem['principle'];
}> = [
  // 1.1.1 적절한 대체 텍스트 제공
  { axeRuleId: 'image-alt', kwcagId: '1.1.1', principle: '인식의 용이성' },
  { axeRuleId: 'area-alt', kwcagId: '1.1.1', principle: '인식의 용이성' },
  { axeRuleId: 'input-image-alt', kwcagId: '1.1.1', principle: '인식의 용이성' },
  { axeRuleId: 'svg-img-alt', kwcagId: '1.1.1', principle: '인식의 용이성' },
  { axeRuleId: 'object-alt', kwcagId: '1.1.1', principle: '인식의 용이성' },

  // 1.2.1 자막 제공
  { axeRuleId: 'video-caption', kwcagId: '1.2.1', principle: '인식의 용이성' },

  // 1.3.1 콘텐츠의 선형화 (제목 계층/리스트 구조)
  { axeRuleId: 'heading-order', kwcagId: '1.3.1', principle: '인식의 용이성' },
  { axeRuleId: 'list', kwcagId: '1.3.1', principle: '인식의 용이성' },
  { axeRuleId: 'listitem', kwcagId: '1.3.1', principle: '인식의 용이성' },

  // 1.3.2 표의 구성
  { axeRuleId: 'table-caption', kwcagId: '1.3.2', principle: '인식의 용이성' },
  { axeRuleId: 'td-has-header', kwcagId: '1.3.2', principle: '인식의 용이성' },
  { axeRuleId: 'th-has-data-cells', kwcagId: '1.3.2', principle: '인식의 용이성' },

  // 1.4.1 명도 대비 (color-contrast)
  { axeRuleId: 'color-contrast', kwcagId: '1.4.1', principle: '인식의 용이성' },
  { axeRuleId: 'color-contrast-enhanced', kwcagId: '1.4.1', principle: '인식의 용이성' },

  // 2.1.1 키보드 사용 보장
  { axeRuleId: 'accesskeys', kwcagId: '2.1.1', principle: '운용의 용이성' },
  { axeRuleId: 'scrollable-region-focusable', kwcagId: '2.1.1', principle: '운용의 용이성' },

  // 2.1.2 초점 이동과 표시
  { axeRuleId: 'focus-order-semantics', kwcagId: '2.1.2', principle: '운용의 용이성' },

  // 2.1.3 조작 가능 (button-name 은 2.1.3 에 있음)
  { axeRuleId: 'button-name', kwcagId: '2.1.3', principle: '운용의 용이성' },
  { axeRuleId: 'aria-hidden-focus', kwcagId: '2.1.3', principle: '운용의 용이성' },
  { axeRuleId: 'nested-interactive', kwcagId: '2.1.3', principle: '운용의 용이성' },

  // 2.4.1 반복 영역 건너뛰기
  { axeRuleId: 'bypass', kwcagId: '2.4.1', principle: '운용의 용이성' },
  { axeRuleId: 'skip-link', kwcagId: '2.4.1', principle: '운용의 용이성' },
  { axeRuleId: 'region', kwcagId: '2.4.1', principle: '운용의 용이성' },

  // 2.4.2 페이지 제목 제공
  { axeRuleId: 'document-title', kwcagId: '2.4.2', principle: '운용의 용이성' },
  { axeRuleId: 'page-has-heading-one', kwcagId: '2.4.2', principle: '운용의 용이성' },

  // 2.4.3 적절한 링크 텍스트 (link-name 은 2.4.3 에 첫 매칭)
  { axeRuleId: 'identical-links-same-purpose', kwcagId: '2.4.3', principle: '운용의 용이성' },

  // 3.1.1 기본 언어 표시
  { axeRuleId: 'html-has-lang', kwcagId: '3.1.1', principle: '이해의 용이성' },
  { axeRuleId: 'html-lang-valid', kwcagId: '3.1.1', principle: '이해의 용이성' },
  { axeRuleId: 'valid-lang', kwcagId: '3.1.1', principle: '이해의 용이성' },

  // 3.2.1 사용자 요구에 따른 실행
  { axeRuleId: 'select-name', kwcagId: '3.2.1', principle: '이해의 용이성' },

  // 3.4.1 오류 정정
  { axeRuleId: 'aria-input-field-name', kwcagId: '3.4.1', principle: '이해의 용이성' },
  { axeRuleId: 'autocomplete-valid', kwcagId: '3.4.1', principle: '이해의 용이성' },

  // 3.4.2 레이블 제공
  { axeRuleId: 'label', kwcagId: '3.4.2', principle: '이해의 용이성' },
  { axeRuleId: 'form-field-multiple-labels', kwcagId: '3.4.2', principle: '이해의 용이성' },

  // 4.1.1 마크업 오류 방지
  { axeRuleId: 'duplicate-id', kwcagId: '4.1.1', principle: '견고성' },
  { axeRuleId: 'duplicate-id-active', kwcagId: '4.1.1', principle: '견고성' },
  { axeRuleId: 'duplicate-id-aria', kwcagId: '4.1.1', principle: '견고성' },

  // 4.1.2 웹 애플리케이션 접근성 준수
  { axeRuleId: 'aria-allowed-attr', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-allowed-role', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-required-attr', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-required-children', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-required-parent', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-roles', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-valid-attr', kwcagId: '4.1.2', principle: '견고성' },
  { axeRuleId: 'aria-valid-attr-value', kwcagId: '4.1.2', principle: '견고성' },
];

describe('KWCAG_MAPPING 테이블 자체 무결성', () => {
  test('33개 KWCAG 검사항목이 모두 정의되어 있다', () => {
    expect(KWCAG_MAPPING).toHaveLength(33);
  });

  test('모든 항목이 필수 필드를 갖는다', () => {
    for (const item of KWCAG_MAPPING) {
      expect(item.id).toMatch(/^\d+\.\d+\.\d+$/);
      expect(item.principle).toBeDefined();
      expect(typeof item.guideline).toBe('string');
      expect(item.guideline.length).toBeGreaterThan(0);
      expect(typeof item.checkItem).toBe('string');
      expect(item.checkItem.length).toBeGreaterThan(0);
      expect(Array.isArray(item.axeRules)).toBe(true);
      expect(['high', 'medium', 'manual']).toContain(item.automationLevel);
      expect(typeof item.description).toBe('string');
      expect(typeof item.help).toBe('string');
    }
  });

  test('KWCAG id 는 중복되지 않는다', () => {
    const ids = KWCAG_MAPPING.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('자동화 가능(automationLevel != manual) 항목은 axeRules 가 비어있지 않다', () => {
    const autoItems = KWCAG_MAPPING.filter((i) => i.automationLevel !== 'manual');
    for (const item of autoItems) {
      expect(item.axeRules.length).toBeGreaterThan(0);
    }
  });
});

describe('getKWCAGByAxeRule — table-driven 매핑 검증', () => {
  test.each(RULE_TO_KWCAG)(
    'axe rule "$axeRuleId" 는 KWCAG $kwcagId ($principle) 으로 매핑된다',
    ({ axeRuleId, kwcagId, principle }) => {
      const result = getKWCAGByAxeRule(axeRuleId);
      expect(result).toBeDefined();
      expect(result!.id).toBe(kwcagId);
      expect(result!.principle).toBe(principle);
      // 매핑된 항목의 axeRules 배열에는 해당 ruleId가 포함되어 있어야 한다
      expect(result!.axeRules).toContain(axeRuleId);
    }
  );

  test('30개 이상의 핵심 axe ruleId 매핑이 검증된다', () => {
    expect(RULE_TO_KWCAG.length).toBeGreaterThanOrEqual(30);
  });

  test('매핑되지 않은 unknown ruleId 는 undefined 를 반환한다', () => {
    expect(getKWCAGByAxeRule('fake-rule-xyz')).toBeUndefined();
    expect(getKWCAGByAxeRule('')).toBeUndefined();
    expect(getKWCAGByAxeRule('not-a-real-axe-rule')).toBeUndefined();
  });

  test('Custom rule prefix(`custom-`) 도 매핑 테이블에서 찾을 수 있다', () => {
    const result = getKWCAGByAxeRule('custom-aria-tab-missing-selected');
    expect(result).toBeDefined();
    expect(result!.id).toBe('4.1.2');
    expect(result!.principle).toBe('견고성');
  });
});

describe('getAllMappedAxeRules', () => {
  test('매핑 테이블의 모든 axeRules 를 반환한다', () => {
    const allRules = getAllMappedAxeRules();
    expect(allRules.length).toBeGreaterThan(0);
    // 대표적인 rule 들이 포함되어 있어야 한다
    expect(allRules).toContain('image-alt');
    expect(allRules).toContain('color-contrast');
    expect(allRules).toContain('label');
    expect(allRules).toContain('button-name');
    expect(allRules).toContain('html-has-lang');
  });

  test('중복 없이 unique 한 ruleId 만 반환한다', () => {
    const allRules = getAllMappedAxeRules();
    expect(new Set(allRules).size).toBe(allRules.length);
  });

  test('빈 axeRules 를 가진 manual 항목은 결과에 영향을 주지 않는다', () => {
    const allRules = getAllMappedAxeRules();
    expect(allRules).not.toContain('');
    expect(allRules).not.toContain(undefined);
    expect(allRules).not.toContain(null);
  });

  test('table-driven 케이스에 명시된 모든 ruleId 가 결과에 포함된다', () => {
    const allRules = getAllMappedAxeRules();
    for (const { axeRuleId } of RULE_TO_KWCAG) {
      expect(allRules).toContain(axeRuleId);
    }
  });
});

describe('getKWCAGByPrinciple', () => {
  test.each([
    ['인식의 용이성', 9],
    ['운용의 용이성', 15],
    ['이해의 용이성', 7],
    ['견고성', 2],
  ] as Array<[KWCAGItem['principle'], number]>)(
    '"%s" 원칙에 속한 항목 수는 %i 이다',
    (principle, expectedCount) => {
      const items = getKWCAGByPrinciple(principle);
      expect(items).toHaveLength(expectedCount);
      // 모든 결과가 해당 principle 인지 확인
      for (const item of items) {
        expect(item.principle).toBe(principle);
      }
    }
  );

  test('네 가지 원칙 결과의 합은 33 (전체 KWCAG 항목 수) 이다', () => {
    const total =
      getKWCAGByPrinciple('인식의 용이성').length +
      getKWCAGByPrinciple('운용의 용이성').length +
      getKWCAGByPrinciple('이해의 용이성').length +
      getKWCAGByPrinciple('견고성').length;
    expect(total).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// convertAxeToKWCAG — axe 결과 → KWCAG 변환 (Hard rule 게이트)
// ---------------------------------------------------------------------------

describe('convertAxeToKWCAG — 매핑된 ruleId', () => {
  test('매핑된 axe violation 은 KWCAG 항목 정보로 enrich 된다', () => {
    const axeResults = {
      violations: [
        makeAxeViolation({
          id: 'image-alt',
          impact: 'critical',
          description: 'axe original description',
          help: 'axe original help',
        }),
      ],
    };

    const result = convertAxeToKWCAG(axeResults);

    expect(result).toHaveLength(1);
    const v = result[0];
    expect(v.kwcagId).toBe('1.1.1');
    expect(v.kwcagName).toBe('적절한 대체 텍스트 제공');
    expect(v.principle).toBe('인식의 용이성');
    expect(v.axeRuleId).toBe('image-alt');
    expect(v.impact).toBe('critical');
    // KWCAG 자체 description / help 가 우선 사용된다
    expect(v.description).not.toBe('axe original description');
    expect(v.description.length).toBeGreaterThan(0);
    expect(v.help).not.toBe('axe original help');
    expect(v.help.length).toBeGreaterThan(0);
    // helpUrl 은 axe 의 것을 그대로 사용
    expect(v.helpUrl).toBe('https://dequeuniversity.com/rules/axe/4.x/image-alt');
    // nodes 는 그대로 전달
    expect(v.nodes).toHaveLength(1);
    expect(v.nodes[0].target).toEqual(['img']);
  });

  test.each([
    { ruleId: 'color-contrast', kwcagId: '1.4.1', kwcagName: '명도 대비' },
    { ruleId: 'label', kwcagId: '3.4.2', kwcagName: '레이블 제공' },
    { ruleId: 'duplicate-id', kwcagId: '4.1.1', kwcagName: '마크업 오류 방지' },
    {
      ruleId: 'aria-allowed-attr',
      kwcagId: '4.1.2',
      kwcagName: '웹 애플리케이션 접근성 준수',
    },
    { ruleId: 'html-has-lang', kwcagId: '3.1.1', kwcagName: '기본 언어 표시' },
  ])(
    '"$ruleId" violation 은 KWCAG $kwcagId / "$kwcagName" 으로 변환된다',
    ({ ruleId, kwcagId, kwcagName }) => {
      const result = convertAxeToKWCAG({
        violations: [makeAxeViolation({ id: ruleId })],
      });
      expect(result).toHaveLength(1);
      expect(result[0].kwcagId).toBe(kwcagId);
      expect(result[0].kwcagName).toBe(kwcagName);
      expect(result[0].axeRuleId).toBe(ruleId);
    }
  );

  test('여러 violation 이 순서대로 변환된다', () => {
    const result = convertAxeToKWCAG({
      violations: [
        makeAxeViolation({ id: 'image-alt' }),
        makeAxeViolation({ id: 'color-contrast' }),
        makeAxeViolation({ id: 'label' }),
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0].kwcagId).toBe('1.1.1');
    expect(result[1].kwcagId).toBe('1.4.1');
    expect(result[2].kwcagId).toBe('3.4.2');
  });

  test('violations 가 비어있으면 빈 배열을 반환한다', () => {
    expect(convertAxeToKWCAG({ violations: [] })).toEqual([]);
  });
});

describe('convertAxeToKWCAG — fallback (매핑되지 않은 ruleId)', () => {
  test('매핑되지 않은 ruleId 는 "기타" 카테고리로 분류된다', () => {
    const axeResults = {
      violations: [
        makeAxeViolation({
          id: 'fake-rule-xyz',
          description: 'fallback description',
          help: 'fallback help',
        }),
      ],
    };

    const result = convertAxeToKWCAG(axeResults);

    expect(result).toHaveLength(1);
    const v = result[0];
    expect(v.kwcagId).toBe('기타');
    expect(v.kwcagName).toBe('기타 접근성 지침 (WCAG)');
    expect(v.principle).toBe('기타');
    expect(v.axeRuleId).toBe('fake-rule-xyz');
    // fallback 시에는 axe 의 description / help 가 그대로 사용됨
    expect(v.description).toBe('fallback description');
    expect(v.help).toBe('fallback help');
  });

  test('매핑된 violation 과 매핑되지 않은 violation 이 섞여 있어도 정확히 분류된다', () => {
    const result = convertAxeToKWCAG({
      violations: [
        makeAxeViolation({ id: 'image-alt' }),
        makeAxeViolation({ id: 'unknown-axe-rule' }),
        makeAxeViolation({ id: 'color-contrast' }),
      ],
    });
    expect(result).toHaveLength(3);
    expect(result[0].kwcagId).toBe('1.1.1');
    expect(result[1].kwcagId).toBe('기타');
    expect(result[2].kwcagId).toBe('1.4.1');
  });
});

describe('convertAxeToKWCAG — impact 처리', () => {
  test.each([
    ['critical', 'critical'],
    ['serious', 'serious'],
    ['moderate', 'moderate'],
    ['minor', 'minor'],
  ])('impact "%s" 는 그대로 전달된다', (input, expected) => {
    const result = convertAxeToKWCAG({
      violations: [makeAxeViolation({ id: 'image-alt', impact: input })],
    });
    expect(result[0].impact).toBe(expected);
  });

  test('impact 가 null 이면 "minor" 로 fallback 된다 (매핑된 ruleId)', () => {
    const result = convertAxeToKWCAG({
      violations: [makeAxeViolation({ id: 'image-alt', impact: null })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].impact).toBe('minor');
  });

  test('impact 가 undefined 이면 "minor" 로 fallback 된다 (매핑된 ruleId)', () => {
    const violation = {
      id: 'image-alt',
      description: 'd',
      help: 'h',
      helpUrl: 'u',
      nodes: [makeAxeNode()],
      // impact 필드 누락
    };
    const result = convertAxeToKWCAG({ violations: [violation] });
    expect(result).toHaveLength(1);
    expect(result[0].impact).toBe('minor');
  });

  test('impact 가 null 이면 fallback ruleId 경로에서도 "minor" 로 처리된다', () => {
    const result = convertAxeToKWCAG({
      violations: [makeAxeViolation({ id: 'unknown-rule', impact: null })],
    });
    expect(result).toHaveLength(1);
    expect(result[0].kwcagId).toBe('기타');
    expect(result[0].impact).toBe('minor');
  });
});

describe('convertAxeToKWCAG — 결과 shape (Hard rule 검증)', () => {
  test('변환 결과는 항상 KWCAGViolation shape 를 갖는다 (raw axe shape 노출 금지)', () => {
    const result = convertAxeToKWCAG({
      violations: [
        makeAxeViolation({ id: 'image-alt' }),
        makeAxeViolation({ id: 'completely-unknown-rule' }),
      ],
    });

    for (const v of result as KWCAGViolation[]) {
      // Hard rule: KWCAG-shaped 데이터만 외부로 나간다
      expect(v).toHaveProperty('kwcagId');
      expect(v).toHaveProperty('kwcagName');
      expect(v).toHaveProperty('principle');
      expect(v).toHaveProperty('axeRuleId');
      expect(v).toHaveProperty('description');
      expect(v).toHaveProperty('nodes');
      expect(v).toHaveProperty('help');
      expect(v).toHaveProperty('helpUrl');
      // raw axe 의 'id' 키는 그대로 노출되면 안 된다 (axeRuleId 로 rename)
      expect(v).not.toHaveProperty('id');
    }
  });

  test('nodes 배열은 그대로 (빈 배열 포함) 전달된다', () => {
    const node1 = makeAxeNode({ target: ['#a'], html: '<a>1</a>' });
    const node2 = makeAxeNode({ target: ['#b'], html: '<b>2</b>' });
    const result = convertAxeToKWCAG({
      violations: [makeAxeViolation({ id: 'image-alt', nodes: [node1, node2] })],
    });
    expect(result[0].nodes).toHaveLength(2);
    expect(result[0].nodes[0].target).toEqual(['#a']);
    expect(result[0].nodes[1].target).toEqual(['#b']);
  });

  test('node.target 이 단일 string 이어도 string[] 로 정규화된다', () => {
    // axe-core 의 target 은 UnlabelledFrameSelector (string|string[]) 인데
    // KWCAGViolation.nodes[].target 은 string[] 로 정규화되어야 한다.
    const violationWithStringTarget = {
      id: 'image-alt',
      impact: 'serious',
      description: 'd',
      help: 'h',
      helpUrl: 'u',
      nodes: [
        // 의도적으로 target 을 string 으로
        { html: '<img>', target: '.lone-target' as unknown as string[], failureSummary: 'fs' },
      ],
    };
    const result = convertAxeToKWCAG({
      violations: [violationWithStringTarget as never],
    });
    expect(result[0].nodes[0].target).toEqual(['.lone-target']);
  });

  test('node.failureSummary 가 누락되면 빈 문자열로 fallback 된다', () => {
    const node = {
      html: '<img>',
      target: ['img'],
      // failureSummary 누락
    } as unknown as AxeNode;
    const result = convertAxeToKWCAG({
      violations: [makeAxeViolation({ id: 'image-alt', nodes: [node] })],
    });
    expect(result[0].nodes[0].failureSummary).toBe('');
  });

  test('node.boundingBox 가 있으면 그대로 보존된다', () => {
    const node = {
      html: '<img>',
      target: ['img'],
      failureSummary: 'fs',
      boundingBox: { x: 10, y: 20, width: 100, height: 50 },
    } as unknown as AxeNode;
    const result = convertAxeToKWCAG({
      violations: [makeAxeViolation({ id: 'image-alt', nodes: [node] })],
    });
    expect(result[0].nodes[0].boundingBox).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
  });
});
