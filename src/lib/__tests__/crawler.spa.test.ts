/**
 * WebCrawler — SPA 모드 / abort 거동 테스트
 *
 * Playwright 의존을 모두 모킹해 다음을 검증한다:
 *  - SPA 모드 ON 일 때 init() 이 context.exposeBinding + addInitScript 를 호출한다.
 *  - SPA 모드 OFF 일 때는 호출하지 않는다.
 *  - crawl(signal) 의 while 루프가 signal.aborted 시 즉시 break 한다 (graceful).
 */

const mockExposeBinding = jest.fn().mockResolvedValue(undefined);
const mockAddInitScript = jest.fn().mockResolvedValue(undefined);
const mockContextClose = jest.fn().mockResolvedValue(undefined);
const mockContextStorageState = jest.fn().mockResolvedValue(undefined);

const mockNewPage = jest.fn();
const mockNewContext = jest.fn();

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
}));

import { WebCrawler } from '../crawler';

describe('WebCrawler — SPA 모드 init', () => {
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

  test('isSpa=true 일 때 exposeBinding + addInitScript 가 호출된다', async () => {
    const crawler = new WebCrawler({ isSpa: true });
    await crawler.init();

    expect(mockExposeBinding).toHaveBeenCalledWith(
      '__captureRoute',
      expect.any(Function)
    );
    expect(mockAddInitScript).toHaveBeenCalledTimes(1);

    await crawler.close();
  });

  test('isSpa=false 일 때는 binding/initScript 가 호출되지 않는다', async () => {
    const crawler = new WebCrawler({ isSpa: false });
    await crawler.init();

    expect(mockExposeBinding).not.toHaveBeenCalled();
    expect(mockAddInitScript).not.toHaveBeenCalled();

    await crawler.close();
  });

  test('exposeBinding 실패해도 init() 자체는 throw 하지 않는다 (best-effort)', async () => {
    mockExposeBinding.mockRejectedValueOnce(new Error('binding-failed'));
    const crawler = new WebCrawler({ isSpa: true });
    await expect(crawler.init()).resolves.toBeUndefined();
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
  });

  test('signal 이 이미 aborted 이면 시작 페이지 한 번도 처리하지 않고 graceful 종료한다', async () => {
    const crawler = new WebCrawler({ isSpa: false, enableSitemap: false });
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
    const crawler = new WebCrawler({ isSpa: false, enableSitemap: false });
    await crawler.init();

    const result = await crawler.crawl('https://example.com');
    expect(result.pages.length).toBeGreaterThanOrEqual(1);

    await crawler.close();
  });
});
