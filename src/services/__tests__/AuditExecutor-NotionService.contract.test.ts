/**
 * AuditExecutor ↔ NotionService ↔ excel-generator 통합 contract 테스트.
 *
 * 목적: AuditResult 픽스처 1개로 3자(Executor 출력 / Notion 입력 / Excel 입력) 동시 통과를 강제.
 *      Phase 3 의 God-module 분해(AuditExecutor / NotionService) 회귀 안전망 역할.
 *
 * 시나리오:
 *  A. 라운드트립 — Notion save → get → enrich 후 입력과 동등성 (compact 견디는 픽스처 사용)
 *  B. 청킹 경계 (>100 blocks) — pages.create children ≤ 100, 잔여는 blocks.children.append 분할
 *  C. 2000자 청킹 + surrogate pair — 단일 code block 의 rich_text 가 2000자 단위로 분할,
 *                                    100개 한계 초과 시 추가 code block, 한글/이모지 surrogate pair 보존
 *  D. excel-generator 입력 호환 — 동일 픽스처로 ExcelGenerator.generateAuditReport 통과
 *  E. 옵션 필드 직렬화/역직렬화 — summary.spa/reliability, optional 필드 누락 변형 모두 동작
 */

import type { AuditResult } from '@/types';
import { Client } from '@notionhq/client';
import { NotionService } from '@/services/notion/NotionService';
import ExcelGenerator from '@/lib/excel-generator';
import {
  baseAuditResult,
  roundTripFriendlyResult,
  largeAuditResult,
  hugeJsonAuditResult,
  fixtureWithoutOptionalFields,
  HUGE_PAYLOAD_SAMPLE,
} from '@/lib/__tests__/fixtures/audit-result.fixture';

jest.mock('@notionhq/client');

// ─────────────────────────────────────────────────────────────────────
// Notion mock 헬퍼
// ─────────────────────────────────────────────────────────────────────

interface MockNotionClient {
  pages: {
    create: jest.Mock;
    update: jest.Mock;
  };
  blocks: {
    children: {
      list: jest.Mock;
      append: jest.Mock;
    };
  };
  databases: {
    query: jest.Mock;
  };
}

function createMockNotionClient(): MockNotionClient {
  return {
    pages: {
      create: jest.fn().mockResolvedValue({ id: 'page-id' }),
      update: jest.fn().mockResolvedValue({}),
    },
    blocks: {
      children: {
        list: jest.fn(),
        append: jest.fn().mockResolvedValue({}),
      },
    },
    databases: {
      query: jest.fn(),
    },
  };
}

/**
 * pages.create + blocks.children.append 으로 전송된 모든 children block 을 합쳐 반환.
 */
interface MinimalBlock {
  type?: string;
  code?: {
    language?: string;
    rich_text: Array<{ text?: { content?: string }; plain_text?: string }>;
  };
}

function collectSentBlocks(client: MockNotionClient): MinimalBlock[] {
  const blocks: MinimalBlock[] = [];
  for (const call of client.pages.create.mock.calls) {
    const arg = call[0] as { children?: MinimalBlock[] };
    if (arg?.children) blocks.push(...arg.children);
  }
  for (const call of client.blocks.children.append.mock.calls) {
    const arg = call[0] as { children?: MinimalBlock[] };
    if (arg?.children) blocks.push(...arg.children);
  }
  return blocks;
}

/**
 * 전송된 children 중 JSON code block 들의 rich_text 를 모두 합쳐 1개 문자열로 반환.
 * NotionService.getAuditResult 가 같은 일을 하므로, 라운드트립 시뮬레이션의 reverse path.
 */
function reassembleJsonFromBlocks(blocks: MinimalBlock[]): string {
  let acc = '';
  for (const block of blocks) {
    if (block.type === 'code' && block.code?.language === 'json') {
      for (const rt of block.code.rich_text) {
        // saveAuditResult 는 text.content 로 push 하지만, getAuditResult 는 plain_text 로 읽는다.
        // 양쪽 모두 시도해서 잡는다.
        acc += rt.text?.content ?? rt.plain_text ?? '';
      }
    }
  }
  return acc;
}

/**
 * blocks.children.list mock 에 전송된 children 을 그대로 반환하도록 wiring.
 * getAuditResult round-trip 검증에 사용.
 */
function wireGetForRoundTrip(client: MockNotionClient): void {
  const sentBlocks = collectSentBlocks(client);
  // getAuditResult 는 plain_text 를 읽으므로 변환
  const blocksWithPlainText = sentBlocks.map((b) => {
    if (b.type === 'code' && b.code) {
      return {
        type: b.type,
        code: {
          language: b.code.language,
          rich_text: b.code.rich_text.map((rt) => ({
            plain_text: rt.text?.content ?? rt.plain_text ?? '',
          })),
        },
      };
    }
    return b;
  });
  client.blocks.children.list.mockResolvedValue({
    results: blocksWithPlainText,
    has_more: false,
  });
}

// ─────────────────────────────────────────────────────────────────────
// 테스트
// ─────────────────────────────────────────────────────────────────────

describe('AuditResult fixture — Type compatibility (compile-time)', () => {
  // 컴파일이 통과하면 픽스처가 AuditResult 타입을 만족한다는 뜻.
  // 런타임에서는 형식 검증이 어려워 핵심 필드 존재만 sanity check.
  it('baseAuditResult satisfies AuditResult shape', () => {
    const r: AuditResult = baseAuditResult;
    expect(r.totalPages).toBe(r.pages.length);
    expect(r.totalViolations).toBe(r.violations.length);
    expect(r.summary.byImpact).toBeDefined();
  });

  it('roundTripFriendlyResult / largeAuditResult / hugeJsonAuditResult / fixtureWithoutOptionalFields satisfy AuditResult', () => {
    const all: AuditResult[] = [
      roundTripFriendlyResult,
      largeAuditResult,
      hugeJsonAuditResult,
      fixtureWithoutOptionalFields,
    ];
    for (const r of all) {
      expect(r.pages).toBeInstanceOf(Array);
      expect(r.violations).toBeInstanceOf(Array);
      expect(r.summary).toBeDefined();
    }
  });
});

describe('Scenario A — NotionService round-trip (save → get → enrich)', () => {
  let mockClient: MockNotionClient;
  let notion: NotionService;

  beforeEach(() => {
    mockClient = createMockNotionClient();
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
    notion = new NotionService('fake-key', 'fake-db');
  });

  it('roundTripFriendlyResult — save 후 get 결과가 입력과 동등 (compact + enrich 사이클 견딤)', async () => {
    await notion.saveAuditResult(roundTripFriendlyResult);
    wireGetForRoundTrip(mockClient);

    const restored = await notion.getAuditResult('page-id');
    expect(restored).not.toBeNull();
    expect(restored).toEqual(roundTripFriendlyResult);
  });

  it('baseAuditResult — compact 단계에서 사라지는 필드(warnings/artifactName/screenshotUrl/seoResult) 외에는 보존', async () => {
    await notion.saveAuditResult(baseAuditResult);
    wireGetForRoundTrip(mockClient);

    const restored = await notion.getAuditResult('page-id');
    expect(restored).not.toBeNull();
    if (!restored) return;

    // compact 가 보존하는 top-level 필드
    expect(restored.startTime).toBe(baseAuditResult.startTime);
    expect(restored.endTime).toBe(baseAuditResult.endTime);
    expect(restored.totalPages).toBe(baseAuditResult.totalPages);
    expect(restored.totalViolations).toBe(baseAuditResult.totalViolations);
    expect(restored.pages).toEqual(baseAuditResult.pages);
    expect(restored.summary).toEqual(baseAuditResult.summary);

    // compact 가 의도적으로 떨어뜨리는 필드는 복원되지 않음
    expect(restored.warnings).toBeUndefined();
    expect(restored.artifactName).toBeUndefined();
    expect(restored.screenshotUrl).toBeUndefined();

    // violations 의 핵심 필드는 enrichViolation 으로 복원
    for (let i = 0; i < restored.violations.length; i++) {
      const orig = baseAuditResult.violations[i];
      const got = restored.violations[i];
      expect(got.kwcagId).toBe(orig.kwcagId);
      expect(got.axeRuleId).toBe(orig.axeRuleId);
      expect(got.pageUrl).toBe(orig.pageUrl);
      expect(got.impact).toBe(orig.impact);
      // boundingBox / selector / occurrenceCount / screenshotPath 보존
      expect(got.boundingBox).toEqual(orig.boundingBox);
      expect(got.selector).toBe(orig.selector);
      expect(got.occurrenceCount).toBe(orig.occurrenceCount);
      expect(got.screenshotPath).toBe(orig.screenshotPath);
    }
  });
});

describe('Scenario B — Chunking boundary (>100 blocks)', () => {
  let mockClient: MockNotionClient;
  let notion: NotionService;

  beforeEach(() => {
    mockClient = createMockNotionClient();
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
    notion = new NotionService('fake-key', 'fake-db');
  });

  it('largeAuditResult: pages.create 의 children 은 ≤ 100, 나머지는 blocks.children.append 로 분할', async () => {
    await notion.saveAuditResult(largeAuditResult);

    expect(mockClient.pages.create).toHaveBeenCalledTimes(1);
    const createArgs = mockClient.pages.create.mock.calls[0][0] as {
      children: unknown[];
    };
    // saveAuditResult 는 firstBatchSize=50 으로 자른 후 첫 호출에 보냄 (100 이하 보장)
    expect(createArgs.children.length).toBeLessThanOrEqual(100);

    // 200+ violations 로 인해 totalblock 은 100 초과 → append 1회 이상 호출
    expect(mockClient.blocks.children.append).toHaveBeenCalled();

    // 모든 append 호출의 children 길이도 ≤ 100
    for (const call of mockClient.blocks.children.append.mock.calls) {
      const args = call[0] as { children: unknown[]; block_id: string };
      expect(args.children.length).toBeLessThanOrEqual(100);
      expect(args.block_id).toBe('page-id');
    }
  });

  it('largeAuditResult: 전송된 모든 children 합이 violation 수보다 많거나 같음 (toggle + summary blocks)', async () => {
    await notion.saveAuditResult(largeAuditResult);

    const all = collectSentBlocks(mockClient);
    // 위반 수 ≤ 전송 블록 수 (impact heading 4개 + summary 5개 + toggle N개 + JSON code N개)
    expect(all.length).toBeGreaterThan(largeAuditResult.violations.length);

    // toggle 블록 수가 unique grouping key 수와 일치 — largeAuditResult 는 모든 violation 이 unique
    const toggleBlocks = all.filter((b) => b.type === 'toggle');
    expect(toggleBlocks.length).toBe(largeAuditResult.violations.length);
  });
});

describe('Scenario C — 2000-char chunking + surrogate pair', () => {
  let mockClient: MockNotionClient;
  let notion: NotionService;

  beforeEach(() => {
    mockClient = createMockNotionClient();
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
    notion = new NotionService('fake-key', 'fake-db');
  });

  it('hugeJsonAuditResult: 단일 code block 의 rich_text 가 2000자 이내로 분할', async () => {
    await notion.saveAuditResult(hugeJsonAuditResult);
    const all = collectSentBlocks(mockClient);
    const codeBlocks = all.filter((b) => b.type === 'code');
    expect(codeBlocks.length).toBeGreaterThanOrEqual(1);

    for (const block of codeBlocks) {
      if (!block.code) continue;
      for (const rt of block.code.rich_text) {
        const content = rt.text?.content ?? rt.plain_text ?? '';
        // ≤ 2000 (createRichTextChunks 의 maxLength)
        expect(content.length).toBeLessThanOrEqual(2000);
      }
      // 단일 code block 의 rich_text 항목 수 ≤ 100 (NotionService 의 richTextLimit)
      expect(block.code.rich_text.length).toBeLessThanOrEqual(100);
    }
  });

  it('hugeJsonAuditResult: rich_text 100개 한계 초과 시 추가 code block 으로 분할 (≥ 2개)', async () => {
    await notion.saveAuditResult(hugeJsonAuditResult);
    const all = collectSentBlocks(mockClient);
    const codeBlocks = all.filter((b) => b.type === 'code' && b.code?.language === 'json');

    // hugeJsonAuditResult 는 215KB payload → 약 108 chunks → 최소 2개 code block
    expect(codeBlocks.length).toBeGreaterThanOrEqual(2);
  });

  it('hugeJsonAuditResult: 한글+이모지 surrogate pair 가 청크 경계에서 깨지지 않음 (재조립 후 동일)', async () => {
    await notion.saveAuditResult(hugeJsonAuditResult);
    const all = collectSentBlocks(mockClient);

    // 모든 JSON code block 의 rich_text 를 합쳐 재조립
    const reassembled = reassembleJsonFromBlocks(all);

    // 재조립된 JSON 이 valid 한 JSON 이어야 함 (surrogate pair 깨졌다면 stringify→parse 라운드트립 실패)
    expect(() => JSON.parse(reassembled)).not.toThrow();

    const parsed = JSON.parse(reassembled) as Record<string, unknown> & {
      summary?: Record<string, unknown>;
    };
    // hugeJsonAuditResult 가 summary 에 박은 __huge_payload__ 가 손실 없이 보존
    expect(parsed.summary?.__huge_payload__).toBe(HUGE_PAYLOAD_SAMPLE);
  });

  it('hugeJsonAuditResult: 라운드트립 — getAuditResult 가 동일 payload 복원', async () => {
    await notion.saveAuditResult(hugeJsonAuditResult);
    wireGetForRoundTrip(mockClient);

    const restored = await notion.getAuditResult('page-id');
    expect(restored).not.toBeNull();
    if (!restored) return;

    // summary 안의 __huge_payload__ 가 enrichViolation 을 거쳐도 손실 없음
    const summary = restored.summary as unknown as Record<string, unknown>;
    expect(summary.__huge_payload__).toBe(HUGE_PAYLOAD_SAMPLE);
  });
});

describe('Scenario D — excel-generator 입력 호환', () => {
  it('baseAuditResult: ExcelGenerator.generateAuditReport 가 에러 없이 Buffer 반환', async () => {
    const excel = new ExcelGenerator({
      includeViolations: true,
      platform: 'PC',
      inspector: '시스템',
    });
    const buf = await excel.generateAuditReport(baseAuditResult);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('largeAuditResult: 240 violations 도 에러 없이 Buffer 반환', async () => {
    const excel = new ExcelGenerator({
      includeViolations: true,
      platform: 'PC',
      inspector: '시스템',
    });
    const buf = await excel.generateAuditReport(largeAuditResult);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('fixtureWithoutOptionalFields: optional 필드 누락 변형도 에러 없이 처리 (seoResult 누락 시 SEO sheet 생략)', async () => {
    const excel = new ExcelGenerator({
      includeViolations: true,
      platform: 'PC',
      inspector: '시스템',
    });
    const buf = await excel.generateAuditReport(fixtureWithoutOptionalFields);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(0);
  });

  it('baseAuditResult: violations 시트 행수가 violation 수와 일치 (헤더 1행 + N개)', async () => {
    // ExcelJS Workbook 직접 생성하여 sheet 검증
    const excel = new ExcelGenerator({
      includeViolations: true,
      platform: 'PC',
      inspector: '시스템',
    });
    const buf = await excel.generateAuditReport(baseAuditResult);

    // ExcelJS 로 다시 읽어서 검증
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    // exceljs 의 xlsx.load 타입선언은 unparameterized `Buffer` 를 요구하지만
    // 최신 @types/node 의 Buffer<ArrayBufferLike> 와 호환되지 않아 unknown 경유 캐스팅.
    // (런타임은 동일 객체 — 기존 excel-generator.test.ts 도 동일한 우회를 사용한다.)
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);

    const auditSheet = wb.getWorksheet('접근성 진단 결과');
    expect(auditSheet).toBeDefined();
    if (!auditSheet) return;

    // 헤더 1행 + violations.length 개
    expect(auditSheet.rowCount).toBe(1 + baseAuditResult.violations.length);

    // IA 시트, 요약 시트 존재 확인
    expect(wb.getWorksheet('IA 구조')).toBeDefined();
    expect(wb.getWorksheet('요약')).toBeDefined();
  });
});

describe('Scenario E — Optional fields serialization', () => {
  let mockClient: MockNotionClient;
  let notion: NotionService;

  beforeEach(() => {
    mockClient = createMockNotionClient();
    (Client as unknown as jest.Mock).mockImplementation(() => mockClient);
    notion = new NotionService('fake-key', 'fake-db');
  });

  it('summary.spa / summary.reliability — round-trip 시 보존 (compact result 가 summary 전체 직렬화)', async () => {
    await notion.saveAuditResult(baseAuditResult);
    wireGetForRoundTrip(mockClient);

    const restored = await notion.getAuditResult('page-id');
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored.summary.spa).toEqual(baseAuditResult.summary.spa);
    expect(restored.summary.reliability).toEqual(baseAuditResult.summary.reliability);
  });

  it('artifactName / screenshotUrl — Notion DB property 로 별도 저장됨 (children JSON 에는 없음)', async () => {
    await notion.saveAuditResult(baseAuditResult, 'https://report.example.com/x');

    expect(mockClient.pages.create).toHaveBeenCalledTimes(1);
    const args = mockClient.pages.create.mock.calls[0][0] as {
      properties: Record<string, unknown>;
    };

    // Notion DB property 로 저장
    expect(args.properties['Artifact Name']).toBeDefined();
    expect(args.properties['Screenshot URL']).toEqual({
      url: baseAuditResult.screenshotUrl,
    });
  });

  it('fixtureWithoutOptionalFields: 옵션 필드 누락해도 saveAuditResult 가 에러 없이 동작', async () => {
    await expect(
      notion.saveAuditResult(fixtureWithoutOptionalFields),
    ).resolves.toBeDefined();

    // Artifact Name / Screenshot URL property 는 누락
    const args = mockClient.pages.create.mock.calls[0][0] as {
      properties: Record<string, unknown>;
    };
    expect(args.properties['Artifact Name']).toBeUndefined();
    expect(args.properties['Screenshot URL']).toBeUndefined();
  });

  it('fixtureWithoutOptionalFields: round-trip 후에도 누락 필드는 누락 상태 유지 (toEqual)', async () => {
    await notion.saveAuditResult(fixtureWithoutOptionalFields);
    wireGetForRoundTrip(mockClient);

    const restored = await notion.getAuditResult('page-id');
    expect(restored).not.toBeNull();
    if (!restored) return;

    expect(restored).toEqual(fixtureWithoutOptionalFields);
  });
});
