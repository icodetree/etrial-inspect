/**
 * KWCAG 2.2 § 1.1.1 이미지 대체 텍스트 적절성 검증기
 *
 * 파이프라인:
 *   DOM 추출 → Vision OCR → 유사도 비교 → 불일치 JSON 생성
 *
 * 이 모듈은 측정·보고(Read & Report) 전용입니다. 수정 로직을 포함하지 않습니다.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Page } from 'playwright-core';
import type {
  AltTextMismatch,
  AltTextScanOptions,
  AltTextScanResult,
  ImageMetadata,
  VisionAnalysisResult,
} from '@/types/alt-text';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const DEFAULT_MAX_IMAGES = 50;

/** Vision 분석 신뢰도: 텍스트를 성공적으로 추출했을 때의 기본값 */
const VISION_CONFIDENCE_HIGH = 0.9;
/** 모델이 텍스트를 찾지 못했을 때 */
const VISION_CONFIDENCE_NO_TEXT = 1.0;

// ---------------------------------------------------------------------------
// Anthropic 클라이언트 (싱글톤)
// ---------------------------------------------------------------------------

let _anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic();
  }
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Step 1: DOM 추출
// ---------------------------------------------------------------------------

/**
 * Playwright Page에서 검사 대상 이미지 목록을 추출합니다.
 * - `alt=""` (장식용 이미지)는 제외합니다.
 * - `alt` 속성이 아예 없는 이미지도 포함합니다 (누락 케이스).
 */
export async function extractImagesFromPage(
  page: Page,
  maxImages = DEFAULT_MAX_IMAGES,
): Promise<ImageMetadata[]> {
  const images: ImageMetadata[] = await page.evaluate((limit: number) => {
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));

    const getElementId = (el: HTMLImageElement): string => {
      if (el.id) return `#${el.id}`;
      return buildXPath(el);
    };

    const buildXPath = (el: Element): string => {
      if (!el.parentElement) return `/${el.tagName.toLowerCase()}`;
      const tag = el.tagName.toLowerCase();
      const siblings = Array.from(el.parentElement.children).filter(
        (c) => c.tagName === el.tagName,
      );
      const idx = siblings.indexOf(el) + 1;
      const position = siblings.length > 1 ? `[${idx}]` : '';
      return `${buildXPath(el.parentElement)}/${tag}${position}`;
    };

    return imgs
      .filter((img) => {
        // alt="" → 장식용, 제외
        if (img.hasAttribute('alt') && img.getAttribute('alt') === '') return false;
        // src 없는 이미지 제외
        if (!img.src || img.src.startsWith('data:image/') === false && !img.src.match(/^https?:\/\//)) return false;
        return true;
      })
      .slice(0, limit)
      .map((img) => ({
        elementId: getElementId(img),
        src: img.src,
        alt: img.getAttribute('alt') ?? '',
      }));
  }, maxImages);

  return images;
}

// ---------------------------------------------------------------------------
// Step 2: Vision 분석 (Claude API)
// ---------------------------------------------------------------------------

/**
 * 이미지 URL 또는 base64 데이터 URL에서 텍스트를 추출합니다.
 *
 * base64 data URL(`data:image/...;base64,...`)과 일반 https URL 모두 지원합니다.
 */
export async function analyzeImageWithVision(
  imageUrl: string,
): Promise<VisionAnalysisResult> {
  const client = getAnthropicClient();

  try {
    let imageSource: Anthropic.Base64ImageSource | Anthropic.URLImageSource;

    if (imageUrl.startsWith('data:image/')) {
      // data URL → base64 추출
      const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match) {
        return { extractedText: '', confidenceScore: 0 };
      }
      imageSource = {
        type: 'base64',
        media_type: match[1] as Anthropic.Base64ImageSource['media_type'],
        data: match[2],
      };
    } else {
      imageSource = {
        type: 'url',
        url: imageUrl,
      };
    }

    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: imageSource },
            {
              type: 'text',
              text:
                '이 이미지에 포함된 텍스트를 모두 추출하세요. ' +
                '텍스트가 없으면 빈 문자열만 반환하세요. ' +
                '추출한 텍스트만 반환하고 설명이나 부가 내용은 절대 포함하지 마세요.',
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return { extractedText: '', confidenceScore: 0 };
    }

    const raw = content.text;
    const cleaned = sanitizeExtractedText(raw);

    if (!cleaned) {
      // 텍스트 없음 → 이 이미지는 비텍스트 이미지
      return { extractedText: '', confidenceScore: VISION_CONFIDENCE_NO_TEXT };
    }

    return { extractedText: cleaned, confidenceScore: VISION_CONFIDENCE_HIGH };
  } catch (error) {
    console.error('[alt-text-validator] Vision API error:', error);
    return { extractedText: '', confidenceScore: 0 };
  }
}

// ---------------------------------------------------------------------------
// Step 3: 텍스트 정제
// ---------------------------------------------------------------------------

/**
 * OCR 결과에서 불필요한 특수문자·개행을 제거하여 순수 텍스트로 정제합니다.
 */
export function sanitizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n|\r|\n/g, ' ')          // 개행 → 공백
    .replace(/[^\w\sㄱ-힣.,!?()%$@#-]/gu, '') // 의미 없는 특수문자 제거
    .replace(/\s{2,}/g, ' ')              // 연속 공백 → 단일 공백
    .trim();
}

// ---------------------------------------------------------------------------
// Step 4: 유사도 계산
// ---------------------------------------------------------------------------

/**
 * 두 문자열의 단어 기반 Jaccard 유사도를 계산합니다.
 *
 * 한국어 + 영어 혼용에 강건하도록 소문자 정규화 및 구두점 제거 후 비교합니다.
 * 반환값: 0.0 (완전 불일치) ~ 1.0 (완전 일치)
 */
export function computeSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\w\sㄱ-힣]/gu, '')
      .trim();

  const na = normalize(a);
  const nb = normalize(b);

  if (!na || !nb) return 0.0;
  if (na === nb) return 1.0;

  const setA = new Set(na.split(/\s+/).filter(Boolean));
  const setB = new Set(nb.split(/\s+/).filter(Boolean));

  const intersectionSize = [...setA].filter((t) => setB.has(t)).length;
  const unionSize = new Set([...setA, ...setB]).size;

  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

// ---------------------------------------------------------------------------
// Step 5: 메인 파이프라인
// ---------------------------------------------------------------------------

/**
 * Playwright Page를 대상으로 이미지 대체 텍스트 불일치를 스캔합니다.
 *
 * @param page       - 스캔할 Playwright Page 인스턴스
 * @param options    - 스캔 옵션 (임계값, 최대 이미지 수)
 * @returns          - 페이지 단위 스캔 결과 (불일치 항목 배열 포함)
 *
 * @example
 * ```ts
 * const result = await scanPageForAltMismatches(page, { similarityThreshold: 0.75 });
 * console.log(JSON.stringify(result.mismatches, null, 2));
 * ```
 */
export async function scanPageForAltMismatches(
  page: Page,
  options: AltTextScanOptions = {},
): Promise<AltTextScanResult> {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const pageUrl = page.url();
  const scannedAt = new Date().toISOString();

  // 1. DOM 이미지 추출
  const images = await extractImagesFromPage(page, maxImages);

  const mismatches: AltTextMismatch[] = [];

  // 2. 각 이미지 순차 분석 (Vision API rate limit 고려)
  for (const img of images) {
    const { extractedText, confidenceScore } = await analyzeImageWithVision(img.src);

    // 이미지 내 텍스트가 없으면 alt와 비교할 기준이 없으므로 스킵
    if (!extractedText) continue;

    // 3. 유사도 비교
    const similarity = computeSimilarity(img.alt, extractedText);
    if (similarity >= threshold) continue;

    // 4. 불일치 항목 수집
    const mismatch: AltTextMismatch = {
      elementId: img.elementId,
      imageUrl: img.src,
      currentAlt: img.alt,
      extractedText,
      confidenceScore,
    };

    mismatches.push(mismatch);
  }

  return {
    pageUrl,
    scannedAt,
    totalImagesScanned: images.length,
    mismatchCount: mismatches.length,
    mismatches,
  };
}
