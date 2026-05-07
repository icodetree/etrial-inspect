/**
 * Claude Vision API를 이용한 이미지 alt 텍스트 재검증 모듈.
 *
 * Tesseract OCR 결과 중 review_needed / text_mismatch 항목만 골라
 * Claude Vision으로 재검증하여 판정을 업데이트한다.
 */
import Anthropic from '@anthropic-ai/sdk';
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

/** 확장자/Content-Type → Claude 허용 media_type 매핑 */
function inferMediaType(url: string, contentType?: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return 'image/png';
  if (ct.includes('gif')) return 'image/gif';
  if (ct.includes('webp')) return 'image/webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'image/jpeg';
  // Content-Type 없으면 URL 확장자로 추론
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg'; // 기본값
}

/**
 * 이미지 URL → base64 Claude content block.
 * Claude API는 URL fetch 시 robots.txt를 준수하여 차단될 수 있으므로,
 * 서버에서 직접 다운로드하여 base64로 변환 후 전달한다.
 */
async function buildImageBlock(imageUrl: string): Promise<ImageContentBlock> {
  // data: URL인 경우 base64 + media_type 추출
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: match[2],
        },
      };
    }
  }

  // 일반 URL → 서버에서 직접 다운로드 → base64 변환
  const res = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; E-able-A11y/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`이미지 다운로드 실패: ${res.status} ${imageUrl}`);
  }
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const mediaType = inferMediaType(imageUrl, res.headers.get('content-type') || undefined);

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
): Promise<ClaudeVisionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { suggestedAlt: '', isAdequate: false, reason: 'API 키가 설정되지 않았습니다.' };
  }

  const client = new Anthropic({ apiKey });
  const prompt = buildPrompt(currentAlt, ocrText);
  const imageBlock = await buildImageBlock(imageUrl);

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: 'user',
        content: [
          imageBlock,
          { type: 'text', text: prompt },
        ],
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
      const analysis: ClaudeVisionAnalysis = await analyzeImageWithClaude(
        item.imageUrl,
        item.currentAlt,
        item.extractedText,
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
