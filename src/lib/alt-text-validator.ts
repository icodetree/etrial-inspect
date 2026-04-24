import { Page } from 'playwright-core';
import Tesseract from 'tesseract.js';
import {
  AltTextMismatch,
  AltTextScanOptions,
  AltTextScanResult,
  VisionAnalysisResult,
  ImageMetadata,
} from '../types/alt-text';

const DEFAULT_SIMILARITY_THRESHOLD = 0.8;
const DEFAULT_MAX_IMAGES = 50;

// ---------------------------------------------------------------------------
// Step 1: DOM 추출
// ---------------------------------------------------------------------------

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
        if (img.hasAttribute('alt') && img.getAttribute('alt') === '') return false;
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
// Step 2: Vision 분석 (Tesseract.js - 무료/오프라인)
// ---------------------------------------------------------------------------

export async function analyzeImageWithVision(
  imageUrl: string,
): Promise<VisionAnalysisResult> {
  try {
    // 한국어와 영어를 동시에 인식합니다.
    const { data: { text } } = await Tesseract.recognize(
      imageUrl,
      'kor+eng',
      { logger: m => {} } // 로깅 비활성화
    );

    const cleaned = sanitizeExtractedText(text);

    if (!cleaned) {
      return { extractedText: '', confidenceScore: 1.0 };
    }

    return { extractedText: cleaned, confidenceScore: 1.0 };
  } catch (error) {
    console.error('[alt-text-validator] Tesseract API error:', error);
    return { extractedText: '', confidenceScore: 0 };
  }
}

// ---------------------------------------------------------------------------
// Step 3: 텍스트 정제
// ---------------------------------------------------------------------------

export function sanitizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/[^\w\sㄱ-힣.,!?()%$@#-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Step 4: 유사도 계산
// ---------------------------------------------------------------------------

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

export async function scanPageForAltMismatches(
  page: Page,
  options: AltTextScanOptions = {},
): Promise<AltTextScanResult> {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const pageUrl = page.url();
  const scannedAt = new Date().toISOString();

  const images = await extractImagesFromPage(page, maxImages);
  const mismatches: AltTextMismatch[] = [];

  for (const img of images) {
    const { extractedText, confidenceScore } = await analyzeImageWithVision(img.src);

    if (!extractedText) continue;

    const similarity = computeSimilarity(img.alt, extractedText);
    if (similarity >= threshold) continue;

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
