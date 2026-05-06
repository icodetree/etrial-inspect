/**
 * History API hook — SPA 라우트 변경 가로채기.
 *
 * Phase 3-1: 기존 `WebCrawler.init()` / `WebCrawler.loadStorageState()` 의 본문에
 * 두 번 중복으로 들어 있던 history wrap 로직을 단일 모듈로 추출.
 *
 * 등록 후 페이지 컨텍스트에서 `history.pushState`, `history.replaceState`,
 * `popstate`, `hashchange` 가 발생하면 절대 URL 이 binding 콜백으로 전달된다.
 * 정적 사이트에서도 부작용 0 — pushState 가 호출되지 않을 뿐.
 *
 * 이 모듈은 `BrowserContext` 만 의존한다. 어떤 sink 로 전달할지는 호출처가
 * `getSink` 콜백을 통해 동적으로 제공한다 (crawl 실행 중에만 sink 를 채워두는 패턴).
 */

import type { BrowserContext } from 'playwright-core';
import type { RouteCaptureSink } from './types';

/** 페이지 컨텍스트(window) 에 주입되는 init script. */
const HISTORY_HOOK_INIT_SCRIPT = `(() => {
  try {
    const w = /** @type {any} */ (window);
    const send = (rawUrl) => {
      try {
        if (!rawUrl) return;
        const abs =
          typeof rawUrl === 'string'
            ? new URL(rawUrl, window.location.href).href
            : rawUrl.href;
        if (typeof w.__captureRoute === 'function') {
          w.__captureRoute(abs);
        }
      } catch (_) { /* noop */ }
    };

    const origPush = w.history.pushState.bind(w.history);
    const origReplace = w.history.replaceState.bind(w.history);

    w.history.pushState = function (data, unused, url) {
      const ret = origPush(data, unused, url);
      send(url == null ? window.location.href : url);
      return ret;
    };
    w.history.replaceState = function (data, unused, url) {
      const ret = origReplace(data, unused, url);
      send(url == null ? window.location.href : url);
      return ret;
    };
    window.addEventListener('popstate', () => send(window.location.href));
    window.addEventListener('hashchange', () => send(window.location.href));
  } catch (_) { /* noop — 일부 사이트에서 history wrap 이 막혀있을 수 있음 */ }
})();`;

export interface InstallHistoryHookOptions {
  /**
   * crawl 실행 시점에 채워지는 sink 의 동적 참조. 이벤트가 발생할 때마다 호출되며,
   * sink 가 null 이면 무시한다 (init 직후 / close 이후 안전 가드).
   */
  getSink: () => RouteCaptureSink | null;
}

/**
 * `BrowserContext` 에 `__captureRoute` binding 과 history wrap init script 를 등록한다.
 *
 * 본 함수는 best-effort 다 — 일부 사이트가 history binding 등록을 거부하더라도
 * 일반 크롤은 계속 동작해야 하므로 throw 하지 않고 console.warn 으로만 기록한다.
 *
 * @returns 성공 여부 (테스트에서 검증용)
 */
export async function installHistoryHook(
  context: BrowserContext,
  options: InstallHistoryHookOptions,
): Promise<boolean> {
  try {
    await context.exposeBinding('__captureRoute', (_source, url: string) => {
      const sink = options.getSink();
      if (sink && typeof url === 'string') {
        sink(url);
      }
    });
    await context.addInitScript(HISTORY_HOOK_INIT_SCRIPT);
    return true;
  } catch (e) {
    // binding 등록 실패는 치명적이지 않음 — 일반 크롤은 계속 작동
    console.warn('[Crawler] History API hook 등록 실패 (SPA 자동 발견 비활성):', e);
    return false;
  }
}
