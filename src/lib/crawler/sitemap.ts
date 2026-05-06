/**
 * sitemap.xml 기반 URL 수집.
 *
 * Phase 3-1: 기존 `WebCrawler.fetchSitemapUrls` 의 책임을 분리.
 * robots.txt 의 `Sitemap:` 줄을 파싱하고, 없으면 `/sitemap.xml` 을 fallback 으로 시도한다.
 * `<sitemapindex>` 는 최대 깊이 2 까지 재귀 탐색.
 *
 * 모든 fetch 는 개별 타임아웃(10s) + 전체 타임아웃(15s) 으로 보호되며,
 * 실패는 무시하고 빈 배열을 반환한다 (sitemap 부재는 정상 케이스).
 */

import { XMLParser } from 'fast-xml-parser';

const FETCH_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 15_000;
const MAX_SITEMAP_DEPTH = 2;

export interface FetchSitemapOptions {
  /** 추가로 수집된 URL 을 필터링할 predicate (보통 `WebCrawler.isValidUrl` 위임) */
  isValidUrl: (url: string) => boolean;
  /**
   * 사용자 정의 fetch 구현. 단위 테스트에서 mock 주입용. 기본값은 글로벌 `fetch`.
   */
  fetchImpl?: typeof fetch;
}

/**
 * 주어진 origin (예: https://example.com) 에서 sitemap URL 들을 수집한다.
 * 결과는 `options.isValidUrl` 로 필터링된 후 반환된다.
 */
export async function fetchSitemapUrls(
  origin: string,
  options: FetchSitemapOptions,
): Promise<string[]> {
  const fetchFn = options.fetchImpl ?? fetch;
  const urls: string[] = [];

  const totalController = new AbortController();
  const totalTimer = setTimeout(() => totalController.abort(), TOTAL_TIMEOUT_MS);

  const safeFetch = async (url: string): Promise<string | null> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      // totalController 가 abort 되면 개별 fetch 도 중단
      const onTotalAbort = () => controller.abort();
      totalController.signal.addEventListener('abort', onTotalAbort);

      try {
        const res = await fetchFn(url, { signal: controller.signal });
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
    // 1. robots.txt 에서 Sitemap: 줄 파싱
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

    // 2. robots.txt 에 Sitemap 이 없으면 /sitemap.xml fallback
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

  // 같은 도메인 / 제외 패턴 필터링은 호출처가 주입한 isValidUrl 위임
  return urls.filter((url) => options.isValidUrl(url));
}
