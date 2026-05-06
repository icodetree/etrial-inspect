// KWCAG 2.2 (33개 검사항목)와 axe-core Rule ID 매핑 테이블

import type { Result as AxeResult, NodeResult as AxeNodeResult } from 'axe-core';

export interface KWCAGItem {
  id: string;
  principle: '인식의 용이성' | '운용의 용이성' | '이해의 용이성' | '견고성';
  guideline: string;
  checkItem: string;
  axeRules: string[];
  automationLevel: 'high' | 'medium' | 'manual';
  description: string;
  help: string;
}

// KWCAG 2.2 33개 검사항목 매핑
export const KWCAG_MAPPING: KWCAGItem[] = [
  // 1. 인식의 용이성 (9개 항목)
  {
    id: '1.1.1',
    principle: '인식의 용이성',
    guideline: '적절한 대체 텍스트 제공',
    checkItem: '적절한 대체 텍스트 제공',
    axeRules: ['image-alt', 'input-image-alt', 'object-alt', 'area-alt', 'svg-img-alt'],
    automationLevel: 'high',
    description: '텍스트 아닌 콘텐츠에는 그 의미나 용도를 인식할 수 있도록 대체 텍스트를 제공해야 한다.',
    help: '이미지, 버튼 등 텍스트가 없는 요소에 적절한 alt 속성이나 레이블을 제공하세요.',
  },
  {
    id: '1.2.1',
    principle: '인식의 용이성',
    guideline: '자막 제공',
    checkItem: '자막 제공',
    axeRules: ['video-caption'],
    automationLevel: 'medium',
    description: '멀티미디어 콘텐츠에는 자막, 대본 또는 수어를 제공해야 한다.',
    help: '동영상 및 오디오 콘텐츠에 동기화된 자막 혹은 텍스트 대본을 제공하세요.',
  },
  {
    id: '1.2.2',
    principle: '인식의 용이성',
    guideline: '수어 제공',
    checkItem: '수어 제공',
    axeRules: [],
    automationLevel: 'manual',
    description: '이해하기 어려운 멀티미디어 콘텐츠에는 수어를 제공해야 한다.',
    help: '청각 장애 사용자를 위해 주요 영상 콘텐츠에 수어 통역을 포함하는 것을 고려하세요.',
  },
  {
    id: '1.3.1',
    principle: '인식의 용이성',
    guideline: '콘텐츠의 선형화',
    checkItem: '콘텐츠의 선형화',
    axeRules: ['heading-order', 'list', 'definition-list', 'table-fake-caption', 'listitem'],
    automationLevel: 'medium',
    description: '콘텐츠는 논리적인 순서로 제공해야 한다.',
    help: '제목 계층구조(h1~h6)를 논리적으로 구성하고, 시각적 순서와 마크업 순서를 일치시키세요.',
  },
  {
    id: '1.3.2',
    principle: '인식의 용이성',
    guideline: '표의 구성',
    checkItem: '표의 구성',
    axeRules: ['table-caption', 'td-has-header', 'scope-attr-valid', 'th-has-data-cells'],
    automationLevel: 'high',
    description: '표는 이해하기 쉽게 구성해야 한다.',
    help: '데이터 표에는 caption 또는 summary를 제공하고, th와 scope 속성을 사용하여 제목 셀과 데이터 셀을 연결하세요.',
  },
  {
    id: '1.4.1',
    principle: '인식의 용이성',
    guideline: '명도 대비',
    checkItem: '명도 대비',
    axeRules: ['color-contrast', 'color-contrast-enhanced'],
    automationLevel: 'high',
    description: '텍스트와 배경 간의 명도 대비는 3:1 이상이어야 한다.',
    help: '텍스트와 배경의 색상 대비를 높여 시력이 낮은 사용자도 읽을 수 있도록 수정하세요. (3:1 이상 권장)',
  },
  {
    id: '1.4.2',
    principle: '인식의 용이성',
    guideline: '색에 무관한 콘텐츠 인식',
    checkItem: '색에 무관한 콘텐츠 인식',
    axeRules: ['link-in-text-block'],
    automationLevel: 'manual',
    description: '색상만으로 정보를 제공하지 않아야 한다.',
    help: '상태 변화나 중요 정보를 전달할 때 색상 외에 패턴, 밑줄, 텍스트 등을 병기하세요.',
  },
  {
    id: '1.4.3',
    principle: '인식의 용이성',
    guideline: '배경음 사용 금지',
    checkItem: '배경음 사용 금지',
    axeRules: ['no-autoplay-audio'],
    automationLevel: 'medium',
    description: '자동 재생되는 배경음을 사용하지 않아야 한다.',
    help: '페이지 접속 시 자동으로 소리가 재생되지 않게 하거나, 3초 이내에 정지할 수 있는 제어 수단을 제공하세요.',
  },
  {
    id: '1.4.4',
    principle: '인식의 용이성',
    guideline: '콘텐츠 간의 구분',
    checkItem: '콘텐츠 간의 구분',
    axeRules: [],
    automationLevel: 'manual',
    description: '이웃한 콘텐츠는 구별될 수 있어야 한다.',
    help: '테두리, 여백, 구분선 등을 사용하여 인접한 UI 요소들이 시각적으로 구분되도록 하세요.',
  },

  // 2. 운용의 용이성 (15개 항목)
  {
    id: '2.1.1',
    principle: '운용의 용이성',
    guideline: '키보드 사용 보장',
    checkItem: '키보드 사용 보장',
    axeRules: ['accesskeys', 'tabindex', 'scrollable-region-focusable'],
    automationLevel: 'medium',
    description: '모든 기능은 키보드만으로도 사용할 수 있어야 한다.',
    help: '모든 클릭 가능한 요소가 키보드 Tab키로 접근 가능하고 Enter/Space로 실행될 수 있도록 하세요.',
  },
  {
    id: '2.1.2',
    principle: '운용의 용이성',
    guideline: '초점 이동과 표시',
    checkItem: '초점 이동과 표시',
    axeRules: ['focus-order-semantics', 'tabindex'],
    automationLevel: 'medium',
    description: '키보드에 의한 초점은 논리적으로 이동해야 하며 시각적으로 구별할 수 있어야 한다.',
    help: '초점(Focus)이 이동할 때 순서가 논리적이어야 하며, 현재 어디에 초점이 있는지 명확한 테두리 등을 표시하세요.',
  },
  {
    id: '2.1.3',
    principle: '운용의 용이성',
    guideline: '조작 가능',
    checkItem: '조작 가능',
    axeRules: ['button-name', 'link-name', 'aria-hidden-focus', 'nested-interactive'],
    automationLevel: 'high',
    description: '사용자 입력 및 컨트롤은 조작 가능하도록 제공되어야 한다.',
    help: '버튼과 링크 등에 명확한 이름(네임)을 제공하고, 너무 작은 클릭 영역은 키우세요.',
  },
  {
    id: '2.1.4',
    principle: '운용의 용이성',
    guideline: '문자 단축키',
    checkItem: '문자 단축키',
    axeRules: [],
    automationLevel: 'manual',
    description: '문자 단축키는 오동작으로 인한 오류를 방지해야 한다.',
    help: '단일 문자 단축키 사용 시 이를 해제하거나 변경할 수 있는 기능을 제공하세요.',
  },
  {
    id: '2.2.1',
    principle: '운용의 용이성',
    guideline: '응답 시간 조절',
    checkItem: '응답 시간 조절',
    axeRules: ['meta-refresh'],
    automationLevel: 'medium',
    description: '시간제한이 있는 콘텐츠는 응답시간을 조절할 수 있어야 한다.',
    help: '로그인 연장 기능과 같이 시간 제한을 사용자가 연장하거나 해제할 수 있는 수단을 제공하세요.',
  },
  {
    id: '2.2.2',
    principle: '운용의 용이성',
    guideline: '정지 기능 제공',
    checkItem: '정지 기능 제공',
    axeRules: ['blink', 'marquee'],
    automationLevel: 'high',
    description: '자동으로 변경되는 콘텐츠는 움직임을 제어할 수 있어야 한다.',
    help: '자동 재생되는 슬라이드나 배너에 정지/일시정지 버튼을 제공하세요.',
  },
  {
    id: '2.3.1',
    principle: '운용의 용이성',
    guideline: '깜빡임과 번쩍임 사용 제한',
    checkItem: '깜빡임과 번쩍임 사용 제한',
    axeRules: [],
    automationLevel: 'manual',
    description: '초당 3~50회 주기로 깜빡이거나 번쩍이는 콘텐츠를 제공하지 않아야 한다.',
    help: '광과민성 발작을 일으킬 수 있는 과도한 깜빡임 효과를 제거하세요.',
  },
  {
    id: '2.4.1',
    principle: '운용의 용이성',
    guideline: '반복 영역 건너뛰기',
    checkItem: '반복 영역 건너뛰기',
    axeRules: ['bypass', 'skip-link', 'region'],
    automationLevel: 'high',
    description: '콘텐츠의 반복되는 영역은 건너뛸 수 있어야 한다.',
    help: '메인 콘텐츠로 바로 이동할 수 있는 스킵 네비게이션(본문 바로가기) 링크를 최상단에 제공하세요.',
  },
  {
    id: '2.4.2',
    principle: '운용의 용이성',
    guideline: '페이지 제목 제공',
    checkItem: '페이지 제목 제공',
    axeRules: ['document-title', 'page-has-heading-one'],
    automationLevel: 'high',
    description: '페이지, 프레임, 콘텐츠 블록에는 적절한 제목을 제공해야 한다.',
    help: '각 <title> 태그에 페이지 특성을 담은 제목을 넣고, iframe 등에도 title 속성을 제공하세요.',
  },
  {
    id: '2.4.3',
    principle: '운용의 용이성',
    guideline: '적절한 링크 텍스트',
    checkItem: '적절한 링크 텍스트',
    axeRules: ['link-name', 'link-in-text-block', 'identical-links-same-purpose'],
    automationLevel: 'high',
    description: '링크 텍스트는 용도나 목적을 이해할 수 있도록 제공해야 한다.',
    help: '"더보기"와 같이 모호한 텍스트 대신 "공지사항 더보기"와 같이 목적이 명확한 링크 텍스트를 제공하세요.',
  },
  {
    id: '2.4.4',
    principle: '운용의 용이성',
    guideline: '고정된 참조 위치 정보',
    checkItem: '고정된 참조 위치 정보',
    axeRules: [],
    automationLevel: 'manual',
    description: '전자출판문서 형식의 웹 페이지는 각 페이지로 이동할 수 있는 기능이 있어야 한다.',
    help: '문서 내에서 목차나 페이지 이동 기능을 제공하여 접근성을 높이세요.',
  },
  {
    id: '2.5.1',
    principle: '운용의 용이성',
    guideline: '단일 포인터 입력 지원',
    checkItem: '단일 포인터 입력 지원',
    axeRules: [],
    automationLevel: 'manual',
    description: '다중 포인터 또는 경로 기반 동작은 단일 포인터로도 조작할 수 있어야 한다.',
    help: '두 손가락 줌인/아웃 등의 동작 외에도 버튼 클릭만으로 동일한 기능을 수행할 수 있게 하세요.',
  },
  {
    id: '2.5.2',
    principle: '운용의 용이성',
    guideline: '포인터 입력 취소',
    checkItem: '포인터 입력 취소',
    axeRules: [],
    automationLevel: 'manual',
    description: '포인터의 다운 이벤트로 실행된 기능은 취소할 수 있어야 한다.',
    help: '마우스 왼쪽 버튼을 뗄 때 기능이 실행되도록 하거나, 드래그 중에 취소할 수 있도록 구현하세요.',
  },
  {
    id: '2.5.3',
    principle: '운용의 용이성',
    guideline: '레이블과 네임',
    checkItem: '레이블과 네임',
    axeRules: ['label-content-name-mismatch'],
    automationLevel: 'high',
    description: '텍스트 또는 텍스트 이미지가 포함된 레이블이 있는 사용자 인터페이스 구성요소는 네임에 시각적으로 표시되는 텍스트를 포함해야 한다.',
    help: '시각적으로 보이는 텍스트와 스크린 리더가 읽어주는 aria-label 등의 텍스트를 일치시키세요.',
  },
  {
    id: '2.5.4',
    principle: '운용의 용이성',
    guideline: '동작기반 작동',
    checkItem: '동작기반 작동',
    axeRules: [],
    automationLevel: 'manual',
    description: '기기의 움직임이나 사용자의 움직임으로 동작되는 기능은 대체 수단을 제공해야 한다.',
    help: '스마트폰을 흔들어 취소하는 기능 외에도 화면상에 취소 버튼을 별도로 제공하세요.',
  },

  // 3. 이해의 용이성 (7개 항목)
  {
    id: '3.1.1',
    principle: '이해의 용이성',
    guideline: '기본 언어 표시',
    checkItem: '기본 언어 표시',
    axeRules: ['html-has-lang', 'html-lang-valid', 'valid-lang'],
    automationLevel: 'high',
    description: '주로 사용하는 언어를 명시해야 한다.',
    help: '<html lang="ko">와 같이 문서의 기본 언어를 속성으로 명시하세요.',
  },
  {
    id: '3.2.1',
    principle: '이해의 용이성',
    guideline: '사용자 요구에 따른 실행',
    checkItem: '사용자 요구에 따른 실행',
    axeRules: ['select-name'],
    automationLevel: 'medium',
    description: '사용자가 의도하지 않은 기능이 실행되지 않아야 한다.',
    help: '초점을 받았을 때 갑자기 창이 열리거나 폼이 제출되는 등 예기치 않은 동작을 방지하세요.',
  },
  {
    id: '3.3.1',
    principle: '이해의 용이성',
    guideline: '콘텐츠의 선형 구조',
    checkItem: '콘텐츠의 선형 구조',
    axeRules: ['presentation-role-conflict'],
    automationLevel: 'medium',
    description: '콘텐츠는 논리적인 순서로 제공해야 한다.',
    help: 'DOM 순서와 탭 순서를 일치시켜 논리적인 흐름으로 콘텐츠를 제공하세요.',
  },
  {
    id: '3.4.1',
    principle: '이해의 용이성',
    guideline: '오류 정정',
    checkItem: '오류 정정',
    axeRules: ['aria-input-field-name', 'autocomplete-valid'],
    automationLevel: 'medium',
    description: '입력 오류를 정정할 수 있는 방법을 제공해야 한다.',
    help: '입력 오류 발생 시 명확한 메시지를 제공하고 다시 입력할 수 있는 안내를 충분히 제공하세요.',
  },
  {
    id: '3.4.2',
    principle: '이해의 용이성',
    guideline: '레이블 제공',
    checkItem: '레이블 제공',
    axeRules: ['label', 'form-field-multiple-labels', 'input-button-name'],
    automationLevel: 'high',
    description: '사용자 입력에는 대응하는 레이블을 제공해야 한다.',
    help: '<input> 요소에 대응하는 <label> 태그를 제공하고 id/for 속성으로 연결하세요.',
  },
  {
    id: '3.4.3',
    principle: '이해의 용이성',
    guideline: '접근 가능한 인증',
    checkItem: '접근 가능한 인증',
    axeRules: [],
    automationLevel: 'manual',
    description: '인증 과정은 인지 기능 테스트에만 의존하지 않아야 한다.',
    help: '복잡한 계산이나 퍼즐 외에도 이메일 인증 등 대체 인증 수단을 제공하세요.',
  },
  {
    id: '3.4.4',
    principle: '이해의 용이성',
    guideline: '반복 입력 정보',
    checkItem: '반복 입력 정보',
    axeRules: [],
    automationLevel: 'manual',
    description: '반복되는 입력 정보는 자동 입력 또는 선택 입력할 수 있어야 한다.',
    help: '사용자가 이전에 입력한 정보를 다시 활용할 수 있도록 자동 완성 기능을 제공하세요.',
  },

  // 4. 견고성 (2개 항목)
  {
    id: '4.1.1',
    principle: '견고성',
    guideline: '마크업 오류 방지',
    checkItem: '마크업 오류 방지',
    axeRules: ['duplicate-id', 'duplicate-id-active', 'duplicate-id-aria'],
    automationLevel: 'high',
    description: '마크업 언어의 요소는 열고 닫음, 중첩 관계 및 속성 선언에 오류가 없어야 한다.',
    help: 'id 중복을 피하고 태그의 중첩 관계(부모/자식)가 올바른지 확인하세요.',
  },
  {
    id: '4.1.2',
    principle: '견고성',
    guideline: '웹 애플리케이션 접근성 준수',
    checkItem: '웹 애플리케이션 접근성 준수',
    axeRules: [
      'aria-allowed-attr',
      'aria-allowed-role',
      'aria-hidden-body',
      'aria-required-attr',
      'aria-required-children',
      'aria-required-parent',
      'aria-roles',
      'aria-valid-attr',
      'aria-valid-attr-value',
      // Custom Rules
      'custom-aria-tab-missing-selected',
      'custom-aria-tab-missing-controls',
      'custom-aria-checkbox-missing-checked',
      'custom-aria-radio-missing-checked',
      'custom-aria-slider-missing-values',
      'custom-aria-button-invalid-pressed',
    ],
    automationLevel: 'high',
    description: '웹 애플리케이션은 접근성이 있어야 한다.',
    help: '정해진 ARIA 속성을 올바르게 사용하고 시맨틱 태그를 우선적으로 사용하세요.',
  },
];

// axe-core Rule ID로 KWCAG 항목 찾기
export function getKWCAGByAxeRule(ruleId: string): KWCAGItem | undefined {
  return KWCAG_MAPPING.find((item) => item.axeRules.includes(ruleId));
}

// 모든 axe-core Rule ID 목록 (KWCAG 매핑된 것만)
export function getAllMappedAxeRules(): string[] {
  const rules: string[] = [];
  KWCAG_MAPPING.forEach((item) => {
    item.axeRules.forEach((rule) => {
      if (!rules.includes(rule)) {
        rules.push(rule);
      }
    });
  });
  return rules;
}

// 원칙별 KWCAG 항목 필터링
export function getKWCAGByPrinciple(principle: KWCAGItem['principle']): KWCAGItem[] {
  return KWCAG_MAPPING.filter((item) => item.principle === principle);
}

// axe-core 결과를 KWCAG 형식으로 변환
export interface KWCAGViolation {
  kwcagId: string;
  kwcagName: string;
  principle: string;
  axeRuleId: string;
  description: string;
  impact: string;
  nodes: {
    html: string;
    target: string[];
    failureSummary: string;
    boundingBox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }[];
  help: string;
  helpUrl: string;
}

/**
 * axe-core 의 NodeResult 에 우리쪽 크롤러가 부착한 boundingBox 까지 허용하는 확장 타입.
 * accessibility-auditor 의 page.evaluate 가 element.getBoundingClientRect() 결과를 추가한다.
 *
 * NodeResult 의 일부 필드(any/all/none, target 형태 등)는 convertAxeToKWCAG 에서 사용하지 않으므로
 * Partial 로 두어 호출자(accessibility-auditor, custom-rules, 테스트)가 가벼운 객체를 넘길 수 있게 한다.
 */
export type AxeNodeLike = Pick<AxeNodeResult, 'html'> & {
  target: AxeNodeResult['target'] | string[];
  failureSummary?: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

/**
 * convertAxeToKWCAG 가 실제로 참조하는 필드만 picking.
 * `tags` 등 axe Result 의 부가 메타는 변환에 필요 없으므로 요구하지 않는다.
 *
 * `impact` 는 axe 의 ImpactValue 외에도 커스텀 룰이 부여하는 임의 문자열,
 * 또는 `null`(축소판/legacy) 까지 들어올 수 있어 넉넉히 받는다.
 */
export type AxeViolationLike = Pick<
  AxeResult,
  'id' | 'description' | 'help' | 'helpUrl'
> & {
  impact?: AxeResult['impact'] | string | null;
  nodes: AxeNodeLike[];
};

export function convertAxeToKWCAG(axeResults: {
  violations: AxeViolationLike[];
}): KWCAGViolation[] {
  const kwcagViolations: KWCAGViolation[] = [];

  for (const violation of axeResults.violations) {
    const kwcagItem = getKWCAGByAxeRule(violation.id);

    // axe NodeResult.target 은 UnlabelledFrameSelector(string|string[]) 이지만
    // KWCAGViolation.nodes[].target 은 string[] 로 정규화한다.
    const normalizedNodes = violation.nodes.map((node) => ({
      html: node.html,
      target: Array.isArray(node.target)
        ? node.target.map((t) => (typeof t === 'string' ? t : String(t)))
        : [String(node.target)],
      failureSummary: node.failureSummary ?? '',
      boundingBox: node.boundingBox,
    }));

    if (kwcagItem) {
      kwcagViolations.push({
        kwcagId: kwcagItem.id,
        kwcagName: kwcagItem.checkItem,
        principle: kwcagItem.principle,
        axeRuleId: violation.id,
        description: kwcagItem.description || violation.description,
        impact: (violation.impact ?? 'minor') as string,
        nodes: normalizedNodes,
        help: kwcagItem.help || violation.help,
        helpUrl: violation.helpUrl,
      });
    } else {
      // 매핑되지 않은 axe 규칙도 포함
      kwcagViolations.push({
        kwcagId: '기타',
        kwcagName: '기타 접근성 지침 (WCAG)',
        principle: '기타',
        axeRuleId: violation.id,
        description: violation.description,
        impact: (violation.impact ?? 'minor') as string,
        nodes: normalizedNodes,
        help: violation.help,
        helpUrl: violation.helpUrl,
      });
    }
  }

  return kwcagViolations;
}
