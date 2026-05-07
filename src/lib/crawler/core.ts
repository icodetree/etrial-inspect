/**
 * WebCrawler — Playwright 기반 BFS 웹 크롤러 (Phase 3-1 분리 본체).
 *
 * 책임:
 * - Browser/Context 라이프사이클 (init / close / loadStorageState)
 * - 시작 URL 부터 BFS 트래버설 + 워커 풀
 * - sitemap.xml 보충 / SPA 자동 감지 / 메뉴 클릭 폴백 / WAF 차단 감지
 *
 * 위임:
 * - sitemap.xml 파싱  → `./sitemap.ts`
 * - History API hook  → `./history-hook.ts`
 * - 메뉴 클릭 시뮬레이션 → `./spa-discovery.ts`
 * - 링크 수집          → `./link-collector.ts`
 * - URL 정규화/검증    → `./url-utils.ts`
 *
 * 외부 호출자는 `src/lib/crawler.ts` (facade) 를 통해 import 한다.
 */

import { chromium, Browser, BrowserContext } from 'playwright-core';
import { PageInfo } from '@/types';
import {
  getBrowserLaunchOptions,
  getStealthContextOptions,
  STEALTH_INIT_SCRIPT,
} from '../browser-utils';
import { getRuntimeProfile } from '../runtime-config';
import { detectWafChallengeWithRetry } from '../waf-detector';
import { waitForSpaReady, SpaFramework } from '../spa-readiness';
import { fetchSitemapUrls } from './sitemap';
import { installHistoryHook } from './history-hook';
import { discoverByMenuClick } from './spa-discovery';
import { collectLinks } from './link-collector';
import { normalizeUrl, isValidUrl, calculateDepthPath } from './url-utils';
import type {
  CrawlerOptions,
  CrawlResult,
  CrawlSourceCounts,
  QueueItem,
  RouteCaptureSink,
} from './types';

// 페이지 간 기본 딜레이 / WAF 쿨다운 (ms)
const PAGE_DELAY_MS = 800;
const WAF_COOLDOWN_MS = 15_000;

// 페이지 goto 타임아웃 (ms) — 첫 페이지는 hydration 여유, 나머지는 짧게
const FIRST_PAGE_GOTO_TIMEOUT_MS = 60_000;
const SUBSEQUENT_GOTO_TIMEOUT_MS = 30_000;

// SPA 대기 — 첫 페이지 풀 / 후속 페이지 축소
const FIRST_PAGE_NETWORK_IDLE_MS = 15_000;
const FIRST_PAGE_MAX_WAIT_MS = 30_000;
const SUBSEQUENT_NETWORK_IDLE_MS = 5_000;
const SUBSEQUENT_MAX_WAIT_MS = 10_000;
const STATIC_FALLBACK_NETWORK_IDLE_MS = 5_000;

// WAF 감지: 정상 페이지가 보통 ≥30 DOM 노드를 갖는다고 가정 (보수적 임계값)
const WAF_MIN_DOM_NODES = 30;

// 메뉴 클릭 폴백 임계값 — 첫 페이지 링크가 이 값 미만이면 SPA 메뉴 탐색 시도
const MENU_CLICK_LINK_THRESHOLD = 3;

export class WebCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: CrawlerOptions;
  private visitedUrls: Set<string> = new Set();
  /** 큐에 이미 추가된 URL 추적 — 여러 워커가 동시에 같은 URL을 큐에 넣는 것을 방지 */
  private queuedUrls: Set<string> = new Set();
  /** 진행률 표시용 단조증가(high-water mark) — found 숫자가 줄어들지 않도록 */
  private peakFound: number = 0;
  private baseUrl: string = '';
  private baseDomain: string = '';
  /** 페이지 컨텍스트의 history.pushState/replaceState/popstate 가 호출되면 이 sink 로 URL 이 들어온다. crawl() 동안만 set. */
  private routeCaptureSink: RouteCaptureSink | null = null;
  /** 첫 페이지 로드 시 감지된 프레임워크. 'unknown' 이외면 SPA 자동 모드 활성. */
  private detectedFramework: SpaFramework = 'unknown';
  /** WAF 차단 감지 시각 — 다른 워커가 속도를 줄이도록 공유 */
  private lastBlockedAt = 0;

  constructor(options: CrawlerOptions = {}) {
    this.options = {
      maxDepth: 4,
      maxPages: 500,
      excludePatterns: [
        /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|exe|dmg)$/i,
        /logout/i,
        /delete/i,
        /signout/i,
        /#$/,
        /javascript:/i,
        /mailto:/i,
        /tel:/i,
      ],
      headless: true,
      ...options,
    };
  }

  async init(): Promise<void> {
    const launchOptions = await getBrowserLaunchOptions(this.options.headless);
    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext(getStealthContextOptions());

    // WAF/봇 탐지 우회 — navigator.webdriver 제거 등
    await this.context.addInitScript(STEALTH_INIT_SCRIPT);

    // History API 가로채기 — 모든 page 에 자동 적용 (정적 사이트에서도 부작용 0,
    // pushState 가 호출되지 않을 뿐). SPA 자동 감지의 핵심 인프라.
    await installHistoryHook(this.context, {
      getSink: () => this.routeCaptureSink,
    });
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }

  async login(loginUrl: string, targetUrl: string): Promise<boolean> {
    if (!this.context) throw new Error('Crawler not initialized');

    const page = await this.context.newPage();
    try {
      console.log(`로그인 페이지로 이동 중: ${loginUrl}`);
      console.log(`사용자 로그인 대기 중... (목표 URL: ${targetUrl})`);

      await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

      console.log('로그인 완료 후 창이 닫히기를 기다리는 중...');

      // 사용자가 직접 로그인을 완료하고 창을 닫을 때까지 대기
      await new Promise<void>((resolve) => {
        page.on('close', () => {
          console.log('로그인 창이 닫혔습니다.');
          resolve();
        });
      });

      console.log('브라우저 창이 닫힘. 로그인이 완료된 것으로 간주합니다.');

      // 로그인 상태(쿠키/스토리지)가 context 에 저장됨
      return true;
    } catch (error) {
      console.error('Manual login process interrupted:', error);
      return false;
    }
    // finally 제거 — 사용자가 페이지를 닫음
  }

  async crawl(
    startUrl: string,
    onProgress?: (progress: { current: number; found: number; url: string }) => void,
    signal?: AbortSignal,
  ): Promise<CrawlResult> {
    if (!this.context) throw new Error('Crawler not initialized');

    this.baseUrl = startUrl;
    this.baseDomain = new URL(startUrl).hostname;
    this.visitedUrls.clear();
    this.queuedUrls.clear();
    this.peakFound = 0;
    this.detectedFramework = 'unknown';

    const pages: PageInfo[] = [];
    const errors: string[] = [];
    const sourceCounts: CrawlSourceCounts = { fromCrawl: 0, fromSitemap: 0 };

    const queue: QueueItem[] = [
      { url: startUrl, depth: 1, path: [], source: 'start' },
    ];
    this.queuedUrls.add(this.normalize(startUrl));

    // History API hook 의 sink 를 큐로 연결
    this.routeCaptureSink = (rawUrl: string) => {
      try {
        if (!this.checkUrl(rawUrl)) return;
        const normalized = this.normalize(rawUrl);
        if (this.visitedUrls.has(normalized) || this.queuedUrls.has(normalized)) return;
        this.queuedUrls.add(normalized);
        queue.push({ url: rawUrl, depth: 2, path: [], source: 'crawl' });
      } catch {
        /* noop */
      }
    };

    // sitemap.xml 보충
    if (this.options.enableSitemap !== false) {
      const origin = new URL(startUrl).origin;
      const sitemapUrls = await fetchSitemapUrls(origin, {
        isValidUrl: (u) => this.checkUrl(u),
      });
      for (const sitemapUrl of sitemapUrls) {
        const normalized = this.normalize(sitemapUrl);
        if (!this.visitedUrls.has(normalized) && !this.queuedUrls.has(normalized)) {
          this.queuedUrls.add(normalized);
          queue.push({ url: sitemapUrl, depth: 1, path: [], source: 'sitemap' });
        }
      }
    }

    const maxPages = this.options.maxPages || 500;
    const maxDepth = this.options.maxDepth || 4;

    // ── 1단계: 첫 페이지 순차 처리 (SPA 감지 + 메뉴 클릭) ────────
    const firstItem = queue.shift();
    if (firstItem && !signal?.aborted) {
      await this.processPage(firstItem, true, {
        pages,
        errors,
        sourceCounts,
        queue,
        maxDepth,
        onProgress,
      });
    }

    // ── 2단계: 나머지 페이지 병렬 워커 ────────────────────────────
    const concurrency = this.options.crawlConcurrency ?? getRuntimeProfile().crawlConcurrency;
    let activeWorkers = 0;

    const worker = async () => {
      while (true) {
        if (signal?.aborted) break;
        if (pages.length >= maxPages) break;

        const current = queue.shift();
        if (!current) {
          // 큐가 비었지만 다른 워커가 링크를 수집 중일 수 있음
          if (activeWorkers === 0) break;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }

        // WAF rate limiting 회피: 최근 차단이 감지되었으면 백오프 대기
        const sinceLast = Date.now() - this.lastBlockedAt;
        if (this.lastBlockedAt > 0 && sinceLast < WAF_COOLDOWN_MS) {
          const cooldown = WAF_COOLDOWN_MS - sinceLast;
          console.log(`[Crawler] WAF 쿨다운 대기: ${Math.round(cooldown / 1000)}초`);
          await new Promise((r) => setTimeout(r, cooldown));
        }
        // 페이지 간 기본 딜레이 (Cloudflare rate limit 회피)
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));

        activeWorkers++;
        try {
          await this.processPage(current, false, {
            pages,
            errors,
            sourceCounts,
            queue,
            maxDepth,
            onProgress,
          });
        } finally {
          activeWorkers--;
        }
      }
    };

    const workerCount = Math.min(concurrency, Math.max(queue.length, 1));
    await Promise.all(Array(workerCount).fill(null).map(() => worker()));

    // sink 해제 — close() 이후 binding 이 호출되지 않도록
    this.routeCaptureSink = null;

    return {
      pages,
      totalFound: this.visitedUrls.size,
      errors,
      sourceCounts,
      detectedFramework: this.detectedFramework,
    };
  }

  /**
   * 단일 페이지 처리 — goto / SPA 대기 / WAF 감지 / 메타 추출 / 링크 수집 / 메뉴 클릭.
   * BFS 상태(visitedUrls / queue / pages / sourceCounts) 는 모두 인자/멤버를 통해 공유.
   */
  private async processPage(
    item: QueueItem,
    isFirstPage: boolean,
    ctx: {
      pages: PageInfo[];
      errors: string[];
      sourceCounts: CrawlSourceCounts;
      queue: QueueItem[];
      maxDepth: number;
      onProgress?: (progress: { current: number; found: number; url: string }) => void;
    },
  ): Promise<void> {
    const { url, depth, path, linkText, source } = item;
    const normalizedUrl = this.normalize(url);

    if (this.visitedUrls.has(normalizedUrl)) return;
    if (depth > ctx.maxDepth) return;
    if (!this.checkUrl(normalizedUrl)) return;

    this.visitedUrls.add(normalizedUrl);

    const page = await this.context!.newPage();
    try {
      const gotoTimeout = isFirstPage ? FIRST_PAGE_GOTO_TIMEOUT_MS : SUBSEQUENT_GOTO_TIMEOUT_MS;
      await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: gotoTimeout });

      // 적응형 SPA 대기
      if (isFirstPage) {
        try {
          const ready = await waitForSpaReady(page, {
            readySelector: this.options.readySelector,
            networkIdleMs: FIRST_PAGE_NETWORK_IDLE_MS,
            maxWaitMs: FIRST_PAGE_MAX_WAIT_MS,
          });
          if (this.detectedFramework === 'unknown') {
            this.detectedFramework = ready.framework;
          }
        } catch {
          /* best-effort */
        }
      } else if (this.detectedFramework === 'unknown') {
        // 정적 HTML — networkidle 만 짧게
        await page
          .waitForLoadState('networkidle', { timeout: STATIC_FALLBACK_NETWORK_IDLE_MS })
          .catch(() => {});
      } else {
        // SPA — 축소된 타임아웃
        try {
          await waitForSpaReady(page, {
            readySelector: this.options.readySelector,
            networkIdleMs: SUBSEQUENT_NETWORK_IDLE_MS,
            maxWaitMs: SUBSEQUENT_MAX_WAIT_MS,
          });
        } catch {
          /* best-effort */
        }
      }

      // WAF/봇 차단 페이지 감지
      const wafDetection = await detectWafChallengeWithRetry(page, { minDomNodes: WAF_MIN_DOM_NODES });
      if (wafDetection.blocked) {
        console.warn(`[Crawler] 차단/챌린지 페이지 스킵: ${normalizedUrl}`);
        // 다른 워커도 속도를 낮추도록 쿨다운 플래그 설정
        this.lastBlockedAt = Date.now();
        return;
      }

      const realTitle = await page.title();
      const displayTitle = linkText ? linkText.trim() : (realTitle || 'Untitled');
      const [d1, d2, d3, d4] = calculateDepthPath(path, displayTitle);

      ctx.pages.push({
        url: normalizedUrl,
        title: displayTitle,
        depth1: d1,
        depth2: d2,
        depth3: d3,
        depth4: d4,
      });

      if (source === 'sitemap') ctx.sourceCounts.fromSitemap++;
      else if (source === 'crawl') ctx.sourceCounts.fromCrawl++;

      // 링크 수집
      let linksFound = 0;
      if (depth < ctx.maxDepth) {
        const links = await collectLinks(page, {
          isValidUrl: (u) => this.checkUrl(u),
          normalizeUrl: (u) => this.normalize(u),
          origin: this.baseUrl ? new URL(this.baseUrl).origin : '',
        });
        linksFound = links.length;
        for (const link of links) {
          if (!this.visitedUrls.has(link.url) && !this.queuedUrls.has(link.url)) {
            this.queuedUrls.add(link.url);
            ctx.queue.push({
              url: link.url,
              depth: depth + 1,
              path: [...path, displayTitle],
              linkText: link.text,
              source: 'crawl',
            });
          }
        }
      }

      // 진행률 보고 — 링크 수집 완료 후, 단조증가(high-water mark)로 보고
      this.peakFound = Math.max(this.peakFound, this.visitedUrls.size + this.queuedUrls.size);
      ctx.onProgress?.({
        current: ctx.pages.length,
        found: this.peakFound,
        url: normalizedUrl,
      });

      // 메뉴 클릭 시뮬레이션 — 첫 페이지에서 링크가 적으면 실행
      // framework=unknown 이어도 실행: WAF 차단 사이트, 커스텀 SPA 등에서 유효
      if (isFirstPage && linksFound < MENU_CLICK_LINK_THRESHOLD) {
        try {
          await discoverByMenuClick(page);
        } catch (e) {
          console.warn('[Crawler] 메뉴 클릭 시뮬레이션 실패:', e);
        }
      }
    } catch (error) {
      ctx.errors.push(`Error crawling ${normalizedUrl}: ${error}`);
    } finally {
      await page.close();
    }
  }

  /** baseUrl/baseDomain/excludePatterns 를 적용한 URL 검증. */
  private checkUrl(url: string): boolean {
    return isValidUrl(url, {
      baseUrl: this.baseUrl,
      baseDomain: this.baseDomain,
      excludePatterns: this.options.excludePatterns,
    });
  }

  /** baseUrl 기준 URL 정규화. */
  private normalize(url: string): string {
    return normalizeUrl(url, this.baseUrl);
  }

  // 스토리지 상태 저장
  async saveStorageState(path: string): Promise<void> {
    if (this.context) {
      await this.context.storageState({ path });
    }
  }

  // 스토리지 상태 로드 — stealth 설정 + History API hook 을 다시 적용
  async loadStorageState(statePath: string): Promise<void> {
    if (!this.browser) return;
    const fs = await import('fs');
    if (!fs.existsSync(statePath)) return;

    if (this.context) {
      await this.context.close().catch(() => {});
    }

    this.context = await this.browser.newContext({
      ...getStealthContextOptions(),
      storageState: statePath,
    });
    await this.context.addInitScript(STEALTH_INIT_SCRIPT);

    // History API 가로채기 재등록
    await installHistoryHook(this.context, {
      getSink: () => this.routeCaptureSink,
    });
  }
}

export default WebCrawler;
