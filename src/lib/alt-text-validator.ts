import { Page } from 'playwright-core';
import path from 'path';
import { createRequire } from 'node:module';
import { createWorker, PSM, Worker } from 'tesseract.js';
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

  async recognize(
    imageInput: Buffer | string,
    psmMode?: PSM,
  ): Promise<{ text: string; confidence: number }> {
    await this.init();
    const pooled = await this.acquire();
    try {
      if (psmMode) {
        await pooled.worker.setParameters({ tessedit_pageseg_mode: psmMode });
      }
      const { data } = await pooled.worker.recognize(imageInput);
      // PSM을 변경했으면 기본값(AUTO)으로 복원
      if (psmMode) {
        await pooled.worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      }
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

  // 적응형 이진화: 이미지 밝기에 따라 threshold 동적 조정
  const stats = await sharp(input).stats();
  const meanBrightness = stats.channels[0]?.mean ?? 128;

  let thresholdValue: number;
  if (meanBrightness > 200) thresholdValue = 220; // 매우 밝은 이미지
  else if (meanBrightness > 150) thresholdValue = 180; // 일반
  else if (meanBrightness > 100) thresholdValue = 140; // 약간 어두운
  else thresholdValue = 100; // 어두운 이미지

  return sharp(input)
    .resize({ width: Math.min(targetWidth, 3000), withoutEnlargement: false })
    .grayscale()
    .normalize()
    .sharpen()
    .threshold(thresholdValue)
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
    let psmMode: PSM | undefined;

    if (enablePreprocessing) {
      const raw = await fetchImageBuffer(imageUrl);
      // PSM 튜닝: 이미지 크기/비율에 따라 세그멘테이션 모드 선택
      try {
        const meta = await sharp(raw).metadata();
        const width = meta.width ?? 0;
        const height = meta.height ?? 1;
        const aspectRatio = width / height;
        if (aspectRatio > 5) psmMode = PSM.SINGLE_LINE; // 한 줄 텍스트 (배너, 버튼)
        else if (aspectRatio > 2) psmMode = PSM.SINGLE_BLOCK; // 균일한 텍스트 블록
        // else psmMode stays undefined → 기본값(AUTO) 사용
      } catch {
        // metadata 실패 시 기본 PSM 사용
      }
      recognitionInput = await preprocessImage(raw);
    } else {
      recognitionInput = imageUrl;
    }

    const { text, confidence } = await pool.recognize(recognitionInput, psmMode);
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
// Step 4-1: 한국어 텍스트 정규화 (조사/어미 제거)
// ---------------------------------------------------------------------------

/**
 * 한국어 조사/어미를 토큰 단위로 제거하는 경량 정규화 함수.
 * 토큰 끝(단어 경계)에 붙은 조사만 제거하여 "결과"의 "과" 등이 오탈되는 것을 방지한다.
 * 최소 2글자 이상인 토큰에서만 조사를 제거한다 (단일 글자 토큰 보호).
 */
export function normalizeKorean(text: string): string {
  // 2글자 이상 조사 (긴 것부터 먼저 매칭해야 "에서"가 "에"보다 우선)
  const LONG_PARTICLES =
    /(?<=[\uAC00-\uD7A3]{2,})(에서|에게|한테|께서|으로|로서|로써|부터|까지|밖에|같이|처럼|만큼|보다|대로|든지|라도|마저|조차)$/;
  // 1글자 조사 — 흔한 단어 끝("과학"의 "과", "만족"의 "만" 등)과 충돌하므로
  // 토큰이 3글자 이상일 때만 제거
  const SHORT_PARTICLES = /(?<=[\uAC00-\uD7A3]{2,})(은|는|이|가|을|를|의|에|와|과|도|만|뿐)$/;
  // 동사 어미 (토큰 끝)
  const VERB_ENDINGS =
    /(합니다|합니까|하세요|하십시오|합시다|하겠습니다|했습니다|됩니다|입니다|입니까|습니다|습니까|세요|시오|겠다|한다|해서|하여|하고|하는|되는|된다|하다)$/;

  return text
    .split(/\s+/)
    .map((token) => {
      if (!token) return token;
      let t = token;
      // 긴 조사부터 시도
      t = t.replace(LONG_PARTICLES, '');
      // 짧은 조사는 결과 토큰이 2글자 이상 남을 때만
      const shortMatch = t.match(SHORT_PARTICLES);
      if (shortMatch && t.length - shortMatch[1].length >= 2) {
        t = t.replace(SHORT_PARTICLES, '');
      }
      // 동사 어미
      t = t.replace(VERB_ENDINGS, '');
      return t;
    })
    .join(' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Step 4-2: 동의어 사전 (웹 UI 흔한 용어)
// ---------------------------------------------------------------------------

const SYNONYM_MAP: Record<string, string[]> = {
  '회사소개': ['기업소개', '기업안내', '회사안내', 'about', 'aboutus'],
  '문의': ['연락처', '연락', 'contact', '상담'],
  '로그인': ['login', 'signin', '로그 인'],
  '회원가입': ['가입', 'signup', 'register', '회원 가입'],
  '공지사항': ['공지', 'notice', '알림'],
  '자주묻는질문': ['faq', 'FAQ', '자주 묻는 질문'],
  '검색': ['search', '찾기'],
  '홈': ['home', '메인', '첫페이지'],
  '메뉴': ['menu', '네비게이션', 'nav'],
  '장바구니': ['cart', '카트', '쇼핑카트'],
  '주문': ['order', '주문하기'],
  '결제': ['payment', '결제하기', '구매'],
  '배송': ['delivery', '배달'],
  '이전': ['prev', 'previous', '뒤로'],
  '다음': ['next', '앞으로'],
  '닫기': ['close', '닫기버튼'],
  '열기': ['open', '펼치기'],
  '다운로드': ['download', '내려받기'],
  '업로드': ['upload', '올리기'],
};

/** 역방향 룩업 테이블 (초기화 1회) */
const synonymLookup: Map<string, string> = new Map();
(function buildSynonymLookup() {
  for (const [canonical, aliases] of Object.entries(SYNONYM_MAP)) {
    const lowerCanonical = canonical.toLowerCase().replace(/\s+/g, '');
    synonymLookup.set(lowerCanonical, lowerCanonical);
    for (const alias of aliases) {
      synonymLookup.set(alias.toLowerCase().replace(/\s+/g, ''), lowerCanonical);
    }
  }
})();

function normalizeSynonyms(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  return tokens
    .map((token) => {
      const key = token.toLowerCase().replace(/\s+/g, '');
      return synonymLookup.get(key) ?? token;
    })
    .join(' ');
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

/**
 * 문자 n-gram 기반 Jaccard 유사도.
 * 한국어 조사("이미지를" vs "이미지")처럼 토큰 경계가 달라도
 * 바이그램 단위로 겹치므로 높은 유사도를 반환한다.
 */
function charNgramSimilarity(a: string, b: string, n = 2): number {
  const stripped = (s: string) => s.replace(/\s+/g, '');
  const sa = stripped(a);
  const sb = stripped(b);
  if (sa.length < n || sb.length < n) return 0;

  const ngrams = (s: string): Set<string> => {
    const set = new Set<string>();
    for (let i = 0; i <= s.length - n; i++) set.add(s.slice(i, i + n));
    return set;
  };

  const setA = ngrams(sa);
  const setB = ngrams(sb);
  const intersection = [...setA].filter((g) => setB.has(g)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Levenshtein 편집 거리 기반 유사도 (0~1).
 * 성능 보호: 텍스트가 500자 이상이면 잘라서 비교.
 */
function levenshteinSimilarity(a: string, b: string): number {
  const MAX_LEN = 500;
  const sa = a.length > MAX_LEN ? a.slice(0, MAX_LEN) : a;
  const sb = b.length > MAX_LEN ? b.slice(0, MAX_LEN) : b;

  if (sa.length === 0 || sb.length === 0) return 0;
  if (sa === sb) return 1;

  const m = sa.length;
  const n = sb.length;
  // 1-row DP
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = sa[i - 1] === sb[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return 1 - prev[n] / Math.max(m, n);
}

/**
 * 유사도 계산 — Jaccard + Containment + Char-ngram + Levenshtein.
 * imageType에 따라 가중 평균 또는 max()를 선택한다.
 */
export function computeSimilarity(
  altText: string,
  ocrText: string,
  imageType?: ImageType,
): number {
  // 한국어 정규화 + 동의어 치환 적용
  const korNormAlt = normalizeSynonyms(normalizeKorean(altText));
  const korNormOcr = normalizeSynonyms(normalizeKorean(ocrText));

  const na = normalizeForCompare(korNormAlt);
  const nb = normalizeForCompare(korNormOcr);

  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const jaccard = jaccardSimilarity(na, nb);
  const containment = substringContainmentRatio(na, nb);
  const ngram = charNgramSimilarity(na, nb);
  const levenshtein = levenshteinSimilarity(na, nb);

  // 어떤 단일 메트릭이 0.9 이상이면 확실한 매칭으로 판정
  const maxScore = Math.max(jaccard, containment, ngram, levenshtein);
  if (maxScore >= 0.9) return maxScore;

  // 이미지 타입별 가중 평균
  if (imageType === 'text-heavy') {
    return containment * 0.35 + levenshtein * 0.3 + jaccard * 0.2 + ngram * 0.15;
  }
  if (imageType === 'mixed') {
    return ngram * 0.3 + levenshtein * 0.3 + containment * 0.25 + jaccard * 0.15;
  }

  // photo이거나 타입 미확정 → max() 유지
  return maxScore;
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
// Step 7: 동적 임계값 + 최종 판정
// ---------------------------------------------------------------------------

/**
 * 이미지 타입과 OCR 텍스트 길이, 신뢰도에 따라 임계값을 동적으로 결정한다.
 * - text-heavy: 기본 0.5 (텍스트 이미지는 OCR이 비교적 정확)
 * - mixed: 기본 0.4 (OCR 품질이 들쭉날쭉)
 * - photo: 기본 0.6 (판정 자체를 스킵하므로 실사용 빈도 낮음)
 * - 짧은 텍스트(1-2단어)는 정확해야 하므로 +0.15, 긴 텍스트(6+)는 부분 매칭 허용 -0.1
 * - OCR confidence가 매우 낮으면(0.5 미만) 임계값 완화
 */
export function getDynamicThreshold(
  imageType: ImageType,
  ocrText: string,
  confidence: number,
): number {
  const wordCount = ocrText
    .split(/\s+/)
    .filter((w) => w.length > 0).length;

  // OCR confidence가 낮으면 임계값 완화
  if (confidence < 0.5) return 0.3;

  // 이미지 타입별 기본 임계값
  let base = imageType === 'text-heavy' ? 0.5 : imageType === 'mixed' ? 0.4 : 0.6;

  // 텍스트 길이 보정: 짧으면 엄격, 길면 관대
  if (wordCount <= 2) base += 0.15; // 1-2단어: 정확해야 함
  else if (wordCount >= 6) base -= 0.1; // 6+단어: 부분 매칭 허용

  return Math.max(0.2, Math.min(0.8, base));
}

export interface JudgeParams {
  altAttr: string | null;
  imageType: ImageType;
  similarity: number;
  ocrText: string;
  threshold: number;
  /** OCR confidence (0~1). 제공되면 동적 임계값으로 대체됨 */
  confidence?: number;
}

export function judgeAltText(params: JudgeParams): { judgment: AltTextJudgment; reason: string } {
  const { altAttr, imageType, similarity, ocrText, confidence } = params;
  // confidence가 제공되면 동적 임계값 사용, 아니면 레거시 threshold 사용
  const threshold =
    confidence !== undefined
      ? getDynamicThreshold(imageType, ocrText, confidence)
      : params.threshold;

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
    const similarity = computeSimilarity(img.alt ?? '', vision.extractedText, imageType);
    const { judgment, reason } = judgeAltText({
      altAttr: img.alt,
      imageType,
      similarity,
      ocrText: vision.extractedText,
      threshold,
      confidence: vision.confidenceScore,
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

  // Claude Vision 재검증 (옵션 활성 시)
  if (options.useClaudeVision && process.env.ANTHROPIC_API_KEY) {
    const { revalidateWithClaude } = await import('./claude-vision-analyzer');
    const revalidated = await revalidateWithClaude(items, (current, total) => {
      options.onProgress?.(current, total, `[AI 정밀 분석] ${current}/${total}`);
    });
    // items 교체 및 countsByJudgment 재계산
    items.length = 0;
    items.push(...revalidated);
    countsByJudgment.pass = 0;
    countsByJudgment.missing_alt = 0;
    countsByJudgment.decorative_mismatch = 0;
    countsByJudgment.text_mismatch = 0;
    countsByJudgment.review_needed = 0;
    for (const item of items) {
      countsByJudgment[item.judgment]++;
    }
  }

  const mismatchCount = items.filter((it) => it.judgment !== 'pass').length;

  return {
    pageUrl,
    scannedAt,
    totalImagesScanned: items.length,
    mismatchCount,
    countsByJudgment,
    items,
    siteInfo: options.spaReadyResult
      ? {
          framework: options.spaReadyResult.framework,
          renderStrategy: options.spaReadyResult.renderStrategy,
          hydrationMs: options.spaReadyResult.hydrationMs,
          spaReadyStatus: options.spaReadyResult.status,
          notes: options.spaReadyResult.notes,
        }
      : undefined,
  };
}
