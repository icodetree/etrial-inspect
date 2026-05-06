/**
 * WAF/봇 차단 페이지 감지 — Cloudflare 등 챌린지 페이지를 자동으로 식별하고
 * 일정 시간 대기 후 재확인하는 공용 유틸.
 *
 * Phase 2-2 리팩토링: 기존에 `crawler.ts`(processPage 내부)와
 * `accessibility-auditor.ts`(auditPage 내부)에 거의 동일한 page.evaluate + 5~6초 대기 +
 * waitForLoadState 재확인 로직이 중복되어 있던 것을 단일 모듈로 추출.
 *
 * 사용처:
 * - 크롤러: 페이지를 큐에 추가하기 전 차단 여부 판정 (차단 시 스킵 + 쿨다운)
 * - 접근성 감사기: axe 실행 전 차단 여부 판정 (차단 시 status='failed' 반환)
 */

/**
 * Playwright Page 의 최소 인터페이스 — 테스트에서 mock 으로 주입하기 쉽도록
 * `import('playwright-core').Page` 전체를 요구하지 않고 필요한 메서드만 추린 구조 타입.
 *
 * 주의: 함수든 문자열이든 evaluate 의 첫 인자는 그대로 전달되므로 기존 mockEvaluate 가
 * `typeof fnOrScript === 'string'` 으로 분기하던 동작이 그대로 유지된다.
 */
export interface WafPageLike {
  evaluate<T>(pageFunction: () => T | Promise<T>): Promise<T>;
  waitForTimeout(timeout: number): Promise<void>;
  waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle', options?: { timeout?: number }): Promise<void>;
}

export interface WafDetection {
  /** 차단/챌린지 페이지로 판정되었는지 */
  blocked: boolean;
  /** 차단 사유 (휴리스틱 — 'low-dom' / 'challenge-text' / 차단되지 않으면 undefined) */
  reason?: 'low-dom' | 'challenge-text';
}

export interface WafRetryOptions {
  /** 1차 차단 감지 후 대기 시간 (ms). 기본 6000 — Cloudflare JS 챌린지 자동 해결 시간 */
  retryDelayMs?: number;
  /** 재확인 시 waitForLoadState 타임아웃 (ms). 기본 5000 */
  retryTimeoutMs?: number;
  /**
   * DOM 노드 수 임계값. 이 값보다 적으면 'low-dom' 으로 차단 판정.
   * - 크롤러: 30 (정상 페이지는 보통 30 이상)
   * - 접근성 감사기: 5 (이미 SPA hydration 대기 후 호출되므로 더 엄격)
   * 기본 5.
   */
  minDomNodes?: number;
}

const CHALLENGE_TEXT_REGEX =
  /잠시만 기다리|please wait|checking your browser|just a moment|access denied|보안 위배/i;

/**
 * 페이지를 1회 검사하여 WAF/챌린지 페이지인지 판정.
 *
 * 휴리스틱:
 * 1. DOM 엘리먼트 수가 `minDomNodes` 미만이면 'low-dom' (빈 챌린지 페이지)
 * 2. body 텍스트 / title 에 챌린지 문구 매칭 시 'challenge-text'
 *
 * 페이지 evaluate 자체가 throw 하면 (예: 페이지가 닫혔거나 navigation 중) 안전하게
 * `{ blocked: false }` 로 처리 — 호출처에서 재시도 책임은 별도.
 */
export async function detectWafChallenge(
  page: WafPageLike,
  options: { minDomNodes?: number } = {},
): Promise<WafDetection> {
  const minDomNodes = options.minDomNodes ?? 5;
  const raw: unknown = await page
    .evaluate(() => {
      const text = document.body?.innerText || '';
      const title = document.title || '';
      const elementCount = document.getElementsByTagName('*').length;
      return { text, title, elementCount };
    })
    .catch(() => null);

  // 호환성: 기존 호출처들이 mock 환경에서 boolean 을 받던 케이스가 있어
  // 객체 형태가 아니면 차단 여부를 boolean 으로 해석한다 (true → blocked, false → ok).
  if (raw === null || raw === undefined) return { blocked: false };
  if (typeof raw === 'boolean') {
    return raw ? { blocked: true, reason: 'low-dom' } : { blocked: false };
  }
  if (typeof raw !== 'object') return { blocked: false };

  const result = raw as { text?: unknown; title?: unknown; elementCount?: unknown };
  const text = typeof result.text === 'string' ? result.text : '';
  const title = typeof result.title === 'string' ? result.title : '';
  const elementCount = typeof result.elementCount === 'number' ? result.elementCount : Number.MAX_SAFE_INTEGER;

  if (elementCount < minDomNodes) {
    return { blocked: true, reason: 'low-dom' };
  }
  if (CHALLENGE_TEXT_REGEX.test(text + title)) {
    return { blocked: true, reason: 'challenge-text' };
  }
  return { blocked: false };
}

/**
 * 1차 감지 → 차단 의심 시 대기(`retryDelayMs`) → DOM 재로드 대기 → 재확인.
 *
 * Cloudflare 의 5초 JS 챌린지처럼 짧은 시간 후 자동 해결되는 케이스를 흡수하기 위함.
 * 1차에서 차단이 아니면 즉시 반환 (대기 없음).
 */
export async function detectWafChallengeWithRetry(
  page: WafPageLike,
  options: WafRetryOptions = {},
): Promise<WafDetection> {
  const retryDelayMs = options.retryDelayMs ?? 6000;
  const retryTimeoutMs = options.retryTimeoutMs ?? 5000;
  const minDomNodes = options.minDomNodes ?? 5;

  const first = await detectWafChallenge(page, { minDomNodes });
  if (!first.blocked) return first;

  // 1차 차단 의심 → 자동 해결 대기 후 재확인
  await page.waitForTimeout(retryDelayMs);
  await page
    .waitForLoadState('domcontentloaded', { timeout: retryTimeoutMs })
    .catch(() => {});
  return detectWafChallenge(page, { minDomNodes });
}
