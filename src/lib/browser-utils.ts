import { LaunchOptions, BrowserContextOptions } from 'playwright-core';

/**
 * Returns platform-specific Playwright launch options.
 * In production/distribution environments, it prioritizes using the system-installed 
 * Google Chrome or Microsoft Edge to avoid requiring Playwright browser binaries.
 * 
 * @param isHeadless Whether to run in headless mode.
 * @returns Playwright LaunchOptions
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getBrowserLaunchOptions = async (isHeadless: boolean = true): Promise<LaunchOptions> => {
  const isVercel = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  console.log(`[Browser Launch] Environment Check: isVercel=${isVercel}, NODE_ENV=${process.env.NODE_ENV}`);

  if (isVercel) {
    try {
      console.log('[Browser Launch] Attempting to load @sparticuz/chromium...');
      const chromium = await import('@sparticuz/chromium');

      // Optional: Disable WebGL to reduce binary size requirement
      chromium.default.setGraphicsMode = false;

      // Ensure proper headless mode is set before asking for path
      // Note: Some versions require this setup to resolve the correct binary path

      const executablePath = await chromium.default.executablePath();
      console.log(`[Browser Launch] Executable Path: ${executablePath}`);

      return {
        args: chromium.default.args,
        executablePath: executablePath,
        headless: true,
      };
    } catch (e) {
      console.error('[Browser Launch] Failed to load @sparticuz/chromium:', e);
      throw e;
    }
  }

  // Anti-bot args — 일반 Chrome처럼 보이도록 플래그 설정
  const stealthArgs = [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  // Local Development or GitHub Actions (CI)
  // Try to resolve the executable path from the 'playwright' package if available.
  // This ensures we use the binary installed by `npx playwright install`, which is reliable in CI.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright');
    console.log('[Browser Launch] Using Playwright Browser (CI/Local)');
    return {
      executablePath: chromium.executablePath(),
      headless: isHeadless,
      args: stealthArgs,
    };
  } catch (e) {
    // Fallback: Try system Chrome (e.g. if 'playwright' package is not found or fails)
    console.warn('[Browser Launch] Playwright package not found, falling back to System Chrome path');
    return {
      channel: 'chrome',
      headless: isHeadless,
      args: stealthArgs,
    };
  }
};

/**
 * WAF/봇 차단을 우회하기 위한 브라우저 컨텍스트 옵션.
 * 실제 Chrome 브라우저처럼 보이도록 User-Agent, 언어, 플래그를 설정한다.
 * 기존 사이트에는 영향 없음 — 더 "사람 같은" 브라우저 프로파일일 뿐.
 */
export const getStealthContextOptions = (): BrowserContextOptions => ({
  viewport: { width: 1920, height: 1080 },
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  locale: 'ko-KR',
  timezoneId: 'Asia/Seoul',
  extraHTTPHeaders: {
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  },
});

/**
 * Playwright 페이지에서 navigator.webdriver 플래그를 제거하는 init script.
 * WAF가 headless 브라우저를 탐지하는 가장 흔한 방법을 우회한다.
 */
export const STEALTH_INIT_SCRIPT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  window.chrome = { runtime: {} };
`;

/**
 * Returns a user-friendly error message for browser launch failures.
 */
export const getBrowserErrorGuide = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Executable doesn\'t exist') || message.includes('browserType.launch:')) {
    return 'Google Chrome 브라우저가 설치되어 있지 않거나 경로를 찾을 수 없습니다. Chrome 브라우저를 설치하거나 최신 버전으로 업데이트해 주세요.';
  }
  return message;
};
