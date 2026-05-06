/**
 * 브라우저 세션 단일 헬퍼 (Phase 3-2 추출).
 *
 * 기존 `AuditExecutor.runAudit` / `runStandaloneAltTextScan` / `runCrawlAltTextAudit`
 * 3곳에서 거의 동일하게 반복되던 다음 패턴을 한 함수로 통합한다:
 *   1) `getBrowserLaunchOptions(true)` 로 launch 옵션 결정
 *   2) `chromium.launch(launchOptions)` 로 브라우저 실행
 *   3) `getStealthContextOptions()` 로 컨텍스트 옵션 (+ optional storageState/viewport)
 *   4) `STEALTH_INIT_SCRIPT` 를 init script 로 추가
 *
 * 호출자는 반환된 `BrowserSession.close()` 1회 호출만으로 컨텍스트/브라우저를
 * 모두 정리할 수 있다. (실패 흐름에서도 close 가 안전하게 동작하도록 try-catch 포함)
 */
import {
  chromium,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
} from 'playwright-core';
import {
  getBrowserLaunchOptions,
  getStealthContextOptions,
  STEALTH_INIT_SCRIPT,
} from './browser-utils';
import * as fs from 'fs';

export interface OpenBrowserSessionOptions {
  /** Whether to run in headless mode. Default: true. */
  isHeadless?: boolean;
  /**
   * Path to a Playwright `storageState` JSON file (e.g. `auth_state.json`).
   * If provided and the file exists, the context is created with that state
   * pre-loaded so authenticated sessions are restored.
   */
  storageStatePath?: string;
  /**
   * Override viewport. If undefined, the default `getStealthContextOptions()`
   * value (1920×1080) is used.
   */
  viewport?: { width: number; height: number };
}

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  /** Closes the context, then the browser. Safe to call multiple times. */
  close: () => Promise<void>;
}

/**
 * 브라우저+컨텍스트를 함께 열고 stealth init script 까지 적용한 세션을 반환.
 *
 * @example
 *   const session = await openBrowserSession({ isHeadless: true });
 *   try {
 *     const page = await session.context.newPage();
 *     // ...
 *   } finally {
 *     await session.close();
 *   }
 */
export async function openBrowserSession(
  opts: OpenBrowserSessionOptions = {},
): Promise<BrowserSession> {
  const isHeadless = opts.isHeadless ?? true;
  const launchOptions = await getBrowserLaunchOptions(isHeadless);
  const browser = await chromium.launch(launchOptions);

  const contextOptions: BrowserContextOptions = {
    ...getStealthContextOptions(),
  };
  if (opts.viewport) {
    contextOptions.viewport = opts.viewport;
  }
  if (opts.storageStatePath && fs.existsSync(opts.storageStatePath)) {
    contextOptions.storageState = opts.storageStatePath;
  }

  let context: BrowserContext;
  try {
    context = await browser.newContext(contextOptions);
    await context.addInitScript(STEALTH_INIT_SCRIPT);
  } catch (e) {
    // 컨텍스트 생성 실패 시 브라우저는 정리하고 에러 전파
    try { await browser.close(); } catch { /* ignore */ }
    throw e;
  }

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try { await context.close(); } catch { /* ignore */ }
    try { await browser.close(); } catch { /* ignore */ }
  };

  return { browser, context, close };
}
