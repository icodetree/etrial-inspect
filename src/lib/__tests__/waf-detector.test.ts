/**
 * WAF/봇 차단 감지 유틸 단위 테스트
 *
 * Phase 2-2: crawler.ts / accessibility-auditor.ts 에 중복돼 있던 WAF 감지 로직을
 * 단일 모듈로 추출. Playwright Page mock 으로 시나리오를 검증한다.
 */

import {
  detectWafChallenge,
  detectWafChallengeWithRetry,
  WafPageLike,
} from '../waf-detector';

// 페이지 evaluate 가 함수를 받으므로 그 함수를 호출했을 때의 반환값을 mock 으로 흉내내려면
// "다음 evaluate 가 어떤 결과를 돌려줘야 하는가" 를 큐로 관리하는 것이 가장 깔끔하다.
function makePageMock(
  evalQueue: Array<unknown | (() => unknown)>,
): WafPageLike & {
  __evalCalls: number;
  __waitForTimeoutCalls: number;
  __waitForLoadStateCalls: number;
} {
  let evalCalls = 0;
  let waitForTimeoutCalls = 0;
  let waitForLoadStateCalls = 0;

  return {
    evaluate: jest.fn().mockImplementation(async () => {
      const next = evalQueue[evalCalls++];
      if (typeof next === 'function') {
        return (next as () => unknown)();
      }
      return next;
    }),
    waitForTimeout: jest.fn().mockImplementation(async () => {
      waitForTimeoutCalls++;
    }),
    waitForLoadState: jest.fn().mockImplementation(async () => {
      waitForLoadStateCalls++;
    }),
    get __evalCalls() {
      return evalCalls;
    },
    get __waitForTimeoutCalls() {
      return waitForTimeoutCalls;
    },
    get __waitForLoadStateCalls() {
      return waitForLoadStateCalls;
    },
  } as WafPageLike & {
    __evalCalls: number;
    __waitForTimeoutCalls: number;
    __waitForLoadStateCalls: number;
  };
}

describe('detectWafChallenge', () => {
  test('정상 페이지 (DOM 노드 충분 + 챌린지 문구 없음) → blocked=false', async () => {
    const page = makePageMock([{ text: '환영합니다', title: '홈', elementCount: 250 }]);
    const result = await detectWafChallenge(page);
    expect(result.blocked).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  test('DOM 노드 수가 minDomNodes 미만 → blocked=true, reason=low-dom', async () => {
    const page = makePageMock([{ text: '', title: '', elementCount: 3 }]);
    const result = await detectWafChallenge(page, { minDomNodes: 5 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('low-dom');
  });

  test('Cloudflare 챌린지 문구 매칭 → blocked=true, reason=challenge-text', async () => {
    const page = makePageMock([
      { text: 'Just a moment... checking your browser', title: 'Just a moment...', elementCount: 100 },
    ]);
    const result = await detectWafChallenge(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('challenge-text');
  });

  test('한국어 차단 문구 매칭 → blocked=true', async () => {
    const page = makePageMock([
      { text: '잠시만 기다리고 있어요', title: '', elementCount: 100 },
    ]);
    const result = await detectWafChallenge(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('challenge-text');
  });

  test('evaluate 가 throw 하면 blocked=false (안전한 fallback)', async () => {
    const page = makePageMock([
      () => {
        throw new Error('navigation in progress');
      },
    ]);
    const result = await detectWafChallenge(page);
    expect(result.blocked).toBe(false);
  });

  test('호환성: evaluate 가 boolean true 를 반환하면 blocked=true', async () => {
    // 기존 mockEvaluate 가 함수 인자에 false 를 반환하던 패턴 호환 — true 면 차단으로 해석.
    const page = makePageMock([true]);
    const result = await detectWafChallenge(page);
    expect(result.blocked).toBe(true);
  });

  test('호환성: evaluate 가 boolean false 를 반환하면 blocked=false', async () => {
    const page = makePageMock([false]);
    const result = await detectWafChallenge(page);
    expect(result.blocked).toBe(false);
  });

  test('minDomNodes 옵션이 호출처마다 다르게 적용된다 (auditor=5, crawler=30)', async () => {
    const page = makePageMock([{ text: '', title: '', elementCount: 20 }]);
    // auditor 의 임계값(5) 에선 통과
    expect((await detectWafChallenge(page, { minDomNodes: 5 })).blocked).toBe(false);

    const page2 = makePageMock([{ text: '', title: '', elementCount: 20 }]);
    // crawler 의 임계값(30) 에선 차단
    const r2 = await detectWafChallenge(page2, { minDomNodes: 30 });
    expect(r2.blocked).toBe(true);
    expect(r2.reason).toBe('low-dom');
  });
});

describe('detectWafChallengeWithRetry', () => {
  test('1차 정상이면 즉시 반환 (대기 없음)', async () => {
    const page = makePageMock([{ text: '', title: '', elementCount: 200 }]);
    const result = await detectWafChallengeWithRetry(page);
    expect(result.blocked).toBe(false);
    expect(page.__evalCalls).toBe(1); // 재확인 안 함
    expect(page.__waitForTimeoutCalls).toBe(0);
  });

  test('5초 후 챌린지 해제 시나리오 — 1차 차단 → 대기 → 재확인 후 정상', async () => {
    const page = makePageMock([
      { text: 'Just a moment...', title: 'Cloudflare', elementCount: 100 }, // 1차: 차단
      { text: 'Welcome', title: 'Home', elementCount: 250 }, // 2차: 정상
    ]);
    const result = await detectWafChallengeWithRetry(page, {
      retryDelayMs: 1000,
      retryTimeoutMs: 500,
    });
    expect(result.blocked).toBe(false);
    expect(page.__evalCalls).toBe(2);
    expect(page.__waitForTimeoutCalls).toBe(1);
    expect(page.__waitForLoadStateCalls).toBe(1);
  });

  test('재확인에도 차단이면 blocked=true 유지', async () => {
    const page = makePageMock([
      { text: 'access denied', title: '', elementCount: 50 },
      { text: 'access denied', title: '', elementCount: 50 },
    ]);
    const result = await detectWafChallengeWithRetry(page);
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('challenge-text');
    expect(page.__evalCalls).toBe(2);
  });

  test('DOM 노드 수 부족이 회복되지 않는 경우 blocked=true, reason=low-dom 유지', async () => {
    const page = makePageMock([
      { text: '', title: '', elementCount: 2 },
      { text: '', title: '', elementCount: 3 },
    ]);
    const result = await detectWafChallengeWithRetry(page, { minDomNodes: 5 });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe('low-dom');
  });
});
