/**
 * WebCrawler — SPA 자동 감지 / abort 거동 테스트
 *
 * Playwright 의존을 모두 모킹해 다음을 검증한다:
 *  - init() 이 항상 context.exposeBinding + addInitScript 를 호출한다 (SPA 자동 감지 인프라).
 *  - crawl() 이 항상 waitForSpaReady 를 호출하고, 첫 페이지의 framework 가
 *    'unknown' 이 아니면 discoverByMenuClick 이 실행된다 (자동 게이팅).
 *  - signal.aborted 시 graceful break.
 */

const mockExposeBinding = jest.fn().mockResolvedValue(undefined);
const mockAddInitScript = jest.fn().mockResolvedValue(undefined);
const mockContextClose = jest.fn().mockResolvedValue(undefined);
const mockContextStorageState = jest.fn().mockResolvedValue(undefined);

const mockNewPage = jest.fn();
const mockNewContext = jest.fn();

// waitForSpaReady 는 별도 모듈에서 모킹 — 케이스마다 framework 결과를 바꾼다
const mockWaitForSpaReady = jest.fn();
jest.mock('../spa-readiness', () => ({
  waitForSpaReady: (...args: unknown[]) => mockWaitForSpaReady(...args),
  // 타입만 사용되므로 더 추가할 필요 없음
}));

// 페이지 1개분 mock — start URL 만 처리하고 끝
function buildMockPage() {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    title: jest.fn().mockResolvedValue('Test Page'),
    close: jest.fn().mockResolvedValue(undefined),
    $$eval: jest.fn().mockResolvedValue([]),
    locator: jest.fn().mockReturnValue({
      isVisible: jest.fn().mockResolvedValue(false),
      click: jest.fn().mockResolvedValue(undefined),
      nth: jest.fn().mockReturnThis(),
    }),
    waitForURL: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue('https://example.com'),
    goBack: jest.fn().mockResolvedValue(undefined),
  };
}

jest.mock('playwright-core', () => ({
  chromium: {
    launch: jest.fn().mockResolvedValue({
      newContext: (...args: unknown[]) => mockNewContext(...args),
      close: jest.fn().mockResolvedValue(undefined),
    }),
  },
}));

jest.mock('../browser-utils', () => ({
  getBrowserLaunchOptions: jest.fn().mockResolvedValue({ headless: true }),
  getStealthContextOptions: jest.fn().mockReturnValue({ viewport: { width: 1920, height: 1080 } }),
  STEALTH_INIT_SCRIPT: '',
}));

import { WebCrawler } from '../crawler';

const defaultReady = {
  framework: 'unknown' as const,
  renderStrategy: 'unknown' as const,
  hydrationMs: 50,
  domNodeCount: 100,
  status: 'ready' as const,
  notes: [],
};

describe('WebCrawler — SPA 자동 감지 인프라', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNewContext.mockResolvedValue({
      newPage: mockNewPage,
      close: mockContextClose,
      storageState: mockContextStorageState,
      exposeBinding: mockExposeBinding,
      addInitScript: mockAddInitScript,
    });
    mockNewPage.mockImplementation(() => Promise.resolve(buildMockPage()));
    mockWaitForSpaReady.mockResolvedValue(defaultReady);
  });

  test('init() 은 항상 exposeBinding + addInitScript 를 호출한다 (자동 감지 인프라)', async () => {
    const crawler = new WebCrawler();
    await crawler.init();

    expect(mockExposeBinding).toHaveBeenCalledWith(
      '__captureRoute',
      expect.any(Function)
    );
    // stealth init script + history API hook = 2회
    expect(mockAddInitScript).toHaveBeenCalledTimes(2);

    await crawler.close();
  });

  test('exposeBinding 실패해도 init() 자체는 throw 하지 않는다 (best-effort)', async () => {
    mockExposeBinding.mockRejectedValueOnce(new Error('binding-failed'));
    const crawler = new WebCrawler();
    await expect(crawler.init()).resolves.toBeUndefined();
    await crawler.close();
  });
});

describe('WebCrawler — discoverByMenuClick 자동 게이팅', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNewContext.mockResolvedValue({
      newPage: mockNewPage,
      close: mockContextClose,
      storageState: mockContextStorageState,
      exposeBinding: mockExposeBinding,
      addInitScript: mockAddInitScript,
    });
    mockNewPage.mockImplementation(() => Promise.resolve(buildMockPage()));
  });

  test('첫 페이지 framework=unknown + 링크 0개 → 메뉴 클릭 폴백 실행', async () => {
    mockWaitForSpaReady.mockResolvedValue({ ...defaultReady, framework: 'unknown' });
    const page = buildMockPage();
    // collectLinks 가 빈 배열 반환 → linksFound < 3 → 메뉴 클릭 실행
    page.$$eval.mockResolvedValue([]);
    mockNewPage.mockResolvedValue(page);

    const crawler = new WebCrawler({ enableSitemap: false });
    await crawler.init();

    const result = await crawler.crawl('https://example.com');

    // collectLinks + discoverByMenuClick = 2회 $$eval 호출
    const calledSelectors = page.$$eval.mock.calls.map((c) => c[0] as string);
    expect(calledSelectors.length).toBeGreaterThanOrEqual(2);
    expect(calledSelectors[0]).toContain('a[href]');
    expect(calledSelectors.some((s) => s.includes('header a'))).toBe(true);
    expect(result.detectedFramework).toBe('unknown');

    await crawler.close();
  });

  test('첫 페이지 framework=vue 이면 discoverByMenuClick 의 메뉴 selector 가 추가 호출된다', async () => {
    mockWaitForSpaReady.mockResolvedValueOnce({
      ...defaultReady,
      framework: 'vue',
      renderStrategy: 'CSR',
    });
    const page = buildMockPage();
    mockNewPage.mockResolvedValue(page);

    const crawler = new WebCrawler({ enableSitemap: false });
    await crawler.init();

    const result = await crawler.crawl('https://example.com');

    const calledSelectors = page.$$eval.mock.calls.map((c) => c[0] as string);
    // collectLinks (a[href]…) + discoverByMenuClick (header a, nav a…) = 최소 2개
    expect(calledSelectors.length).toBeGreaterThanOrEqual(2);
    expect(calledSelectors.some((s) => s.includes('header a'))).toBe(true);
    expect(result.detectedFramework).toBe('vue');

    await crawler.close();
  });
});

describe('WebCrawler — abort 거동', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNewContext.mockResolvedValue({
      newPage: mockNewPage,
      close: mockContextClose,
      storageState: mockContextStorageState,
      exposeBinding: mockExposeBinding,
      addInitScript: mockAddInitScript,
    });
    mockNewPage.mockImplementation(() => Promise.resolve(buildMockPage()));
    mockWaitForSpaReady.mockResolvedValue(defaultReady);
  });

  test('signal 이 이미 aborted 이면 시작 페이지 한 번도 처리하지 않고 graceful 종료한다', async () => {
    const crawler = new WebCrawler({ enableSitemap: false });
    await crawler.init();

    const controller = new AbortController();
    controller.abort();

    const result = await crawler.crawl(
      'https://example.com',
      undefined,
      controller.signal
    );

    expect(result.pages).toHaveLength(0);
    // newPage 가 호출되지 않았는지 확인 (시작 URL 도 처리 못 함)
    expect(mockNewPage).not.toHaveBeenCalled();

    await crawler.close();
  });

  test('signal undefined 면 정상 흐름으로 진행된다', async () => {
    const crawler = new WebCrawler({ enableSitemap: false });
    await crawler.init();

    const result = await crawler.crawl('https://example.com');
    expect(result.pages.length).toBeGreaterThanOrEqual(1);

    await crawler.close();
  });
});
