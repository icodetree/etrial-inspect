import { Page } from 'playwright-core';
import path from 'path';
import { createRequire } from 'node:module';
import { createWorker, Worker } from 'tesseract.js';
import sharp from 'sharp';

// Next.js(Turbopack) 번들러가 tesseract.js worker-script 경로를 재작성하는 문제 방지
// 런타임에 실제 설치된 node_modules 경로를 직접 해석한다.
const nodeRequire = createRequire(path.join(process.cwd(), 'package.json'));
import {
  AltTextJudgment,
  AltTextMismatch,
  AltTextScanOptions,
  AltTextScanResult,
  ImageMetadata,
  ImageType,
  VisionAnalysisResult,
} from '../types/alt-text';

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const DEFAULT_SIMILARITY_THRESHOLD = 0.6;
const DEFAULT_MAX_IMAGES = 20;
const DEFAULT_WORKER_POOL_SIZE = 2;
const DEFAULT_MIN_IMAGE_SIZE_PX = 32;
const TEXT_HEAVY_MIN_CONFIDENCE = 70;
const TEXT_HEAVY_MIN_WORDS = 3;
const MIXED_MIN_CONFIDENCE = 40;

// ---------------------------------------------------------------------------
// Worker Pool — Tesseract worker를 재사용해 init 비용 절감
// ---------------------------------------------------------------------------

interface PooledWorker {
  worker: Worker;
  busy: boolean;
}

class TesseractWorkerPool {
  private workers: PooledWorker[] = [];
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private initFailed = false;
  private initError: Error | null = null;
  private readonly poolSize: number;

  constructor(poolSize: number) {
    this.poolSize = poolSize;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initFailed) {
      throw this.initError ?? new Error('Tesseract worker pool init previously failed');
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const langPath = path.resolve(process.cwd(), 'public', 'tessdata');
      try {
        let workerPath: string | undefined;
        try {
          workerPath = nodeRequire.resolve('tesseract.js/src/worker-script/node/index.js');
        } catch {
          // 경로 해석 실패 시 tesseract.js 기본 로직에 위임
          workerPath = undefined;
        }
        for (let i = 0; i < this.poolSize; i++) {
          const worker = await createWorker(['kor', 'eng'], 1, {
            langPath,
            ...(workerPath ? { workerPath } : {}),
            gzip: false,
          });
          this.workers.push({ worker, busy: false });
        }
        this.initialized = true;
      } catch (error) {
        this.initFailed = true;
        this.initError = error instanceof Error ? error : new Error(String(error));
        await Promise.all(this.workers.map((p) => p.worker.terminate().catch(() => {})));
        this.workers = [];
        throw this.initError;
      }
    })();

    return this.initPromise;
  }

  private async acquire(): Promise<PooledWorker> {
    while (true) {
      const available = this.workers.find((w) => !w.busy);
      if (available) {
        available.busy = true;
        return available;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async recognize(imageInput: Buffer | string): Promise<{ text: string; confidence: number }> {
    await this.init();
    const pooled = await this.acquire();
    try {
      const { data } = await pooled.worker.recognize(imageInput);
      return { text: data.text, confidence: data.confidence };
    } finally {
      pooled.busy = false;
    }
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((p) => p.worker.terminate().catch(() => {})));
    this.workers = [];
    this.initialized = false;
    this.initPromise = null;
    this.initFailed = false;
    this.initError = null;
  }
}

let sharedPool: TesseractWorkerPool | null = null;

export function getSharedWorkerPool(poolSize = DEFAULT_WORKER_POOL_SIZE): TesseractWorkerPool {
  if (!sharedPool) {
    sharedPool = new TesseractWorkerPool(poolSize);
  }
  return sharedPool;
}

export async function shutdownSharedWorkerPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.terminate();
    sharedPool = null;
  }
}

// ---------------------------------------------------------------------------
// URL 캐시 (세션 단위) — 동일 이미지 중복 OCR 방지
// ---------------------------------------------------------------------------

const ocrCache = new Map<string, VisionAnalysisResult>();

export function clearOcrCache(): void {
  ocrCache.clear();
}

// ---------------------------------------------------------------------------
// Step 1: DOM 추출
// ---------------------------------------------------------------------------

export async function extractImagesFromPage(
  page: Page,
  maxImages = DEFAULT_MAX_IMAGES,
  minSizePx = DEFAULT_MIN_IMAGE_SIZE_PX,
): Promise<ImageMetadata[]> {
  const images: ImageMetadata[] = await page.evaluate(
    ({ limit, minSize }) => {
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

      const getElementId = (el: HTMLImageElement): string => {
        if (el.id) return `#${el.id}`;
        return buildXPath(el);
      };

      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('img'));

      return imgs
        .filter((img) => {
          if (!img.src) return false;
          if (!img.src.startsWith('data:image/') && !/^https?:\/\//.test(img.src)) return false;
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (w > 0 && w < minSize) return false;
          if (h > 0 && h < minSize) return false;
          return true;
        })
        .slice(0, limit)
        .map((img) => ({
          elementId: getElementId(img),
          src: img.src,
          alt: img.hasAttribute('alt') ? (img.getAttribute('alt') ?? '') : null,
          naturalWidth: img.naturalWidth || img.width || 0,
          naturalHeight: img.naturalHeight || img.height || 0,
        }));
    },
    { limit: maxImages, minSize: minSizePx },
  );

  return images;
}

// ---------------------------------------------------------------------------
// Step 2: 이미지 전처리 (sharp) — OCR 정확도 향상
// ---------------------------------------------------------------------------

async function fetchImageBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('data:image/')) {
    const base64 = imageUrl.split(',')[1] ?? '';
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new Error(`Failed to fetch image: ${res.status} ${imageUrl}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function preprocessImage(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const targetWidth = Math.max((meta.width ?? 0) * 2, 800);

  return sharp(input)
    .resize({ width: Math.min(targetWidth, 3000), withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(160)
    .png()
    .toBuffer();
}

// ---------------------------------------------------------------------------
// Step 3: Vision 분석 (Tesseract.js 워커 풀 사용)
// ---------------------------------------------------------------------------

export async function analyzeImageWithVision(
  imageUrl: string,
  options: { enablePreprocessing?: boolean; pool?: TesseractWorkerPool } = {},
): Promise<VisionAnalysisResult> {
  const cached = ocrCache.get(imageUrl);
  if (cached) return cached;

  const enablePreprocessing = options.enablePreprocessing ?? true;
  const pool = options.pool ?? getSharedWorkerPool();

  try {
    let recognitionInput: Buffer | string;
    if (enablePreprocessing) {
      const raw = await fetchImageBuffer(imageUrl);
      recognitionInput = await preprocessImage(raw);
    } else {
      recognitionInput = imageUrl;
    }

    const { text, confidence } = await pool.recognize(recognitionInput);
    const cleaned = sanitizeExtractedText(text);
    const wordCount = cleaned ? cleaned.split(/\s+/).filter(Boolean).length : 0;

    const result: VisionAnalysisResult = {
      extractedText: cleaned,
      confidenceScore: Number.isFinite(confidence) ? confidence / 100 : 0,
      wordCount,
    };
    ocrCache.set(imageUrl, result);
    return result;
  } catch (error) {
    console.error('[alt-text-validator] OCR error:', error instanceof Error ? error.message : error);
    const failed: VisionAnalysisResult = { extractedText: '', confidenceScore: 0, wordCount: 0 };
    return failed;
  }
}

// ---------------------------------------------------------------------------
// Step 4: 텍스트 정제
// ---------------------------------------------------------------------------

export function sanitizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n|\r|\n/g, ' ')
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣.,!?()%$@#-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Step 5: 유사도 계산 — Jaccard + 부분 문자열 포함률 조합
// ---------------------------------------------------------------------------

function normalizeForCompare(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/gu, '')
    .trim();
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

function substringContainmentRatio(alt: string, ocr: string): number {
  if (!alt || !ocr) return 0;
  const ocrTokens = ocr.split(/\s+/).filter((t) => t.length >= 2);
  if (ocrTokens.length === 0) return 0;
  const containedCount = ocrTokens.filter((t) => alt.includes(t)).length;
  return containedCount / ocrTokens.length;
}

export function computeSimilarity(altText: string, ocrText: string): number {
  const na = normalizeForCompare(altText);
  const nb = normalizeForCompare(ocrText);

  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const jaccard = jaccardSimilarity(na, nb);
  const containment = substringContainmentRatio(na, nb);

  return Math.max(jaccard, containment);
}

// ---------------------------------------------------------------------------
// Step 6: 이미지 유형 분류
// ---------------------------------------------------------------------------

export function classifyImageType(vision: VisionAnalysisResult): ImageType {
  const confidencePct = vision.confidenceScore * 100;

  if (vision.wordCount === 0 || confidencePct < MIXED_MIN_CONFIDENCE) {
    return 'photo';
  }
  if (confidencePct >= TEXT_HEAVY_MIN_CONFIDENCE && vision.wordCount >= TEXT_HEAVY_MIN_WORDS) {
    return 'text-heavy';
  }
  return 'mixed';
}

// ---------------------------------------------------------------------------
// Step 7: 최종 판정
// ---------------------------------------------------------------------------

export interface JudgeParams {
  altAttr: string | null;
  imageType: ImageType;
  similarity: number;
  ocrText: string;
  threshold: number;
}

export function judgeAltText(params: JudgeParams): { judgment: AltTextJudgment; reason: string } {
  const { altAttr, imageType, similarity, ocrText, threshold } = params;

  if (altAttr === null) {
    return {
      judgment: 'missing_alt',
      reason: 'alt 속성이 없어 스크린리더가 이미지를 설명할 수 없습니다.',
    };
  }

  if (altAttr === '') {
    if (imageType === 'text-heavy' || imageType === 'mixed') {
      return {
        judgment: 'decorative_mismatch',
        reason: `장식 이미지(alt="")로 처리되어 있으나 실제로는 텍스트가 포함되어 있습니다: "${ocrText.slice(0, 60)}"`,
      };
    }
    return {
      judgment: 'pass',
      reason: '장식 이미지로 판단되며 OCR로도 의미 있는 텍스트가 추출되지 않았습니다.',
    };
  }

  if (imageType === 'photo') {
    return {
      judgment: 'review_needed',
      reason: '사진/도표형 이미지로 OCR만으로는 적절성을 판별할 수 없어 수동 검토가 필요합니다.',
    };
  }

  if (similarity >= threshold) {
    return {
      judgment: 'pass',
      reason: `alt 텍스트가 이미지 내 텍스트와 충분히 일치합니다 (유사도 ${(similarity * 100).toFixed(0)}%).`,
    };
  }

  return {
    judgment: 'text_mismatch',
    reason: `alt 텍스트가 이미지 내 텍스트와 불일치합니다 (유사도 ${(similarity * 100).toFixed(0)}%). OCR: "${ocrText.slice(0, 60)}"`,
  };
}

// ---------------------------------------------------------------------------
// Step 8: 메인 파이프라인
// ---------------------------------------------------------------------------

export async function scanPageForAltMismatches(
  page: Page,
  options: AltTextScanOptions = {},
): Promise<AltTextScanResult> {
  const threshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const maxImages = options.maxImages ?? DEFAULT_MAX_IMAGES;
  const minSizePx = options.minImageSizePx ?? DEFAULT_MIN_IMAGE_SIZE_PX;
  const enablePreprocessing = options.enablePreprocessing ?? true;
  const poolSize = options.workerPoolSize ?? DEFAULT_WORKER_POOL_SIZE;
  const pool = getSharedWorkerPool(poolSize);

  const pageUrl = page.url();
  const scannedAt = new Date().toISOString();
  const images = await extractImagesFromPage(page, maxImages, minSizePx);

  const items: AltTextMismatch[] = [];
  const countsByJudgment: Record<AltTextJudgment, number> = {
    pass: 0,
    missing_alt: 0,
    decorative_mismatch: 0,
    text_mismatch: 0,
    review_needed: 0,
  };

  for (let i = 0; i < images.length; i++) {
    if (options.abortSignal?.aborted) break;

    const img = images[i];
    options.onProgress?.(i + 1, images.length, img.src);

    const vision = await analyzeImageWithVision(img.src, { enablePreprocessing, pool });
    const imageType = classifyImageType(vision);
    const similarity = computeSimilarity(img.alt ?? '', vision.extractedText);
    const { judgment, reason } = judgeAltText({
      altAttr: img.alt,
      imageType,
      similarity,
      ocrText: vision.extractedText,
      threshold,
    });

    countsByJudgment[judgment]++;

    items.push({
      elementId: img.elementId,
      imageUrl: img.src,
      currentAlt: img.alt,
      extractedText: vision.extractedText,
      confidenceScore: vision.confidenceScore,
      imageType,
      similarity,
      judgment,
      reason,
    });
  }

  const mismatchCount = items.filter((it) => it.judgment !== 'pass').length;

  return {
    pageUrl,
    scannedAt,
    totalImagesScanned: items.length,
    mismatchCount,
    countsByJudgment,
    items,
  };
}
