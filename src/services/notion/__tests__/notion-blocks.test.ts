/**
 * notion-blocks.ts 청킹/빌더 단위 테스트.
 *
 * 핵심 보장:
 *  - 2000자 경계: chunkRichText 가 maxLength 를 넘지 않음
 *  - surrogate pair 보존: high surrogate 가 청크 끝에 오면 다음 청크로 넘김
 *  - 100 rich_text/block: buildJsonCodeBlocks 가 100 단위로 추가 code block 생성, caption Part 표기
 *  - 100 block/call: chunkBlocksForApi
 *  - assembleJsonFromCodeBlocks: 다중 code block 의 plain_text 연결, 비-JSON code block 무시
 */

import {
  RICH_TEXT_MAX_LENGTH,
  RICH_TEXT_PER_BLOCK_LIMIT,
  BLOCKS_PER_CALL_LIMIT,
  chunkRichText,
  buildJsonCodeBlocks,
  chunkBlocksForApi,
  assembleJsonFromCodeBlocks,
  buildHeading2,
  buildParagraph,
  buildToggle,
  type NotionListBlock,
} from '../notion-blocks';

describe('chunkRichText (2000-char + surrogate pair)', () => {
  it('짧은 문자열은 단일 청크', () => {
    const out = chunkRichText('hello');
    expect(out).toEqual([{ text: { content: 'hello' } }]);
  });

  it('정확히 maxLength 인 문자열은 1개 청크', () => {
    const s = 'a'.repeat(RICH_TEXT_MAX_LENGTH);
    const out = chunkRichText(s);
    expect(out).toHaveLength(1);
    expect(out[0].text.content.length).toBe(RICH_TEXT_MAX_LENGTH);
  });

  it('maxLength + 1 은 2개 청크로 분할', () => {
    const s = 'a'.repeat(RICH_TEXT_MAX_LENGTH + 1);
    const out = chunkRichText(s);
    expect(out).toHaveLength(2);
    expect(out[0].text.content.length).toBe(RICH_TEXT_MAX_LENGTH);
    expect(out[1].text.content.length).toBe(1);
    // round-trip
    expect(out.map((c) => c.text.content).join('')).toBe(s);
  });

  it('각 청크는 maxLength 이하', () => {
    const s = 'x'.repeat(10_005);
    const out = chunkRichText(s);
    for (const c of out) {
      expect(c.text.content.length).toBeLessThanOrEqual(RICH_TEXT_MAX_LENGTH);
    }
    // round-trip
    expect(out.map((c) => c.text.content).join('')).toBe(s);
  });

  it('이모지(surrogate pair) 가 청크 경계에 걸리면 한 자리 앞당겨 다음 청크로 넘김', () => {
    // 정확히 2000번째 위치에 4-byte 이모지(surrogate pair) 의 high surrogate 가 오도록 구성
    // 'a' x 1999 + 😀(U+1F600 = 😀) + 'b' x 100
    const s = 'a'.repeat(1999) + '😀' + 'b'.repeat(100);
    const out = chunkRichText(s);
    expect(out.length).toBeGreaterThan(1);
    // 첫 청크는 high surrogate 직전에서 잘려야 함 (1999자)
    expect(out[0].text.content.length).toBe(1999);
    // 두 번째 청크가 surrogate pair 로 시작해야 함
    expect(out[1].text.content.startsWith('😀')).toBe(true);
    // 합치면 원본
    expect(out.map((c) => c.text.content).join('')).toBe(s);
  });

  it('한글 BMP 문자만 있는 경우는 surrogate split 없이 정확히 자름', () => {
    const s = '가'.repeat(2500); // 한글 BMP — 단일 코드 유닛
    const out = chunkRichText(s);
    expect(out).toHaveLength(2);
    expect(out[0].text.content.length).toBe(2000);
    expect(out[1].text.content.length).toBe(500);
    expect(out.map((c) => c.text.content).join('')).toBe(s);
  });

  it('maxLength 커스텀 — 더 작은 단위로 분할', () => {
    const s = 'abcdefghij'; // 10
    const out = chunkRichText(s, 3);
    expect(out.map((c) => c.text.content)).toEqual(['abc', 'def', 'ghi', 'j']);
  });
});

describe('buildJsonCodeBlocks (100 rich_text/block)', () => {
  function makeRichTexts(n: number) {
    return Array.from({ length: n }, (_, i) => ({ text: { content: `c${i}` } }));
  }

  it('rich_text 100개 이하면 단일 code block + caption 빈 배열', () => {
    const blocks = buildJsonCodeBlocks(makeRichTexts(50));
    expect(blocks).toHaveLength(1);
    const code = (blocks[0] as { code: { rich_text: unknown[]; caption: unknown[]; language: string } }).code;
    expect(code.language).toBe('json');
    expect(code.rich_text).toHaveLength(50);
    expect(code.caption).toEqual([]);
  });

  it('rich_text 100개 초과 시 2개 code block 으로 분할, 두 번째는 (Part 2) caption', () => {
    const blocks = buildJsonCodeBlocks(makeRichTexts(150));
    expect(blocks).toHaveLength(2);
    const second = (blocks[1] as { code: { rich_text: unknown[]; caption: Array<{ text: { content: string } }> } }).code;
    expect(second.rich_text).toHaveLength(50);
    expect(second.caption[0].text.content).toBe('(Part 2)');
  });

  it('rich_text 200개는 정확히 2개 code block, 첫 블록 100/두 번째 100', () => {
    const blocks = buildJsonCodeBlocks(makeRichTexts(200));
    expect(blocks).toHaveLength(2);
    const first = (blocks[0] as { code: { rich_text: unknown[] } }).code.rich_text;
    const second = (blocks[1] as { code: { rich_text: unknown[] } }).code.rich_text;
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(100);
  });

  it('각 code block 의 rich_text 길이 ≤ 100', () => {
    const blocks = buildJsonCodeBlocks(makeRichTexts(305));
    expect(blocks).toHaveLength(4);
    for (const b of blocks) {
      const code = (b as { code: { rich_text: unknown[] } }).code;
      expect(code.rich_text.length).toBeLessThanOrEqual(RICH_TEXT_PER_BLOCK_LIMIT);
    }
  });
});

describe('chunkBlocksForApi (100 blocks/call)', () => {
  function makeBlocks(n: number) {
    return Array.from({ length: n }, (_, i) => ({ object: 'block' as const, idx: i }));
  }

  it('100 이하는 단일 배치', () => {
    const out = chunkBlocksForApi(makeBlocks(50));
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(50);
  });

  it('250 → 3개 배치 (100/100/50)', () => {
    const out = chunkBlocksForApi(makeBlocks(250));
    expect(out.map((b) => b.length)).toEqual([100, 100, 50]);
  });

  it('각 배치는 BLOCKS_PER_CALL_LIMIT 이하', () => {
    const out = chunkBlocksForApi(makeBlocks(305));
    for (const batch of out) {
      expect(batch.length).toBeLessThanOrEqual(BLOCKS_PER_CALL_LIMIT);
    }
  });

  it('빈 배열은 빈 배치 배열', () => {
    expect(chunkBlocksForApi([])).toEqual([]);
  });
});

describe('assembleJsonFromCodeBlocks (역조립)', () => {
  it('단일 code block 의 rich_text plain_text 들을 이어붙여 반환', () => {
    const blocks: NotionListBlock[] = [
      {
        type: 'code',
        code: {
          language: 'json',
          rich_text: [{ plain_text: '{"a":' }, { plain_text: ' 1}' }],
        },
      },
    ];
    expect(assembleJsonFromCodeBlocks(blocks)).toBe('{"a": 1}');
  });

  it('여러 code block 의 plain_text 를 순서대로 합침', () => {
    const blocks: NotionListBlock[] = [
      {
        type: 'code',
        code: {
          language: 'json',
          rich_text: [{ plain_text: '{"a":1' }],
        },
      },
      {
        type: 'code',
        code: {
          language: 'json',
          rich_text: [{ plain_text: ',"b":2}' }],
        },
      },
    ];
    expect(assembleJsonFromCodeBlocks(blocks)).toBe('{"a":1,"b":2}');
  });

  it('language 가 json 이 아닌 code block 은 무시', () => {
    const blocks: NotionListBlock[] = [
      {
        type: 'code',
        code: {
          language: 'json',
          rich_text: [{ plain_text: '{"a":' }],
        },
      },
      {
        type: 'code',
        code: {
          language: 'javascript',
          rich_text: [{ plain_text: 'console.log(1)' }],
        },
      },
      {
        type: 'code',
        code: {
          language: 'json',
          rich_text: [{ plain_text: ' 1}' }],
        },
      },
    ];
    expect(assembleJsonFromCodeBlocks(blocks)).toBe('{"a": 1}');
  });

  it('type 이 code 가 아닌 블록은 무시', () => {
    const blocks: NotionListBlock[] = [
      { type: 'paragraph' },
      {
        type: 'code',
        code: { language: 'json', rich_text: [{ plain_text: '{}' }] },
      },
    ];
    expect(assembleJsonFromCodeBlocks(blocks)).toBe('{}');
  });

  it('빈 입력은 빈 문자열', () => {
    expect(assembleJsonFromCodeBlocks([])).toBe('');
  });

  it('Round-trip — chunkRichText → assemble (plain_text 매핑) 후 동일 문자열', () => {
    const original = JSON.stringify({
      msg: '한글 + emoji 😀 + 라틴',
      arr: Array.from({ length: 200 }, (_, i) => ({ id: i, name: `name-${i}` })),
    });
    const richTexts = chunkRichText(original);
    // 단일 code block 으로 가정 (richTexts ≤ 100 일 때) — 더 큰 케이스는 buildJsonCodeBlocks 통과 후 매핑
    const codeBlocks = buildJsonCodeBlocks(richTexts);
    const asListBlocks: NotionListBlock[] = codeBlocks.map((b) => {
      const code = (b as { code: { language: string; rich_text: Array<{ text: { content: string } }> } }).code;
      return {
        type: 'code',
        code: {
          language: code.language,
          rich_text: code.rich_text.map((rt) => ({ plain_text: rt.text.content })),
        },
      };
    });
    const reassembled = assembleJsonFromCodeBlocks(asListBlocks);
    expect(reassembled).toBe(original);
  });
});

describe('블록 빌더 헬퍼', () => {
  it('buildHeading2', () => {
    expect(buildHeading2('Title')).toEqual({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: 'Title' } }] },
    });
  });

  it('buildParagraph', () => {
    expect(buildParagraph('p')).toEqual({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: 'p' } }] },
    });
  });

  it('buildToggle 은 children 을 그대로 포함', () => {
    const child = buildParagraph('child');
    const toggle = buildToggle('Title', [child]) as {
      toggle: { rich_text: Array<{ text: { content: string } }>; children: unknown[] };
    };
    expect(toggle.toggle.rich_text[0].text.content).toBe('Title');
    expect(toggle.toggle.children).toEqual([child]);
  });
});
