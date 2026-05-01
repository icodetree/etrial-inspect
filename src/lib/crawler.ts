import { chromium, Browser, BrowserContext, Page } from 'playwright-core';
import { XMLParser } from 'fast-xml-parser';
import { PageInfo } from '@/types';
import { getBrowserLaunchOptions, getStealthContextOptions, STEALTH_INIT_SCRIPT } from './browser-utils';
import { waitForSpaReady, SpaFramework } from './spa-readiness';

export interface CrawlerOptions {
  maxDepth?: number;
  maxPages?: number;
  excludePatterns?: RegExp[];
  includePatterns?: RegExp[];
  headless?: boolean;
  enableSitemap?: boolean; // 기본 true
  /** 사용자 정의 ready selector — 페이지마다 hydration 후 추가 대기 */
  readySelector?: string;
  /** 크롤링 동시성 (기본: 로컬 3, Vercel 1). 메모리 ≈ 페이지당 ~50MB × concurrency. */
  crawlConcurrency?: number;
}

export interface CrawlSourceCounts {
  fromCrawl: number;
  fromSitemap: number;
}

export interface CrawlResult {
  pages: PageInfo[];
  totalFound: number;
  errors: string[];
  /** 라우트 출처 카운트 — Audit summary 의 spa.routes* 로 사용 */
  sourceCounts: CrawlSourceCounts;
  /** 첫 페이지 로드 시 자동 감지된 프레임워크 (자동 SPA 모드 결정에 사용) */
  detectedFramework: SpaFramework;
}

export class WebCrawler {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: CrawlerOptions;
  private visitedUrls: Set<string> = new Set();
  private baseUrl: string = '';
  private baseDomain: string = '';
  /** 페이지 컨텍스트의 history.pushState/replaceState/popstate 가 호출되면 이 sink 로 URL 이 들어온다. crawl() 동안만 set. */
  private routeCaptureSink: ((url: string) => void) | null = null;
  /** 첫 페이지 로드 시 감지된 프레임워크. 'unknown' 이외면 SPA 자동 모드 활성. */
  private detectedFramework: SpaFramework = 'unknown';

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
      headless: true, // Default to true
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
    {
      try {
        await this.context.exposeBinding(
          '__captureRoute',
          (_source, url: string) => {
            if (this.routeCaptureSink && typeof url === 'string') {
              this.routeCaptureSink(url);
            }
          }
        );
        await this.context.addInitScript(() => {
          try {
            const w = window as unknown as {
              __captureRoute?: (url: string) => void;
              history: History;
            };
            const send = (rawUrl: string | URL | null | undefined) => {
              try {
                if (!rawUrl) return;
                const abs =
                  typeof rawUrl === 'string'
                    ? new URL(rawUrl, window.location.href).href
                    : rawUrl.href;
                if (typeof w.__captureRoute === 'function') {
                  w.__captureRoute(abs);
                }
              } catch {
                /* noop */
              }
            };

            const origPush = w.history.pushState.bind(w.history);
            const origReplace = w.history.replaceState.bind(w.history);

            w.history.pushState = function (
              data: unknown,
              unused: string,
              url?: string | URL | null
            ) {
              const ret = origPush(data, unused, url);
              send(url ?? window.location.href);
              return ret;
            };
            w.history.replaceState = function (
              data: unknown,
              unused: string,
              url?: string | URL | null
            ) {
              const ret = origReplace(data, unused, url);
              send(url ?? window.location.href);
              return ret;
            };
            window.addEventListener('popstate', () => send(window.location.href));
            window.addEventListener('hashchange', () => send(window.location.href));
          } catch {
            /* noop — 일부 사이트에서 history wrap 이 막혀있을 수 있음 */
          }
        });
      } catch (e) {
        // binding 등록 실패는 치명적이지 않음 — 일반 크롤은 계속 작동
        console.warn('[Crawler] History API hook 등록 실패 (SPA 자동 발견 비활성):', e);
      }
    }
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

      // 로그인 상태(쿠키/스토리지)가 context에 저장됨
      return true;
    } catch (error) {
      console.error('Manual login process interrupted:', error);
      return false;
    }
    // finally block removed as user closes the page
  }

  /**
   * sitemap.xml 기반 URL 수집
   * robots.txt에서 Sitemap: 줄을 파싱하고, 없으면 /sitemap.xml을 fallback으로 사용한다.
   * sitemapindex 재귀 지원 (최대 깊이 2)
   */
  private async fetchSitemapUrls(origin: string): Promise<string[]> {
    const FETCH_TIMEOUT = 10_000;
    const TOTAL_TIMEOUT = 15_000;
    const MAX_SITEMAP_DEPTH = 2;
    const urls: string[] = [];

    const totalController = new AbortController();
    const totalTimer = setTimeout(() => totalController.abort(), TOTAL_TIMEOUT);

    const safeFetch = async (url: string): Promise<string | null> => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

        // totalController가 abort되면 개별 fetch도 중단
        const onTotalAbort = () => controller.abort();
        totalController.signal.addEventListener('abort', onTotalAbort);

        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) return null;
          return await res.text();
        } finally {
          clearTimeout(timer);
          totalController.signal.removeEventListener('abort', onTotalAbort);
        }
      } catch {
        return null;
      }
    };

    const parseSitemap = async (sitemapUrl: string, depth: number): Promise<void> => {
      if (depth > MAX_SITEMAP_DEPTH || totalController.signal.aborted) return;

      const xml = await safeFetch(sitemapUrl);
      if (!xml) return;

      try {
        const parser = new XMLParser();
        const parsed = parser.parse(xml);

        // <urlset><url><loc> 패턴
        if (parsed?.urlset?.url) {
          const entries = Array.isArray(parsed.urlset.url)
            ? parsed.urlset.url
            : [parsed.urlset.url];
          for (const entry of entries) {
            if (entry?.loc && typeof entry.loc === 'string') {
              urls.push(entry.loc);
            }
          }
        }

        // <sitemapindex><sitemap><loc> 패턴 — 재귀
        if (parsed?.sitemapindex?.sitemap) {
          const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
            ? parsed.sitemapindex.sitemap
            : [parsed.sitemapindex.sitemap];
          for (const sm of sitemaps) {
            if (sm?.loc && typeof sm.loc === 'string') {
              await parseSitemap(sm.loc, depth + 1);
            }
          }
        }
      } catch {
        console.warn(`[Crawler] sitemap 파싱 실패: ${sitemapUrl}`);
      }
    };

    try {
      // 1. robots.txt에서 Sitemap: 줄 파싱
      let sitemapEntrypoints: string[] = [];
      const robotsTxt = await safeFetch(`${origin}/robots.txt`);

      if (robotsTxt) {
        const lines = robotsTxt.split('\n');
        for (const line of lines) {
          const match = line.match(/^\s*Sitemap:\s*(.+)/i);
          if (match) {
            sitemapEntrypoints.push(match[1].trim());
          }
        }
      }

      // 2. robots.txt에 Sitemap이 없으면 /sitemap.xml fallback
      if (sitemapEntrypoints.length === 0) {
        sitemapEntrypoints = [`${origin}/sitemap.xml`];
      }

      // 3. 각 sitemap 진입점 파싱
      for (const entrypoint of sitemapEntrypoints) {
        await parseSitemap(entrypoint, 0);
      }
    } catch {
      console.warn('[Crawler] sitemap URL 수집 중 오류 발생');
    } finally {
      clearTimeout(totalTimer);
    }

    // 같은 도메인만 필터링 (isValidUrl 재사용)
    return urls.filter((url) => this.isValidUrl(url));
  }

  async crawl(
    startUrl: string,
    onProgress?: (progress: { current: number; found: number; url: string }) => void,
    signal?: AbortSignal
  ): Promise<CrawlResult> {
    if (!this.context) throw new Error('Crawler not initialized');

    this.baseUrl = startUrl;
    const urlObj = new URL(startUrl);
    this.baseDomain = urlObj.hostname;
    this.visitedUrls.clear();
    this.detectedFramework = 'unknown';

    const pages: PageInfo[] = [];
    const errors: string[] = [];
    const sourceCounts: CrawlSourceCounts = { fromCrawl: 0, fromSitemap: 0 };

    type QueueItem = {
      url: string;
      depth: number;
      path: string[];
      linkText?: string;
      source: 'start' | 'sitemap' | 'crawl';
    };
    const queue: QueueItem[] = [
      { url: startUrl, depth: 1, path: [], source: 'start' },
    ];

    // History API hook 의 sink 를 큐로 연결 (SPA 모드일 때만 init 에서 binding 이 등록됨)
    this.routeCaptureSink = (rawUrl: string) => {
      try {
        if (!this.isValidUrl(rawUrl)) return;
        const normalized = this.normalizeUrl(rawUrl);
        if (this.visitedUrls.has(normalized)) return;
        // 이미 큐에 같은 URL이 있는지는 visitedUrls 가 처리 시점에 거른다
        queue.push({ url: rawUrl, depth: 2, path: [], source: 'crawl' });
      } catch {
        /* noop */
      }
    };

    // sitemap.xml에서 보충 URL 주입
    if (this.options.enableSitemap !== false) {
      const origin = new URL(startUrl).origin;
      const sitemapUrls = await this.fetchSitemapUrls(origin);
      for (const sitemapUrl of sitemapUrls) {
        if (!this.visitedUrls.has(this.normalizeUrl(sitemapUrl))) {
          queue.push({ url: sitemapUrl, depth: 1, path: [], source: 'sitemap' });
        }
      }
    }

    // ── 공통 헬퍼: 단일 페이지 처리 ──────────────────────────────
    const maxPages = this.options.maxPages || 500;
    const maxDepth = this.options.maxDepth || 4;

    const processPage = async (item: QueueItem, isFirstPage: boolean) => {
      const { url, depth, path, linkText, source } = item;
      const normalizedUrl = this.normalizeUrl(url);

      if (this.visitedUrls.has(normalizedUrl)) return;
      if (depth > maxDepth) return;
      if (!this.isValidUrl(normalizedUrl)) return;

      this.visitedUrls.add(normalizedUrl);

      const page = await this.context!.newPage();
      try {
        // 첫 페이지: 60초, 이후: 30초
        const gotoTimeout = isFirstPage ? 60000 : 30000;
        await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: gotoTimeout });

        // 적응형 SPA 대기 — 첫 페이지는 전체 파이프라인, 이후는 감지된 프레임워크에 따라 분기
        if (isFirstPage) {
          try {
            const ready = await waitForSpaReady(page, {
              readySelector: this.options.readySelector,
              networkIdleMs: 15000,
              maxWaitMs: 30000,
            });
            if (this.detectedFramework === 'unknown') {
              this.detectedFramework = ready.framework;
            }
          } catch { /* best-effort */ }
        } else if (this.detectedFramework === 'unknown') {
          // 정적 HTML — networkidle만 짧게
          await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
        } else {
          // SPA — 축소된 타임아웃
          try {
            await waitForSpaReady(page, {
              readySelector: this.options.readySelector,
              networkIdleMs: 5000,
              maxWaitMs: 10000,
            });
          } catch { /* best-effort */ }
        }

        const realTitle = await page.title();
        const displayTitle = linkText ? linkText.trim() : (realTitle || 'Untitled');
        const depthPath = this.calculateDepthPath(path, displayTitle);

        pages.push({
          url: normalizedUrl,
          title: displayTitle,
          depth1: depthPath[0] || '',
          depth2: depthPath[1] || '',
          depth3: depthPath[2] || '',
          depth4: depthPath[3] || '',
        });

        if (source === 'sitemap') sourceCounts.fromSitemap++;
        else if (source === 'crawl') sourceCounts.fromCrawl++;

        onProgress?.({
          current: pages.length,
          found: this.visitedUrls.size + queue.length,
          url: normalizedUrl,
        });

        // 링크 수집
        let linksFound = 0;
        if (depth < maxDepth) {
          const links = await this.collectLinks(page);
          linksFound = links.length;
          for (const link of links) {
            if (!this.visitedUrls.has(link.url)) {
              queue.push({
                url: link.url,
                depth: depth + 1,
                path: [...path, displayTitle],
                linkText: link.text,
                source: 'crawl',
              });
            }
          }
        }

        // 메뉴 클릭 시뮬레이션 — 첫 페이지에서 링크가 적으면 실행
        // framework=unknown이어도 실행: WAF 차단 사이트, 커스텀 SPA 등에서 유효
        if (isFirstPage && linksFound < 3) {
          try {
            await this.discoverByMenuClick(page);
          } catch (e) {
            console.warn('[Crawler] 메뉴 클릭 시뮬레이션 실패:', e);
          }
        }
      } catch (error) {
        errors.push(`Error crawling ${normalizedUrl}: ${error}`);
      } finally {
        await page.close();
      }
    };

    // ── 1단계: 첫 페이지 순차 처리 (SPA 감지 + 메뉴 클릭) ────────
    const firstItem = queue.shift();
    if (firstItem && !signal?.aborted) {
      await processPage(firstItem, true);
    }

    // ── 2단계: 나머지 페이지 병렬 워커 ────────────────────────────
    const isVercel = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    const concurrency = this.options.crawlConcurrency ?? (isVercel ? 1 : 3);
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

        activeWorkers++;
        try {
          await processPage(current, false);
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
   * 보수적 메뉴 클릭 시뮬레이션 — 첫 페이지의 GNB/nav 영역에서 위험하지 않은 후보를
   * 최대 N개까지 클릭해서 클라이언트 라우팅을 트리거한다.
   * URL 변경은 History API hook 이 자동으로 큐에 push 하므로 여기서는 클릭만 한다.
   */
  private async discoverByMenuClick(page: Page): Promise<void> {
    const MAX_CANDIDATES = 10;
    const DANGER_PATTERN =
      /로그아웃|logout|로그인|login|회원가입|signup|join|삭제|delete|탈퇴|withdraw|결제|payment|구매|buy|submit|제출/i;

    type Candidate = { selector: string; text: string; href: string | null };
    let candidates: Candidate[];
    try {
      candidates = await page.$$eval(
        'header a, nav a, [role=navigation] a, .gnb a, .lnb a, [role=menuitem], [role=tab], header button, nav button, [role=navigation] button, .gnb button, .lnb button, .nav a, .menu a, .navigation a, [class*="nav-"] a, [class*="menu-"] a',
        (els) => {
          const out: { selector: string; text: string; href: string | null }[] = [];
          for (let i = 0; i < els.length; i++) {
            const el = els[i] as HTMLElement;
            const tag = el.tagName;
            // form submit 버튼 제외
            if (tag === 'BUTTON') {
              const btn = el as HTMLButtonElement;
              if (btn.type === 'submit' || el.closest('form')) continue;
            }
            const text = (el.innerText || el.textContent || '').trim().slice(0, 80);
            const href = tag === 'A' ? (el as HTMLAnchorElement).getAttribute('href') : null;
            // selector 는 nth-of-type 기반 — 안정성보다 동작성 우선
            // 클릭은 page.locator(selector).nth(...) 으로 해도 되므로 여기선 인덱스만 보존
            out.push({
              selector: `__menu_candidate_${i}__`,
              text,
              href,
            });
          }
          return out;
        }
      );
    } catch {
      return;
    }

    // 후보 정제: 위험 텍스트 제외, anchor 의 href 가 mailto/tel/javascript 인 것 제외
    const safe = candidates
      .map((c, idx) => ({ ...c, idx }))
      .filter((c) => !DANGER_PATTERN.test(c.text))
      .filter((c) => {
        if (!c.href) return true;
        return !/^(mailto:|tel:|javascript:|#$)/i.test(c.href);
      })
      .slice(0, MAX_CANDIDATES);

    if (safe.length === 0) return;

    // 후보를 동일 selector 로 한 번에 잡고 인덱스로 click
    const allSelector =
      'header a, nav a, [role=navigation] a, .gnb a, .lnb a, [role=menuitem], [role=tab], header button, nav button, [role=navigation] button, .gnb button, .lnb button, .nav a, .menu a, .navigation a, [class*="nav-"] a, [class*="menu-"] a';
    const startUrl = page.url();

    for (const c of safe) {
      try {
        // 매 클릭 전 현재 URL 기록
        const beforeUrl = page.url();
        const locator = page.locator(allSelector).nth(c.idx);
        const visible = await locator.isVisible({ timeout: 500 }).catch(() => false);
        if (!visible) continue;

        await locator.click({ timeout: 1000, trial: false });
        // URL 변경 감지 — 짧게 기다림
        await Promise.race([
          page.waitForURL(() => page.url() !== beforeUrl, { timeout: 1000 }).catch(() => null),
          page.waitForTimeout(600),
        ]);

        // URL 이 시작 URL 과 달라졌으면 goBack 으로 복귀 (sink 가 이미 큐에 push 했음)
        if (page.url() !== startUrl) {
          try {
            await page.goBack({ timeout: 1500, waitUntil: 'domcontentloaded' });
          } catch {
            // 복귀 실패 시 다시 startUrl 로 강제 이동 — 재진입 대신 그냥 break
            break;
          }
        }
      } catch {
        // 개별 후보 실패는 무시하고 다음 후보로
        continue;
      }
    }
  }

  private async collectLinks(page: Page): Promise<{ url: string; text: string }[]> {
    // a[href] + SPA 라우터 data 속성 + role 기반 링크 수집
    const links = await page.$$eval(
      'a[href], [data-href], [data-to], [data-route], [data-link], [data-url], [data-page], [role="link"]',
      (els, origin) => {
        const out: { url: string; text: string }[] = [];
        for (const el of els as HTMLElement[]) {
          let candidate: string | null = null;
          if (el.tagName === 'A') {
            candidate = (el as HTMLAnchorElement).href;
          } else {
            candidate =
              el.getAttribute('data-href') ||
              el.getAttribute('data-to') ||
              el.getAttribute('data-route') ||
              el.getAttribute('data-link') ||
              el.getAttribute('data-url') ||
              el.getAttribute('data-page') ||
              null;
          }

          // onclick 속성에서 URL 패턴 추출 (커스텀 SPA 라우팅)
          if (!candidate) {
            const onclick = el.getAttribute('onclick') || '';
            const match = onclick.match(
              /(?:location\.href|navigate|router\.push|goTo)\s*[=(]\s*['"]([^'"]+)['"]/
            );
            if (match) candidate = match[1];
          }

          // 상대경로 → 절대경로 변환
          if (candidate && !/^https?:\/\//i.test(candidate)) {
            try {
              candidate = new URL(candidate, origin).href;
            } catch {
              candidate = null;
            }
          }

          if (!candidate) continue;
          out.push({
            url: candidate,
            text: (el.innerText || el.textContent || '').trim(),
          });
        }
        return out;
      },
      this.baseUrl ? new URL(this.baseUrl).origin : ''
    );

    return links
      .filter((link) => this.isValidUrl(link.url))
      .map((link) => ({ ...link, url: this.normalizeUrl(link.url) }))
      // Unique by URL
      .filter((link, index, self) =>
        self.findIndex(l => l.url === link.url) === index
      );
  }

  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url, this.baseUrl);
      // 해시 라우팅 보존 — #/ 또는 #! 패턴은 SPA 라우트, 일반 앵커만 제거
      if (urlObj.hash && !/^#[!/]/.test(urlObj.hash)) {
        urlObj.hash = '';
      }
      // 마지막 슬래시 제거
      let normalized = urlObj.href;
      if (normalized.endsWith('/') && normalized.length > 1) {
        normalized = normalized.slice(0, -1);
      }
      return normalized;
    } catch {
      return url;
    }
  }

  private isValidUrl(url: string): boolean {
    try {
      const urlObj = new URL(url, this.baseUrl);

      // 같은 도메인인지 확인
      if (urlObj.hostname !== this.baseDomain) return false;

      // 제외 패턴 체크
      for (const pattern of this.options.excludePatterns || []) {
        if (pattern.test(url)) return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  private calculateDepthPath(parentPath: string[], currentTitle: string): string[] {
    const fullPath = [...parentPath.slice(0, 3), currentTitle];
    const result: string[] = [];

    for (let i = 0; i < 4; i++) {
      result.push(fullPath[i] || '');
    }

    return result;
  }

  // 스토리지 상태 저장
  async saveStorageState(path: string): Promise<void> {
    if (this.context) {
      await this.context.storageState({ path });
    }
  }

  // 스토리지 상태 로드 — stealth 설정 + History API hook 을 다시 적용
  async loadStorageState(statePath: string): Promise<void> {
    if (this.browser) {
      const fs = await import('fs');
      if (fs.existsSync(statePath)) {
        // 기존 context 정리
        if (this.context) {
          await this.context.close().catch(() => {});
        }

        this.context = await this.browser.newContext({
          ...getStealthContextOptions(),
          storageState: statePath,
        });
        await this.context.addInitScript(STEALTH_INIT_SCRIPT);

        // History API 가로채기 재등록
        try {
          await this.context.exposeBinding(
            '__captureRoute',
            (_source: unknown, url: string) => {
              if (this.routeCaptureSink && typeof url === 'string') {
                this.routeCaptureSink(url);
              }
            }
          );
          await this.context.addInitScript(() => {
            try {
              const w = window as unknown as {
                __captureRoute?: (url: string) => void;
                history: History;
              };
              const send = (rawUrl: string | URL | null | undefined) => {
                try {
                  if (!rawUrl) return;
                  const abs =
                    typeof rawUrl === 'string'
                      ? new URL(rawUrl, window.location.href).href
                      : rawUrl.href;
                  if (typeof w.__captureRoute === 'function') {
                    w.__captureRoute(abs);
                  }
                } catch { /* noop */ }
              };
              const origPush = w.history.pushState.bind(w.history);
              const origReplace = w.history.replaceState.bind(w.history);
              w.history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
                const ret = origPush(data, unused, url);
                send(url ?? window.location.href);
                return ret;
              };
              w.history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
                const ret = origReplace(data, unused, url);
                send(url ?? window.location.href);
                return ret;
              };
              window.addEventListener('popstate', () => send(window.location.href));
              window.addEventListener('hashchange', () => send(window.location.href));
            } catch { /* noop */ }
          });
        } catch {
          console.warn('[Crawler] loadStorageState: History API hook 재등록 실패');
        }
      }
    }
  }
}

export default WebCrawler;
