/**
 * Claude Vision API를 이용한 이미지 alt 텍스트 재검증 모듈.
 *
 * Tesseract OCR 결과 중 review_needed / text_mismatch 항목만 골라
 * Claude Vision으로 재검증하여 판정을 업데이트한다.
 */
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import type { AltTextMismatch, ClaudeVisionAnalysis } from '@/types/alt-text';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

interface ClaudeVisionResult {
  suggestedAlt: string;
  isAdequate: boolean;
  reason: string;
}

// ---------------------------------------------------------------------------
// Semaphore — 동시 요청 제한
// ---------------------------------------------------------------------------

class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// 프롬프트 빌더
// ---------------------------------------------------------------------------

function buildPrompt(currentAlt: string | null, ocrText: string): string {
  const altDisplay = currentAlt === null ? '(속성 없음)' : `"${currentAlt}"`;
  return `이 웹페이지 이미지의 alt 속성을 검증해주세요.

현재 alt 속성: ${altDisplay}
OCR로 추출된 텍스트: "${ocrText}"

다음 JSON 형식으로만 응답하세요:
{
  "suggestedAlt": "이 이미지에 적합한 대체 텍스트",
  "isAdequate": true/false,
  "reason": "판정 이유 (한국어, 1-2문장)"
}

판정 기준:
- alt가 이미지 내용을 적절히 설명하면 isAdequate: true
- alt가 빈 문자열이고 장식 이미지가 아니면 isAdequate: false
- alt가 이미지 내용과 무관하면 isAdequate: false`;
}

// ---------------------------------------------------------------------------
// 이미지 URL → Claude content block 변환
// ---------------------------------------------------------------------------

type ImageContentBlock = Anthropic.ImageBlockParam;

/** 바이너리 magic bytes로 실제 이미지 형식 판별 */
function detectMediaType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
  return 'image/jpeg'; // fallback
}

/** SVG 이미지인지 판별 (URL 확장자 또는 Content-Type) */
function isSvgImage(url: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().includes('image/svg+xml')) return true;
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  return ext === 'svg';
}

/** 4.5MB 임계값 (리사이즈 판단용, Claude 제한은 5MB) */
const MAX_BASE64_BYTES = 4.5 * 1024 * 1024;
/** 최소 이미지 크기 (base64 기준 1KB 미만이면 스킵) */
const MIN_BASE64_BYTES = 1024;

/**
 * 이미지 URL → base64 Claude content block.
 * Claude API는 URL fetch 시 robots.txt를 준수하여 차단될 수 있으므로,
 * 서버에서 직접 다운로드하여 base64로 변환 후 전달한다.
 *
 * 검증:
 *  - SVG는 Claude Vision 미지원 → 에러
 *  - 1KB 미만 이미지는 깨진/너무 작은 이미지로 간주 → 에러
 *  - 5MB 초과 이미지는 sharp로 리사이즈
 *  - media_type은 magic bytes로 판별 (Content-Type/확장자 무시)
 */
async function buildImageBlock(imageUrl: string, cachedBuffer?: Buffer): Promise<ImageContentBlock> {
  // data: URL인 경우 base64 + media_type 추출
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      const dataMediaType = match[1].toLowerCase();
      if (dataMediaType === 'image/svg+xml') {
        throw new Error('SVG 이미지는 Claude Vision에서 지원하지 않습니다.');
      }
      const dataBuffer = Buffer.from(match[2], 'base64');
      if (dataBuffer.byteLength < MIN_BASE64_BYTES) {
        throw new Error(`이미지가 너무 작습니다 (${dataBuffer.byteLength} bytes). 스킵합니다.`);
      }
      const actualMediaType = detectMediaType(dataBuffer);
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: actualMediaType,
          data: match[2],
        },
      };
    }
  }

  // SVG 사전 검사 (URL 확장자)
  if (isSvgImage(imageUrl)) {
    throw new Error('SVG 이미지는 Claude Vision에서 지원하지 않습니다.');
  }

  let buf: Buffer;

  if (cachedBuffer) {
    // OCR 단계에서 캐시된 버퍼 재사용 — 대상 사이트 재다운로드 완전 스킵
    buf = cachedBuffer;
  } else {
    // 일반 URL → 서버에서 직접 다운로드 → base64 변환 (1회 재시도)
    let res: Response;
    try {
      res = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; E-able-A11y/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (firstError) {
      // 첫 시도 실패 → 2초 대기 후 재시도
      await new Promise((r) => setTimeout(r, 2000));
      res = await fetch(imageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; E-able-A11y/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        throw new Error(`이미지 다운로드 실패 (재시도 후): ${res.status} ${imageUrl}`);
      }
    }

    // Content-Type에서도 SVG 재확인
    const contentType = res.headers.get('content-type') || '';
    if (isSvgImage(imageUrl, contentType)) {
      throw new Error('SVG 이미지는 Claude Vision에서 지원하지 않습니다.');
    }

    buf = Buffer.from(await res.arrayBuffer());
  }

  // 크기 검증: 너무 작으면 스킵
  if (buf.byteLength < MIN_BASE64_BYTES) {
    throw new Error(`이미지가 너무 작습니다 (${buf.byteLength} bytes). 스킵합니다.`);
  }

  // 5MB 초과 시 sharp로 리사이즈
  if (buf.byteLength > MAX_BASE64_BYTES) {
    buf = await sharp(buf)
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  }

  const mediaType = detectMediaType(buf);
  const base64 = buf.toString('base64');

  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: mediaType,
      data: base64,
    },
  };
}

// ---------------------------------------------------------------------------
// 단일 이미지 분석
// ---------------------------------------------------------------------------

export async function analyzeImageWithClaude(
  imageUrl: string,
  currentAlt: string | null,
  ocrText: string,
  cachedBuffer?: Buffer,
): Promise<ClaudeVisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { suggestedAlt: '', isAdequate: false, reason: 'API 키가 설정되지 않았습니다.' };
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(currentAlt, ocrText);

  // 이미지 다운로드 시도 — 실패 시 텍스트 기반 판정으로 fallback
  let imageBlock: ImageContentBlock | null = null;
  try {
    imageBlock = await buildImageBlock(imageUrl, cachedBuffer);
  } catch (imgError) {
    console.warn(
      '[claude-vision-analyzer] 이미지 다운로드 실패, 텍스트 기반 판정으로 전환:',
      imgError instanceof Error ? imgError.message : imgError,
    );
  }

  const userContent: Anthropic.ContentBlockParam[] = imageBlock
    ? [imageBlock, { type: 'text', text: prompt }]
    : [{ type: 'text', text: `(이미지 로드 실패 — 텍스트 정보만으로 판정)\n\n${prompt}` }];

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  // 응답에서 텍스트 추출
  const textBlock = response.content.find((b) => b.type === 'text');
  const raw = textBlock && 'text' in textBlock ? textBlock.text : '';

  try {
    // JSON 파싱 — 코드 블록으로 감싸져 있을 수 있음
    const jsonStr = raw.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr) as ClaudeVisionResult;
    return {
      suggestedAlt: parsed.suggestedAlt ?? '',
      isAdequate: !!parsed.isAdequate,
      reason: parsed.reason ?? '',
    };
  } catch {
    // JSON 파싱 실패 시 원문을 reason으로 반환
    return {
      suggestedAlt: '',
      isAdequate: false,
      reason: `Claude 응답 파싱 실패: ${raw.slice(0, 200)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 배치 재검증
// ---------------------------------------------------------------------------

/**
 * review_needed / text_mismatch 항목만 Claude Vision으로 재검증한다.
 * 에러 시 기존 Tesseract 결과를 유지한다 (graceful fallback).
 */
export async function revalidateWithClaude(
  items: AltTextMismatch[],
  onProgress?: (current: number, total: number) => void,
  bufferCache?: Map<string, Buffer>,
): Promise<AltTextMismatch[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return items;

  // 재검증 대상 필터
  const targetIndices: number[] = [];
  for (let i = 0; i < items.length; i++) {
    const j = items[i].judgment;
    if (j === 'review_needed' || j === 'text_mismatch') {
      targetIndices.push(i);
    }
  }

  if (targetIndices.length === 0) return items;

  const semaphore = new Semaphore(MAX_CONCURRENCY);
  const result = [...items]; // 얕은 복사
  let completed = 0;

  const tasks = targetIndices.map(async (idx) => {
    await semaphore.acquire();
    try {
      const item = items[idx];
      const cachedBuf = bufferCache?.get(item.imageUrl);
      const analysis: ClaudeVisionAnalysis = await analyzeImageWithClaude(
        item.imageUrl,
        item.currentAlt,
        item.extractedText,
        cachedBuf,
      );

      // 결과 반영
      const updated: AltTextMismatch = {
        ...item,
        claudeAnalysis: analysis,
      };

      if (analysis.isAdequate) {
        updated.judgment = 'pass';
        updated.reason = `[AI 정밀 분석] ${analysis.reason}`;
      } else {
        updated.judgment = 'text_mismatch';
        updated.reason = `[AI 정밀 분석] ${analysis.reason}`;
      }

      result[idx] = updated;
    } catch (error) {
      // 에러 시 기존 결과 유지
      console.error(
        '[claude-vision-analyzer] 재검증 실패:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      semaphore.release();
      completed++;
      onProgress?.(completed, targetIndices.length);
    }
  });

  await Promise.all(tasks);

  return result;
}
