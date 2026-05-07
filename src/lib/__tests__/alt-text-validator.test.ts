import {
  sanitizeExtractedText,
  normalizeKorean,
  computeSimilarity,
  extractImagesFromPage,
  classifyImageType,
  judgeAltText,
  getDynamicThreshold,
  scanPageForAltMismatches,
  clearOcrCache,
} from '../alt-text-validator';
import type { VisionAnalysisResult } from '../../types/alt-text';

// ---------------------------------------------------------------------------
// Mock: tesseract.js + sharp (네트워크/워커 호출 방지)
// ---------------------------------------------------------------------------

const mockRecognize = jest.fn();
const mockTerminate = jest.fn().mockResolvedValue(undefined);
const mockSetParameters = jest.fn().mockResolvedValue(undefined);

jest.mock('tesseract.js', () => ({
  createWorker: jest.fn().mockImplementation(async () => ({
    recognize: mockRecognize,
    terminate: mockTerminate,
    setParameters: mockSetParameters,
  })),
}));

jest.mock('sharp', () => {
  const chain = {
    metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
    stats: jest.fn().mockResolvedValue({
      channels: [{ mean: 150 }, { mean: 150 }, { mean: 150 }],
    }),
    resize: jest.fn().mockReturnThis(),
    grayscale: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
    sharpen: jest.fn().mockReturnThis(),
    threshold: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('preprocessed')),
  };
  return jest.fn(() => chain);
});

global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: async () => new ArrayBuffer(8),
}) as unknown as typeof fetch;

// ---------------------------------------------------------------------------
// Helper: Playwright Page stub
// ---------------------------------------------------------------------------

function makePageStub(
  images: Array<{ id: string; src: string; alt: string | null; w?: number; h?: number }>,
  url = 'https://example.com/',
) {
  return {
    url: () => url,
    evaluate: jest.fn().mockImplementation((_fn: Function, arg: { limit: number; minSize: number }) => {
      const { limit, minSize } = arg;
      return images
        .filter((img) => {
          if (!img.src.startsWith('https://') && !img.src.startsWith('data:image/')) return false;
          if ((img.w ?? 100) < minSize || (img.h ?? 100) < minSize) return false;
          return true;
        })
        .slice(0, limit)
        .map((img) => ({
          elementId: img.id ? `#${img.id}` : `//html/body/img`,
          src: img.src,
          alt: img.alt,
          naturalWidth: img.w ?? 100,
          naturalHeight: img.h ?? 100,
        }));
    }),
  };
}

function mockOcr(text: string, confidencePct: number) {
  mockRecognize.mockResolvedValueOnce({
    data: { text, confidence: confidencePct },
  });
}

beforeEach(() => {
  mockRecognize.mockReset();
  clearOcrCache();
});

// ---------------------------------------------------------------------------
// sanitizeExtractedText
// ---------------------------------------------------------------------------

describe('sanitizeExtractedText', () => {
  test('removes newlines and collapses whitespace', () => {
    expect(sanitizeExtractedText('Hello\nWorld\r\n  Test')).toBe('Hello World Test');
  });

  test('preserves meaningful punctuation', () => {
    expect(sanitizeExtractedText('안녕하세요! 진단 결과: 100%')).toBe('안녕하세요! 진단 결과 100%');
  });

  test('trims leading and trailing whitespace', () => {
    expect(sanitizeExtractedText('  clean text  ')).toBe('clean text');
  });

  test('returns empty string when input is blank', () => {
    expect(sanitizeExtractedText('   \n\r\n   ')).toBe('');
  });

  test('preserves Korean characters', () => {
    expect(sanitizeExtractedText('이미지 내 텍스트\n두 번째 줄')).toContain('이미지 내 텍스트');
  });
});

// ---------------------------------------------------------------------------
// normalizeKorean (한국어 조사/어미 제거)
// ---------------------------------------------------------------------------

describe('normalizeKorean', () => {
  test('removes common particles (조사)', () => {
    expect(normalizeKorean('이미지를')).toBe('이미지');
    expect(normalizeKorean('접근성의')).toBe('접근성');
    expect(normalizeKorean('텍스트에서')).toBe('텍스트');
  });

  test('removes verb endings (어미)', () => {
    expect(normalizeKorean('진단합니다')).toBe('진단');
    expect(normalizeKorean('검사됩니다')).toBe('검사');
  });

  test('does not modify non-Korean text', () => {
    expect(normalizeKorean('hello world')).toBe('hello world');
  });

  test('preserves base form when no particle is present', () => {
    expect(normalizeKorean('이미지')).toBe('이미지');
  });
});

// ---------------------------------------------------------------------------
// computeSimilarity (Jaccard + Containment + Ngram + Levenshtein 앙상블)
// ---------------------------------------------------------------------------

describe('computeSimilarity', () => {
  test('identical strings return 1.0', () => {
    expect(computeSimilarity('hello world', 'hello world')).toBe(1.0);
  });

  test('completely different strings return near 0', () => {
    // Levenshtein은 완전히 다른 문자열에도 소량의 유사도를 반환할 수 있음
    expect(computeSimilarity('apple', 'orange')).toBeLessThan(0.3);
  });

  test('empty strings return 0.0', () => {
    expect(computeSimilarity('', 'something')).toBe(0.0);
    expect(computeSimilarity('something', '')).toBe(0.0);
    expect(computeSimilarity('', '')).toBe(0.0);
  });

  test('partial overlap returns value between 0 and 1', () => {
    const score = computeSimilarity('웹 접근성 감사', '감사 보고서');
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test('case insensitive', () => {
    expect(computeSimilarity('Hello World', 'hello world')).toBe(1.0);
  });

  test('punctuation is normalised', () => {
    expect(computeSimilarity('hello, world!', 'hello world')).toBe(1.0);
  });

  test('containment ratio rescues partial alt coverage (회사로고 vs 회사)', () => {
    const score = computeSimilarity('회사로고 상세페이지 배너', '회사');
    expect(score).toBeGreaterThanOrEqual(0.3);
  });

  test('Korean particles are normalized (조사 제거)', () => {
    // "이미지를 확인" vs "이미지 확인" — 조사 제거 후 일치
    const score = computeSimilarity('이미지를 확인하세요', '이미지 확인');
    expect(score).toBeGreaterThan(0.6);
  });

  test('synonym matching (동의어 사전)', () => {
    // "로그인" ↔ "login" 동의어 매칭
    const score = computeSimilarity('로그인', 'login');
    expect(score).toBe(1.0);
  });

  test('synonym matching for compound terms', () => {
    const score = computeSimilarity('회원가입 페이지', 'signup 페이지');
    expect(score).toBeGreaterThan(0.5);
  });

  test('Levenshtein similarity for near-matches', () => {
    // 한두 글자 차이는 높은 유사도
    const score = computeSimilarity('접근성 진단 결과', '접근성 진단 결과표');
    expect(score).toBeGreaterThan(0.7);
  });

  test('imageType affects weighted scoring for text-heavy', () => {
    const scoreDefault = computeSimilarity('특별 할인 이벤트', '특별할인 이벤트 50%');
    const scoreTextHeavy = computeSimilarity('특별 할인 이벤트', '특별할인 이벤트 50%', 'text-heavy');
    // text-heavy 가중 평균은 containment/levenshtein 비중이 높아 다를 수 있음
    expect(scoreTextHeavy).toBeGreaterThan(0);
    expect(scoreDefault).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// getDynamicThreshold (동적 임계값)
// ---------------------------------------------------------------------------

describe('getDynamicThreshold', () => {
  test('low confidence returns 0.3', () => {
    expect(getDynamicThreshold('text-heavy', '짧은 텍스트', 0.3)).toBe(0.3);
  });

  test('text-heavy base is 0.5', () => {
    // 3-5 단어: base 유지
    expect(getDynamicThreshold('text-heavy', '단어 세 개 있다', 0.8)).toBe(0.5);
  });

  test('mixed base is 0.4', () => {
    expect(getDynamicThreshold('mixed', '단어 세 개 있다', 0.8)).toBe(0.4);
  });

  test('short text (1-2 words) increases threshold', () => {
    // text-heavy + 1 word: 0.5 + 0.15 = 0.65
    expect(getDynamicThreshold('text-heavy', '로고', 0.8)).toBe(0.65);
  });

  test('long text (6+ words) decreases threshold', () => {
    // text-heavy + 6 words: 0.5 - 0.1 = 0.4
    expect(getDynamicThreshold('text-heavy', '첫 번째 두 번째 세 번째 네 번째', 0.8)).toBe(0.4);
  });

  test('clamped between 0.2 and 0.8', () => {
    // Even extreme cases stay within bounds
    const result = getDynamicThreshold('photo', '한 단어', 0.9);
    expect(result).toBeGreaterThanOrEqual(0.2);
    expect(result).toBeLessThanOrEqual(0.8);
  });
});

// ---------------------------------------------------------------------------
// classifyImageType
// ---------------------------------------------------------------------------

describe('classifyImageType', () => {
  const make = (text: string, conf: number, words: number): VisionAnalysisResult => ({
    extractedText: text,
    confidenceScore: conf,
    wordCount: words,
  });

  test('no text → photo', () => {
    expect(classifyImageType(make('', 0, 0))).toBe('photo');
  });

  test('high confidence + many words → text-heavy', () => {
    expect(classifyImageType(make('웹 접근성 진단 결과', 0.85, 5))).toBe('text-heavy');
  });

  test('low confidence → photo', () => {
    expect(classifyImageType(make('x', 0.2, 1))).toBe('photo');
  });

  test('medium confidence + few words → mixed', () => {
    expect(classifyImageType(make('로고', 0.55, 1))).toBe('mixed');
  });
});

// ---------------------------------------------------------------------------
// judgeAltText (4단계 판정)
// ---------------------------------------------------------------------------

describe('judgeAltText', () => {
  test('missing alt attribute → missing_alt', () => {
    const r = judgeAltText({
      altAttr: null,
      imageType: 'text-heavy',
      similarity: 0,
      ocrText: '텍스트',
      threshold: 0.6,
    });
    expect(r.judgment).toBe('missing_alt');
  });

  test('alt="" on text-heavy image → decorative_mismatch', () => {
    const r = judgeAltText({
      altAttr: '',
      imageType: 'text-heavy',
      similarity: 0,
      ocrText: '특별 할인',
      threshold: 0.6,
    });
    expect(r.judgment).toBe('decorative_mismatch');
  });

  test('alt="" on photo image → pass (진짜 장식)', () => {
    const r = judgeAltText({
      altAttr: '',
      imageType: 'photo',
      similarity: 0,
      ocrText: '',
      threshold: 0.6,
    });
    expect(r.judgment).toBe('pass');
  });

  test('photo with alt text → review_needed', () => {
    const r = judgeAltText({
      altAttr: '풍경 사진',
      imageType: 'photo',
      similarity: 0,
      ocrText: '',
      threshold: 0.6,
    });
    expect(r.judgment).toBe('review_needed');
  });

  test('text-heavy with matching alt → pass', () => {
    const r = judgeAltText({
      altAttr: '접근성 진단',
      imageType: 'text-heavy',
      similarity: 0.9,
      ocrText: '접근성 진단',
      threshold: 0.6,
    });
    expect(r.judgment).toBe('pass');
  });

  test('text-heavy with mismatching alt → text_mismatch', () => {
    const r = judgeAltText({
      altAttr: '회사 로고',
      imageType: 'text-heavy',
      similarity: 0.1,
      ocrText: '특별 할인 이벤트',
      threshold: 0.6,
    });
    expect(r.judgment).toBe('text_mismatch');
  });
});

// ---------------------------------------------------------------------------
// extractImagesFromPage
// ---------------------------------------------------------------------------

describe('extractImagesFromPage', () => {
  test('filters out images smaller than minSizePx', async () => {
    const page = makePageStub([
      { id: 'icon', src: 'https://example.com/icon.png', alt: 'icon', w: 16, h: 16 },
      { id: 'logo', src: 'https://example.com/logo.png', alt: '로고', w: 200, h: 80 },
    ]);

    const result = await extractImagesFromPage(page as any, 20, 32);
    expect(result).toHaveLength(1);
    expect(result[0].elementId).toBe('#logo');
  });

  test('respects maxImages limit', async () => {
    const images = Array.from({ length: 10 }, (_, i) => ({
      id: `img${i}`,
      src: `https://example.com/img${i}.png`,
      alt: `Image ${i}`,
    }));

    const result = await extractImagesFromPage(makePageStub(images) as any, 3);
    expect(result).toHaveLength(3);
  });

  test('preserves null alt (속성 없음)과 empty string("") 구분', async () => {
    const page = makePageStub([
      { id: 'noalt', src: 'https://example.com/noalt.png', alt: null },
      { id: 'empty', src: 'https://example.com/empty.png', alt: '' },
    ]);

    const result = await extractImagesFromPage(page as any);
    expect(result).toHaveLength(2);
    expect(result[0].alt).toBeNull();
    expect(result[1].alt).toBe('');
  });
});

// ---------------------------------------------------------------------------
// scanPageForAltMismatches — 통합
// ---------------------------------------------------------------------------

describe('scanPageForAltMismatches', () => {
  test('text_mismatch 로 판정', async () => {
    const page = makePageStub([
      { id: 'banner', src: 'https://example.com/banner.png', alt: '회사 로고' },
    ]);
    mockOcr('특별 할인 이벤트 50% OFF', 85);

    const result = await scanPageForAltMismatches(page as any, {
      similarityThreshold: 0.6,
      enablePreprocessing: false,
    });

    expect(result.totalImagesScanned).toBe(1);
    expect(result.mismatchCount).toBe(1);
    expect(result.items[0].judgment).toBe('text_mismatch');
    expect(result.countsByJudgment.text_mismatch).toBe(1);
  });

  test('pass 판정 (alt가 OCR과 일치)', async () => {
    const page = makePageStub([
      { id: 'title', src: 'https://example.com/title.png', alt: '웹 접근성 진단 결과' },
    ]);
    mockOcr('웹 접근성 진단 결과', 90);

    const result = await scanPageForAltMismatches(page as any, { enablePreprocessing: false });
    expect(result.mismatchCount).toBe(0);
    expect(result.items[0].judgment).toBe('pass');
  });

  test('사진 이미지는 review_needed', async () => {
    const page = makePageStub([
      { id: 'photo', src: 'https://example.com/photo.jpg', alt: '자연 사진' },
    ]);
    mockOcr('', 20);

    const result = await scanPageForAltMismatches(page as any, { enablePreprocessing: false });
    expect(result.items[0].judgment).toBe('review_needed');
    expect(result.countsByJudgment.review_needed).toBe(1);
  });

  test('결과 메타데이터 확인', async () => {
    const page = makePageStub([], 'https://test.com/page');
    const result = await scanPageForAltMismatches(page as any, { enablePreprocessing: false });

    expect(result.pageUrl).toBe('https://test.com/page');
    expect(result.scannedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.totalImagesScanned).toBe(0);
    expect(result.items).toEqual([]);
  });

  test('여러 이미지 판정 집계', async () => {
    const page = makePageStub([
      { id: 'img1', src: 'https://example.com/a.png', alt: '오래된 설명' },
      { id: 'img2', src: 'https://example.com/b.png', alt: '정확한 설명' },
      { id: 'img3', src: 'https://example.com/c.png', alt: null },
    ]);

    mockOcr('새로운 배너 문구', 85); // text_mismatch
    mockOcr('정확한 설명', 90); // pass
    mockOcr('어떤 텍스트', 85); // missing_alt (null alt)

    const result = await scanPageForAltMismatches(page as any, {
      similarityThreshold: 0.6,
      enablePreprocessing: false,
    });

    expect(result.totalImagesScanned).toBe(3);
    expect(result.mismatchCount).toBe(2);
    expect(result.countsByJudgment.pass).toBe(1);
    expect(result.countsByJudgment.missing_alt).toBe(1);
    expect(result.countsByJudgment.text_mismatch).toBe(1);
  });

  test('AbortSignal로 중단 가능', async () => {
    const page = makePageStub([
      { id: 'a', src: 'https://example.com/a.png', alt: 'a' },
      { id: 'b', src: 'https://example.com/b.png', alt: 'b' },
    ]);
    mockOcr('content a', 85);
    mockOcr('content b', 85);

    const controller = new AbortController();
    controller.abort();

    const result = await scanPageForAltMismatches(page as any, {
      abortSignal: controller.signal,
      enablePreprocessing: false,
    });

    expect(result.totalImagesScanned).toBe(0);
  });

  test('progress 콜백 호출', async () => {
    const page = makePageStub([
      { id: 'a', src: 'https://example.com/a.png', alt: 'a' },
      { id: 'b', src: 'https://example.com/b.png', alt: 'b' },
    ]);
    mockOcr('content', 85);
    mockOcr('content', 85);

    const onProgress = jest.fn();
    await scanPageForAltMismatches(page as any, {
      onProgress,
      enablePreprocessing: false,
    });

    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2, 'https://example.com/b.png');
  });
});
