/**
 * WebCrawler core — Phase 3-1 분리 후 추가 단위 테스트.
 *
 * 기존 `crawler.spa.test.ts` 가 SPA 자동 감지 인프라/메뉴 클릭 게이팅/abort 거동을
 * 검증한다. 본 테스트는 그와 겹치지 않는 핵심 거동을 보충한다:
 *  - facade(`@/lib/crawler`) 가 WebCrawler / 타입을 그대로 re-export 한다.
 *  - sitemap fetch 가 enableSitemap=false 일 때 호출되지 않는다.
 *  - sitemap 모듈에서 받은 URL 이 큐에 sourceCounts.fromSitemap 으로 집계된다.
 *  - Crawler not initialized 가드가 동작한다.
 */

const mockExposeBinding = jest.fn().mockResolvedValue(undefined);
const mockAddInitScript = jest.fn().mockResolvedValue(undefined);
const mockContextClose = jest.fn().mockResolvedValue(undefined);
const mockContextStorageState = jest.fn().mockResolvedValue(undefined);
const mockNewPage = jest.fn();
const mockNewContext = jest.fn();

const mockWaitForSpaReady = jest.fn();
jest.mock('../../spa-readiness', () => ({
  waitForSpaReady: (...args: unknown[]) => mockWaitForSpaReady(...args),
}));

const mockFetchSitemapUrls = jest.fn();
jest.mock('../../crawler/sitemap', () => ({
  fetchSitemapUrls: (...args: unknown[]) => mockFetchSitemapUrls(...args),
}));

function buildMockPage() {
  return {
    goto: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    title: jest.fn().mockResolvedValue('Test Page'),
    close: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(false),
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

jest.mock('../../browser-utils', () => ({
  getBrowserLaunchOptions: jest.fn().mockResolvedValue({ headless: true }),
  getStealthContextOptions: jest.fn().mockReturnValue({ viewport: { width: 1920, height: 1080 } }),
  STEALTH_INIT_SCRIPT: '',
}));

import { WebCrawler } from '../../crawler';
import * as crawlerFacade from '../../crawler';

const defaultReady = {
  framework: 'unknown' as const,
  renderStrategy: 'unknown' as const,
  hydrationMs: 50,
  domNodeCount: 100,
  status: 'ready' as const,
  notes: [],
};

describe('crawler facade', () => {
  test('WebCrawler 클래스가 facade 에서 export 된다', () => {
    expect(typeof WebCrawler).toBe('function');
    expect(WebCrawler.prototype.init).toBeDefined();
    expect(WebCrawler.prototype.crawl).toBeDefined();
    expect(WebCrawler.prototype.close).toBeDefined();
  });

  test('default export 도 동일한 클래스를 가리킨다', () => {
    expect(crawlerFacade.default).toBe(WebCrawler);
  });
});

describe('WebCrawler.crawl — sitemap 통합', () => {
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
    mockFetchSitemapUrls.mockResolvedValue([]);
  });

  test('enableSitemap=false 이면 fetchSitemapUrls 가 호출되지 않는다', async () => {
    const crawler = new WebCrawler({ enableSitemap: false });
    await crawler.init();
    await crawler.crawl('https://example.com');

    expect(mockFetchSitemapUrls).not.toHaveBeenCalled();

    await crawler.close();
  });

  test('enableSitemap 미지정(기본 true) 이면 fetchSitemapUrls 가 origin 으로 호출된다', async () => {
    const crawler = new WebCrawler();
    await crawler.init();
    await crawler.crawl('https://example.com/path/sub');

    expect(mockFetchSitemapUrls).toHaveBeenCalledTimes(1);
    expect(mockFetchSitemapUrls.mock.calls[0][0]).toBe('https://example.com');

    await crawler.close();
  });

  test('sitemap 모듈에서 받은 URL 이 sourceCounts.fromSitemap 으로 집계된다', async () => {
    mockFetchSitemapUrls.mockResolvedValue([
      'https://example.com/from-sitemap-1',
      'https://example.com/from-sitemap-2',
    ]);

    const crawler = new WebCrawler({ maxDepth: 1, maxPages: 10 });
    await crawler.init();
    const result = await crawler.crawl('https://example.com');

    // 시작 페이지 + sitemap 2 개 = 3 페이지가 처리되어야 함
    // sitemap 출처는 fromSitemap 카운트에 잡힘 (출발지 시작 페이지는 source='start' 라 카운트 안 됨)
    expect(result.sourceCounts.fromSitemap).toBe(2);
    expect(result.pages.length).toBe(3);

    await crawler.close();
  });
});

describe('WebCrawler — init 가드', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNewContext.mockResolvedValue({
      newPage: mockNewPage,
      close: mockContextClose,
      storageState: mockContextStorageState,
      exposeBinding: mockExposeBinding,
      addInitScript: mockAddInitScript,
    });
    mockFetchSitemapUrls.mockResolvedValue([]);
  });

  test('init() 호출 전에 crawl() 하면 명확한 에러를 throw 한다', async () => {
    const crawler = new WebCrawler();
    await expect(crawler.crawl('https://example.com')).rejects.toThrow(
      /not initialized/i,
    );
  });

  test('init() 호출 전에 login() 하면 명확한 에러를 throw 한다', async () => {
    const crawler = new WebCrawler();
    await expect(
      crawler.login('https://example.com/login', 'https://example.com'),
    ).rejects.toThrow(/not initialized/i);
  });
});
