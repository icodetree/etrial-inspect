/**
 * AuditResult 통합 테스트용 픽스처.
 *
 * 목적: AuditExecutor.runAudit 의 출력 / NotionService.saveAuditResult 의 입력 /
 *      excel-generator.generateAuditReport 의 입력 — 3자가 동일 데이터로 통과하는 것을 강제.
 *
 * Phase 3 의 God-module 분해(AuditExecutor / NotionService) 진행 시 회귀 안전망으로 사용.
 *
 * 픽스처 변형:
 *  - `baseAuditResult`           : 풍부한 단일 픽스처 — 다양한 impact/매핑/옵션 필드 포함
 *  - `roundTripFriendlyResult`   : NotionService 의 compact + enrich 사이클을 견디는 미니멀 픽스처
 *  - `largeAuditResult`          : violations 200+ — Notion 100블록 청킹 경계 강제
 *  - `hugeJsonAuditResult`       : 단일 violation 의 affectedCode 가 거대(>200KB) — 2000자 청크 100개 한계 유발
 *  - `fixtureWithoutOptionalFields`: optional 필드(seoResult/warnings/screenshotUrl/artifactName/spa) 누락 변형
 */

import type {
  AuditResult,
  PageInfo,
  Violation,
  AuditSpaSummary,
  AuditReliabilitySummary,
} from '@/types';
import { KWCAG_MAPPING } from '@/lib/kwcag-mapping';

// ─────────────────────────────────────────────────────────────────────
// 도우미 — KWCAG 매핑에서 description/help/principle/checkItem 를 가져와
// enrichViolation 후 round-trip 동등성 비교가 가능한 violation 을 만든다.
// ─────────────────────────────────────────────────────────────────────

const kwcagItemFor = (kwcagId: string) => {
  const item = KWCAG_MAPPING.find((k) => k.id === kwcagId);
  if (!item) {
    throw new Error(
      `audit-result.fixture: KWCAG_MAPPING 에 id="${kwcagId}" 항목이 없습니다. 픽스처를 갱신하세요.`,
    );
  }
  return item;
};

/**
 * enrichViolation 의 backfill 동작을 시뮬레이트해 round-trip 후에도 toEqual 이
 * 통과하도록 구성된 Violation 빌더.
 */
function buildEnrichFriendlyViolation(opts: {
  kwcagId: string;
  axeRuleId: string;
  impact: Violation['impact'];
  pageUrl: string;
  pageTitle: string;
  affectedCode: string;
  selector?: string;
  occurrenceCount?: number;
  helpUrl?: string;
  screenshotPath?: string;
  boundingBox?: Violation['boundingBox'];
  violationNumber?: number;
}): Violation {
  const k = kwcagItemFor(opts.kwcagId);
  return {
    pageUrl: opts.pageUrl,
    pageTitle: opts.pageTitle,
    // depth1~4 는 enrich 가 ''로 backfill 하므로 round-trip 통과를 위해 빈 값으로
    depth1: '',
    depth2: '',
    depth3: '',
    depth4: '',
    platform: 'PC',
    inspector: '시스템',
    inspectionDate: '',
    violationNumber: opts.violationNumber ?? 0,
    kwcagId: opts.kwcagId,
    kwcagName: k.checkItem,
    principle: k.principle,
    axeRuleId: opts.axeRuleId,
    description: k.description,
    impact: opts.impact,
    affectedCode: opts.affectedCode,
    help: k.help,
    helpUrl: opts.helpUrl ?? '',
    selector: opts.selector,
    occurrenceCount: opts.occurrenceCount,
    screenshotPath: opts.screenshotPath,
    boundingBox: opts.boundingBox,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 페이지 픽스처 (다중 페이지)
// ─────────────────────────────────────────────────────────────────────

const samplePages: PageInfo[] = [
  {
    url: 'https://example.com/',
    title: '홈',
    depth1: '홈',
    depth2: '',
    depth3: '',
    depth4: '',
  },
  {
    url: 'https://example.com/products',
    title: '제품 목록',
    depth1: '제품',
    depth2: '목록',
    depth3: '',
    depth4: '',
  },
  {
    url: 'https://example.com/products/detail-123',
    title: '', // 빈 pageTitle 케이스
    depth1: '제품',
    depth2: '상세',
    depth3: 'detail-123',
    depth4: '',
  },
];

// ─────────────────────────────────────────────────────────────────────
// 핵심 풍부 픽스처 — `baseAuditResult`
// ─────────────────────────────────────────────────────────────────────
//
// 위반 다양성:
//  - 매핑된 axe ruleId: image-alt(1.1.1), color-contrast(1.4.1), html-has-lang(3.1.1)
//  - 매핑되지 않은 ruleId: unknown-rule-xyz → kwcagId='기타'
//  - impact: critical / serious / moderate / minor 각 1+ + null
//
// 한글 + 이모지(surrogate pair) 가 description/affectedCode 에 포함되어
// 청킹 경계에서 깨지지 않는지 검증할 수 있다.

const baseViolations: Violation[] = [
  buildEnrichFriendlyViolation({
    kwcagId: '1.1.1',
    axeRuleId: 'image-alt',
    impact: 'critical',
    pageUrl: 'https://example.com/',
    pageTitle: '홈',
    affectedCode: '<img src="/banner.png">',
    selector: 'img.banner',
    occurrenceCount: 3,
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/image-alt',
    screenshotPath: '/screenshots/page-1-violation-1.png',
    boundingBox: { x: 10, y: 20, width: 300, height: 150 },
    violationNumber: 1,
  }),
  buildEnrichFriendlyViolation({
    kwcagId: '1.4.1',
    axeRuleId: 'color-contrast',
    impact: 'serious',
    pageUrl: 'https://example.com/',
    pageTitle: '홈',
    affectedCode: '<button class="cta">시작하기 🚀</button>',
    selector: 'button.cta',
    occurrenceCount: 1,
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/color-contrast',
    violationNumber: 2,
  }),
  buildEnrichFriendlyViolation({
    kwcagId: '3.1.1',
    axeRuleId: 'html-has-lang',
    impact: 'moderate',
    pageUrl: 'https://example.com/products',
    pageTitle: '제품 목록',
    affectedCode: '<html>',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/html-has-lang',
    violationNumber: 3,
  }),
  buildEnrichFriendlyViolation({
    kwcagId: '1.3.1',
    axeRuleId: 'heading-order',
    impact: 'minor',
    pageUrl: 'https://example.com/products',
    pageTitle: '제품 목록',
    affectedCode: '<h3>섹션 제목 — 한글/이모지 ✨ 테스트</h3>',
    selector: 'main > h3:nth-child(2)',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.10/heading-order',
    violationNumber: 4,
  }),
  // 매핑되지 않은 axe rule — kwcagId = '기타'
  // 여기서는 enrichViolation 후 backfill 를 견디도록, '기타' 라벨에 맞는
  // KWCAGItem 이 없으므로 description/help/kwcagName/principle 을 빈 문자열로 둔다.
  // (round-trip 시 enrichViolation 도 동일한 빈 값으로 backfill 한다.)
  {
    pageUrl: 'https://example.com/products/detail-123',
    pageTitle: '', // 의도적 빈 pageTitle
    depth1: '',
    depth2: '',
    depth3: '',
    depth4: '',
    platform: 'PC',
    inspector: '시스템',
    inspectionDate: '',
    violationNumber: 5,
    kwcagId: '기타',
    kwcagName: '',
    principle: '',
    axeRuleId: 'unknown-rule-xyz',
    description: '',
    // null impact — Violation.impact 는 string 타입이지만 NotionService 가 'minor' 로 폴백한다.
    // round-trip 견고성을 위해 'minor' 로 두되, 별도 nullImpactCase 픽스처에서 null 케이스를 검증한다.
    impact: 'minor',
    affectedCode: '<div data-foo>알 수 없는 위반 사례 ⚠️</div>',
    help: '',
    helpUrl: '',
    selector: 'div[data-foo]',
  },
];

const baseSpaSummary: AuditSpaSummary = {
  detectedFramework: 'next',
  renderStrategy: 'SSR',
  suspectedSpa: true,
  routesFromCrawl: 12,
  routesFromSitemap: 3,
};

const baseReliability: AuditReliabilitySummary = {
  pagesAudited: 3,
  pagesFailed: 0,
  pagesPartial: 1,
  avgDomNodes: 248,
  avgHydrationMs: 1420,
};

export const baseAuditResult: AuditResult = {
  startTime: '2026-05-06T01:00:00.000Z',
  endTime: '2026-05-06T01:03:42.000Z',
  totalPages: samplePages.length,
  totalViolations: baseViolations.length,
  pages: samplePages,
  violations: baseViolations,
  artifactName: 'screenshots-9876543',
  screenshotUrl: 'https://example.github.io/screenshots/9876543/',
  warnings: [
    'SPA로 의심되는 사이트에서 일부 페이지의 진단 신뢰도가 낮습니다.',
    '점검자 정보가 비어있는 위반이 1건 있습니다.',
  ],
  summary: {
    byPrinciple: {
      '인식의 용이성': 2,
      '운용의 용이성': 0,
      '이해의 용이성': 1,
      '견고성': 0,
      '기타': 1,
      '인식의 용이성/콘텐츠의 선형화': 0, // 의도적 무관 키 (실제 코드는 byPrinciple[v.principle] 만 채움)
    },
    byImpact: {
      critical: 1,
      serious: 1,
      moderate: 1,
      minor: 2,
    },
    byKwcagItem: {
      '1.1.1': 1,
      '1.3.1': 1,
      '1.4.1': 1,
      '3.1.1': 1,
      '기타': 1,
    },
    reliability: baseReliability,
    spa: baseSpaSummary,
  },
};

// ─────────────────────────────────────────────────────────────────────
// `roundTripFriendlyResult` — Notion compact+enrich 사이클을 견디는 픽스처
// ─────────────────────────────────────────────────────────────────────
//
// NotionService.saveAuditResult 의 `compactViolations` 는 다음 필드만 보존한다:
//   { kwcagId, kwcagName, impact, principle, pageUrl, pageTitle, selector,
//     occurrenceCount, axeRuleId, affectedCode(300자 절단), screenshotPath, boundingBox }
//
// 그리고 getAuditResult → enrichViolation 가 다음을 backfill 한다:
//   - description / help / kwcagName / principle ← KWCAG_MAPPING 에서
//   - depth1~4='' / platform='PC' / inspector='시스템' / inspectionDate=''
//   - violationNumber=0 / pageTitle=v.pageTitle||'' / affectedCode=v.affectedCode||''
//   - axeRuleId=v.axeRuleId||'' / helpUrl=''  ← compact 가 helpUrl 을 떨어뜨려 항상 '' 로 backfill
//
// 따라서 round-trip 친화 픽스처는 helpUrl='' / violationNumber=0 으로 둔다.
// (위 두 필드가 보존되어야 하는 contract 가 아니라, '실제로 보존되지 않는다는 contract' 를 명시한다.)

const roundTripFriendlyViolations: Violation[] = baseViolations.map((v) => ({
  ...v,
  helpUrl: '', // compact 단계에서 누락되므로 round-trip 후 ''
  violationNumber: 0, // compact 단계에서 누락되므로 round-trip 후 0
}));

export const roundTripFriendlyResult: AuditResult = {
  startTime: baseAuditResult.startTime,
  endTime: baseAuditResult.endTime,
  totalPages: baseAuditResult.totalPages,
  totalViolations: baseAuditResult.totalViolations,
  pages: baseAuditResult.pages,
  violations: roundTripFriendlyViolations,
  // seoResult / warnings / artifactName / screenshotUrl 는 compact 단계에서
  // 사라지거나 축약되므로 round-trip 픽스처에서는 의도적으로 생략한다.
  summary: baseAuditResult.summary,
};

// ─────────────────────────────────────────────────────────────────────
// `largeAuditResult` — 100블록 청킹 경계 강제
// ─────────────────────────────────────────────────────────────────────
//
// NotionService.saveAuditResult 는 violations 를 impact 별로 그룹핑 후
// 각 (impact, kwcagId+kwcagName) 조합마다 toggle block 을 1개 생성한다.
// → unique 조합을 충분히 만들어야 100블록을 넘긴다.
// → kwcagName 에 인덱스를 다양화시켜 각 violation 이 unique key 가 되도록 함.

const largeViolations: Violation[] = Array.from({ length: 240 }, (_, i) => {
  const impacts: Violation['impact'][] = ['critical', 'serious', 'moderate', 'minor'];
  const impact = impacts[i % impacts.length];
  return buildEnrichFriendlyViolation({
    kwcagId: '1.1.1',
    axeRuleId: 'image-alt',
    impact,
    pageUrl: `https://example.com/page-${i % 10}`,
    pageTitle: `페이지 ${i % 10}`,
    affectedCode: `<img src="/img-${i}.png">`,
    selector: `img.item-${i}`,
    occurrenceCount: 1,
    violationNumber: i + 1,
  });
}).map((v, i) => ({
  // unique grouping key 생성: kwcagName 에 인덱스 추가
  ...v,
  kwcagName: `${v.kwcagName} #${i}`,
}));

export const largeAuditResult: AuditResult = {
  startTime: '2026-05-06T02:00:00.000Z',
  endTime: '2026-05-06T02:30:00.000Z',
  totalPages: 10,
  totalViolations: largeViolations.length,
  pages: Array.from({ length: 10 }, (_, i) => ({
    url: `https://example.com/page-${i}`,
    title: `페이지 ${i}`,
    depth1: '루트',
    depth2: `섹션-${i}`,
    depth3: '',
    depth4: '',
  })),
  violations: largeViolations,
  summary: {
    byPrinciple: { '인식의 용이성': largeViolations.length },
    byImpact: {
      critical: largeViolations.filter((v) => v.impact === 'critical').length,
      serious: largeViolations.filter((v) => v.impact === 'serious').length,
      moderate: largeViolations.filter((v) => v.impact === 'moderate').length,
      minor: largeViolations.filter((v) => v.impact === 'minor').length,
    },
    byKwcagItem: { '1.1.1': largeViolations.length },
  },
};

// ─────────────────────────────────────────────────────────────────────
// `hugeJsonAuditResult` — 2000자 rich_text 청크 100개 한계 강제
// ─────────────────────────────────────────────────────────────────────
//
// 단일 violation 의 affectedCode 자리에 거대 문자열을 넣되, NotionService 의
// `compactResult.affectedCode` 는 substring(0, 300) 로 잘리므로 affectedCode 만으로는
// 한계를 넘길 수 없다. 따라서 summary 에 거대 문자열을 박아 넣는다.
//
// 문자열은 한글/이모지를 끼워 넣어 surrogate pair 가 청크 경계에 걸리는 케이스를 강제한다.

function buildHugeKoreanString(targetLength: number): string {
  // 1 단위 = "한국어 텍스트 ✨" (이모지 ✨는 surrogate pair)
  const unit = '한국어 텍스트 ✨ '; // 길이 약 10
  const repeats = Math.ceil(targetLength / unit.length);
  return unit.repeat(repeats).slice(0, targetLength);
}

// 200,000 자 = 약 100개의 2000자 chunk → 단일 code block 의 100개 rich_text 한계 직격
const HUGE_LENGTH = 215_000;
const hugeKoreanPayload = buildHugeKoreanString(HUGE_LENGTH);

export const hugeJsonAuditResult: AuditResult = {
  startTime: '2026-05-06T03:00:00.000Z',
  endTime: '2026-05-06T03:01:00.000Z',
  totalPages: 1,
  totalViolations: 1,
  pages: [
    {
      url: 'https://example.com/huge',
      title: '거대 페이지',
      depth1: '루트',
      depth2: '',
      depth3: '',
      depth4: '',
    },
  ],
  violations: [
    buildEnrichFriendlyViolation({
      kwcagId: '1.1.1',
      axeRuleId: 'image-alt',
      impact: 'serious',
      pageUrl: 'https://example.com/huge',
      pageTitle: '거대 페이지',
      affectedCode: '<img>', // affectedCode 는 compact 시 300자 절단되므로 의미 없음
      violationNumber: 1,
    }),
  ],
  summary: {
    byPrinciple: { '인식의 용이성': 1 },
    byImpact: { critical: 0, serious: 1, moderate: 0, minor: 0 },
    byKwcagItem: { '1.1.1': 1 },
    // hugeKoreanPayload 를 summary 에 임의 키로 끼워 넣음 — JSON.stringify 결과에 그대로 직렬화됨
    // (Record<string, number> 타입 위반이지만 fixture 는 의도된 stress test 이므로 cast)
    ...({ __huge_payload__: hugeKoreanPayload } as unknown as Record<string, number>),
  },
};

// 외부 export — 한글 길이 검증용
export const HUGE_PAYLOAD_LENGTH = HUGE_LENGTH;
export const HUGE_PAYLOAD_SAMPLE = hugeKoreanPayload;

// ─────────────────────────────────────────────────────────────────────
// `fixtureWithoutOptionalFields` — optional 필드 누락 변형
// ─────────────────────────────────────────────────────────────────────

export const fixtureWithoutOptionalFields: AuditResult = {
  startTime: baseAuditResult.startTime,
  endTime: baseAuditResult.endTime,
  totalPages: 1,
  totalViolations: 1,
  pages: [samplePages[0]],
  violations: [
    // round-trip 친화: helpUrl='' / violationNumber=0 (compact 가 떨어뜨림)
    buildEnrichFriendlyViolation({
      kwcagId: '1.4.1',
      axeRuleId: 'color-contrast',
      impact: 'serious',
      pageUrl: 'https://example.com/',
      pageTitle: '홈',
      affectedCode: '<a href="#">링크</a>',
      violationNumber: 0,
      helpUrl: '',
    }),
  ],
  summary: {
    byPrinciple: { '인식의 용이성': 1 },
    byImpact: { critical: 0, serious: 1, moderate: 0, minor: 0 },
    byKwcagItem: { '1.4.1': 1 },
    // reliability/spa 의도적 누락
  },
  // artifactName / screenshotUrl / warnings / seoResult 의도적 누락
};

// 픽스처 빌더 헬퍼 export — 다른 테스트가 재사용 가능하도록
export { buildEnrichFriendlyViolation, samplePages, baseSpaSummary, baseReliability };
