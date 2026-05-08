/**
 * Notion API 호출에 대한 exponential backoff 재시도 유틸리티.
 *
 * Notion API 의 rate limit (429) 및 일시적 서버 오류 (500, 502, 503) 에 대해
 * 최대 3회 재시도한다 (1s → 2s → 4s).
 *
 * @see https://developers.notion.com/reference/errors#rate-limits
 */

/** 재시도 대상 HTTP 상태 코드 */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503]);

/** 최대 재시도 횟수 */
const MAX_RETRIES = 3;

/** 초기 대기 시간 (ms) */
const BASE_DELAY_MS = 1_000;

function isRetryableError(error: unknown): boolean {
  if (error && typeof error === 'object') {
    // @notionhq/client 의 APIResponseError 는 status 속성을 갖는다
    const status = (error as { status?: number }).status;
    if (typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status)) {
      return true;
    }
    // 네트워크 오류 (ECONNRESET, ETIMEDOUT 등)
    const code = (error as { code?: string }).code;
    if (typeof code === 'string' && /^(ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN)$/.test(code)) {
      return true;
    }
  }
  return false;
}

/**
 * Notion API 호출을 exponential backoff 로 재시도한다.
 *
 * @param fn - 실행할 비동기 함수
 * @param label - 로깅용 레이블 (예: 'pages.create')
 * @returns fn 의 반환값
 */
export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === MAX_RETRIES || !isRetryableError(error)) {
        throw error;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt); // 1s, 2s, 4s
      const status = (error as { status?: number }).status ?? 'network';
      console.warn(
        `[Notion Retry] ${label} 실패 (status=${status}), ` +
        `${delay / 1000}s 후 재시도 (${attempt + 1}/${MAX_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // 도달할 수 없지만 TypeScript 를 위해
  throw lastError;
}
