import {
  sanitizeExtractedText,
  computeSimilarity,
  extractImagesFromPage,
  analyzeImageWithVision,
  scanPageForAltMismatches,
} from '../alt-text-validator';

// ---------------------------------------------------------------------------
// Mock: @anthropic-ai/sdk
// ---------------------------------------------------------------------------

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
});

// ---------------------------------------------------------------------------
// Helper: Playwright Page stub
// ---------------------------------------------------------------------------

function makePageStub(
  images: Array<{ id: string; src: string; alt: string | null }>,
  url = 'https://example.com/',
) {
  return {
    url: () => url,
    evaluate: jest.fn().mockImplementation((fn: Function, arg: unknown) => {
      // Simulate page.evaluate by running the function in Node.js context
      // We replicate the behaviour without a real browser.
      return images
        .filter((img) => {
          if (img.alt === '') return false;
          if (!img.src.startsWith('https://')) return false;
          return true;
        })
        .slice(0, arg as number)
        .map((img) => ({
          elementId: img.id ? `#${img.id}` : `//html/body/img`,
          src: img.src,
          alt: img.alt ?? '',
        }));
    }),
  };
}

// ---------------------------------------------------------------------------
// sanitizeExtractedText
// ---------------------------------------------------------------------------

describe('sanitizeExtractedText', () => {
  test('removes newlines and collapses whitespace', () => {
    // 개행은 공백으로 변환, 연속 공백은 단일 공백으로 축약됨
    expect(sanitizeExtractedText('Hello\nWorld\r\n  Test')).toBe('Hello World Test');
  });

  test('strips non-meaningful special characters, preserves meaningful punctuation', () => {
    // `:` 등은 제거되지만 `!`, `%`는 의미 있는 문자로 보존됨
    expect(sanitizeExtractedText('안녕하세요! 진단 결과: 100%')).toBe(
      '안녕하세요! 진단 결과 100%',
    );
  });

  test('trims leading and trailing whitespace', () => {
    expect(sanitizeExtractedText('  clean text  ')).toBe('clean text');
  });

  test('returns empty string when input is blank', () => {
    expect(sanitizeExtractedText('   \n\r\n   ')).toBe('');
  });

  test('preserves Korean characters', () => {
    const input = '이미지 내 텍스트\n두 번째 줄';
    expect(sanitizeExtractedText(input)).toContain('이미지 내 텍스트');
  });
});

// ---------------------------------------------------------------------------
// computeSimilarity
// ---------------------------------------------------------------------------

describe('computeSimilarity', () => {
  test('identical strings return 1.0', () => {
    expect(computeSimilarity('hello world', 'hello world')).toBe(1.0);
  });

  test('completely different strings return 0.0', () => {
    expect(computeSimilarity('apple', 'orange')).toBe(0.0);
  });

  test('empty strings return 0.0', () => {
    expect(computeSimilarity('', 'something')).toBe(0.0);
    expect(computeSimilarity('something', '')).toBe(0.0);
  });

  test('both empty strings return 0.0 (no meaningful content to compare)', () => {
    expect(computeSimilarity('', '')).toBe(0.0);
  });

  test('partial overlap returns value between 0 and 1', () => {
    // 공유 토큰: "진단" → intersection 1, union 3
    const score = computeSimilarity('웹 접근성 진단', '진단 결과');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test('case insensitive comparison', () => {
    expect(computeSimilarity('Hello World', 'hello world')).toBe(1.0);
  });

  test('punctuation is normalised before comparison', () => {
    expect(computeSimilarity('hello, world!', 'hello world')).toBe(1.0);
  });

  test('superset returns non-zero score', () => {
    // "KWCAG 진단 결과" contains all tokens of "진단 결과"
    const score = computeSimilarity('KWCAG 진단 결과', '진단 결과');
    expect(score).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// extractImagesFromPage
// ---------------------------------------------------------------------------

describe('extractImagesFromPage', () => {
  test('excludes decorative images (alt="")', async () => {
    const page = makePageStub([
      { id: 'logo', src: 'https://example.com/logo.png', alt: 'Company logo' },
      { id: 'deco', src: 'https://example.com/deco.png', alt: '' },
    ]);

    const result = await extractImagesFromPage(page as any);
    expect(result).toHaveLength(1);
    expect(result[0].elementId).toBe('#logo');
  });

  test('uses #id as elementId when id attribute is present', async () => {
    const page = makePageStub([
      { id: 'banner', src: 'https://example.com/banner.jpg', alt: '배너' },
    ]);

    const result = await extractImagesFromPage(page as any);
    expect(result[0].elementId).toBe('#banner');
  });

  test('respects maxImages limit', async () => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      id: `img${i}`,
      src: `https://example.com/img${i}.png`,
      alt: `Image ${i}`,
    }));

    const page = makePageStub(images);
    const result = await extractImagesFromPage(page as any, 3);
    expect(result).toHaveLength(3);
  });

  test('includes images with missing alt attribute (empty string fallback)', async () => {
    const page = makePageStub([
      { id: 'noalt', src: 'https://example.com/noalt.png', alt: null },
    ]);

    const result = await extractImagesFromPage(page as any);
    expect(result).toHaveLength(1);
    expect(result[0].alt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// analyzeImageWithVision
// ---------------------------------------------------------------------------

describe('analyzeImageWithVision', () => {
  beforeEach(() => mockCreate.mockReset());

  test('returns extracted text from a successful Vision API response', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '진단 결과\n100점' }],
    });

    const result = await analyzeImageWithVision('https://example.com/img.png');

    expect(result.extractedText).toBe('진단 결과 100점');
    expect(result.confidenceScore).toBe(0.9);
  });

  test('returns empty text with confidence 1.0 when model finds no text', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '' }],
    });

    const result = await analyzeImageWithVision('https://example.com/photo.jpg');
    expect(result.extractedText).toBe('');
    expect(result.confidenceScore).toBe(1.0);
  });

  test('returns confidence 0 on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API error'));

    const result = await analyzeImageWithVision('https://example.com/err.png');
    expect(result.extractedText).toBe('');
    expect(result.confidenceScore).toBe(0);
  });

  test('handles base64 data URL', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Sample Text' }],
    });

    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = await analyzeImageWithVision(dataUrl);
    expect(result.extractedText).toBe('Sample Text');

    const callArg = mockCreate.mock.calls[0][0];
    const imageContent = callArg.messages[0].content[0];
    expect(imageContent.source.type).toBe('base64');
  });
});

// ---------------------------------------------------------------------------
// scanPageForAltMismatches — integration
// ---------------------------------------------------------------------------

describe('scanPageForAltMismatches', () => {
  beforeEach(() => mockCreate.mockReset());

  test('reports mismatch when alt text differs significantly from extracted text', async () => {
    const page = makePageStub([
      {
        id: 'banner',
        src: 'https://example.com/banner.png',
        alt: '회사 로고',
      },
    ]);

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '특별 할인 이벤트 50% OFF' }],
    });

    const result = await scanPageForAltMismatches(page as any, {
      similarityThreshold: 0.8,
    });

    expect(result.mismatchCount).toBe(1);
    expect(result.mismatches[0]).toMatchObject({
      elementId: '#banner',
      imageUrl: 'https://example.com/banner.png',
      currentAlt: '회사 로고',
      extractedText: '특별 할인 이벤트 50% OFF',
    });
  });

  test('does NOT report when alt is sufficiently similar to extracted text', async () => {
    const page = makePageStub([
      {
        id: 'title',
        src: 'https://example.com/title.png',
        alt: '웹 접근성 진단 결과',
      },
    ]);

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '웹 접근성 진단 결과' }],
    });

    const result = await scanPageForAltMismatches(page as any);
    expect(result.mismatchCount).toBe(0);
  });

  test('skips image when Vision API returns empty (non-text image)', async () => {
    const page = makePageStub([
      { id: 'photo', src: 'https://example.com/photo.jpg', alt: '자연 사진' },
    ]);

    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: '' }],
    });

    const result = await scanPageForAltMismatches(page as any);
    expect(result.mismatchCount).toBe(0);
    expect(result.totalImagesScanned).toBe(1);
  });

  test('returns correct metadata on the result object', async () => {
    const page = makePageStub([], 'https://test.com/page');

    const result = await scanPageForAltMismatches(page as any);

    expect(result.pageUrl).toBe('https://test.com/page');
    expect(result.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.totalImagesScanned).toBe(0);
    expect(result.mismatches).toEqual([]);
  });

  test('processes multiple images and aggregates mismatches', async () => {
    const page = makePageStub([
      { id: 'img1', src: 'https://example.com/a.png', alt: '오래된 설명' },
      { id: 'img2', src: 'https://example.com/b.png', alt: '정확한 설명' },
      { id: 'img3', src: 'https://example.com/c.png', alt: '잘못된 설명' },
    ]);

    mockCreate
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '새로운 배너 문구' }] }) // mismatch
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '정확한 설명' }] }) // match
      .mockResolvedValueOnce({ content: [{ type: 'text', text: '완전히 다른 내용' }] }); // mismatch

    const result = await scanPageForAltMismatches(page as any, {
      similarityThreshold: 0.8,
    });

    expect(result.totalImagesScanned).toBe(3);
    expect(result.mismatchCount).toBe(2);
    expect(result.mismatches.map((m) => m.elementId)).toEqual(['#img1', '#img3']);
  });
});
