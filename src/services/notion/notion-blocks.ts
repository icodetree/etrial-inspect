/**
 * Notion 블록 빌더 / 청킹 공통 모듈.
 *
 * 핵심 한계:
 *  - rich_text 항목 1개의 content 길이 ≤ 2000자 (surrogate pair 보존 필요)
 *  - 단일 블록의 rich_text 배열 길이 ≤ 100
 *  - blocks.children.append / pages.create 의 children 배열 길이 ≤ 100
 *
 * NotionService (audit / alt-text 양쪽) 가 동일 청킹 동작을 공유하기 위해 분리되었다.
 * 동작은 기존 NotionService 의 private 헬퍼와 bit-exact 으로 일치해야 한다 — 변경 시
 * `src/services/__tests__/AuditExecutor-NotionService.contract.test.ts` 와
 * `src/services/notion/__tests__/notion-blocks.test.ts` 가 회귀 게이트.
 */

// Notion API SDK 의 children 인자는 사실상 거대한 discriminated union 인데,
// 우리의 빌더는 부분 객체만 만들어 넘긴다. 안전하게 좁히기 어렵고 SDK 버전마다 변동되므로
// `any[]` 와 동등한 의미의 unknown record 로 표기한다 — 호출 측에서 SDK 가 검증한다.
export type NotionBlock = Record<string, unknown>;
export type NotionRichText = { text: { content: string } };

/** Notion rich_text 한 항목의 content 최대 길이 */
export const RICH_TEXT_MAX_LENGTH = 2000;
/** 단일 블록 안의 rich_text 배열 최대 길이 */
export const RICH_TEXT_PER_BLOCK_LIMIT = 100;
/** blocks.children.append / pages.create children 최대 길이 */
export const BLOCKS_PER_CALL_LIMIT = 100;

/**
 * 긴 문자열을 Notion rich_text 항목 배열로 분할.
 *
 * - 각 항목 content ≤ {@link RICH_TEXT_MAX_LENGTH}
 * - UTF-16 high surrogate (0xD800~0xDBFF) 가 청크 경계의 마지막 코드 유닛인 경우
 *   1자리 앞당겨 잘라 surrogate pair 를 보존한다 (한글 보조자/이모지 깨짐 방지).
 *
 * 동작은 기존 NotionService.createRichTextChunks 와 동일.
 */
export function chunkRichText(
  content: string,
  maxLength: number = RICH_TEXT_MAX_LENGTH,
): NotionRichText[] {
  const output: NotionRichText[] = [];
  let i = 0;
  while (i < content.length) {
    let end = i + maxLength;
    if (end < content.length) {
      const lastCharCode = content.charCodeAt(end - 1);
      // High surrogate 이면 한 자리 앞당겨 다음 청크에 pair 와 함께 넘긴다.
      if (lastCharCode >= 0xd800 && lastCharCode <= 0xdbff) {
        end -= 1;
      }
    }
    output.push({ text: { content: content.substring(i, end) } });
    i = end;
  }
  return output;
}

/**
 * rich_text 항목 배열을 100개 단위로 잘라 여러 개의 JSON code block 으로 만든다.
 * 첫 블록 외의 블록에는 `(Part N)` caption 을 붙여 가독성 확보.
 *
 * 동작은 기존 NotionService.saveAuditResult / saveAltTextAuditResult 의 인라인 로직과 동일.
 */
export function buildJsonCodeBlocks(
  richTextChunks: NotionRichText[],
  richTextLimit: number = RICH_TEXT_PER_BLOCK_LIMIT,
): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  for (let i = 0; i < richTextChunks.length; i += richTextLimit) {
    const chunkBatch = richTextChunks.slice(i, i + richTextLimit);
    blocks.push({
      object: 'block',
      type: 'code',
      code: {
        language: 'json',
        rich_text: chunkBatch,
        caption:
          i > 0
            ? [{ text: { content: `(Part ${Math.floor(i / richTextLimit) + 1})` } }]
            : [],
      },
    });
  }
  return blocks;
}

/**
 * blocks 배열을 Notion API 호출 단위(≤100/call) 로 분할한다.
 * pages.create / blocks.children.append 호출 직전에 사용.
 */
export function chunkBlocksForApi(
  blocks: NotionBlock[],
  maxBlocksPerCall: number = BLOCKS_PER_CALL_LIMIT,
): NotionBlock[][] {
  const out: NotionBlock[][] = [];
  for (let i = 0; i < blocks.length; i += maxBlocksPerCall) {
    out.push(blocks.slice(i, i + maxBlocksPerCall));
  }
  return out;
}

/**
 * Notion 페이지의 children list 응답에서 `language: 'json'` 인 code block 의
 * rich_text plain_text 를 모두 이어 붙여 단일 문자열로 재조립한다.
 *
 * saveAuditResult / saveAltTextAuditResult 의 역방향. 페이지네이션은 호출 측이 처리한다.
 */
export interface NotionListBlock {
  type?: string;
  code?: {
    language?: string;
    rich_text?: Array<{ plain_text?: string }>;
  };
}

export function assembleJsonFromCodeBlocks(blocks: NotionListBlock[]): string {
  let acc = '';
  for (const block of blocks) {
    if (
      block.type === 'code' &&
      block.code?.language === 'json' &&
      Array.isArray(block.code.rich_text)
    ) {
      for (const rt of block.code.rich_text) {
        acc += rt.plain_text ?? '';
      }
    }
  }
  return acc;
}

// ───────────────────────────────────────────────────────────────────────
// 자주 쓰이는 블록 빌더 — 본문 헤더/리스트/토글 등의 boilerplate 축소
// (현재 NotionService 의 인라인 객체 리터럴과 동일한 shape)
// ───────────────────────────────────────────────────────────────────────

export function buildHeading2(content: string): NotionBlock {
  return {
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ text: { content } }] },
  };
}

export function buildHeading3(content: string): NotionBlock {
  return {
    object: 'block',
    type: 'heading_3',
    heading_3: { rich_text: [{ text: { content } }] },
  };
}

export function buildParagraph(content: string): NotionBlock {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: { rich_text: [{ text: { content } }] },
  };
}

export function buildBullet(content: string): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: { rich_text: [{ text: { content } }] },
  };
}

export function buildBulletLink(url: string): NotionBlock {
  return {
    object: 'block',
    type: 'bulleted_list_item',
    bulleted_list_item: {
      rich_text: [{ text: { content: url, link: { url } } }],
    },
  };
}

export function buildToggle(
  title: string,
  children: NotionBlock[],
): NotionBlock {
  return {
    object: 'block',
    type: 'toggle',
    toggle: {
      rich_text: [{ text: { content: title } }],
      children,
    },
  };
}
