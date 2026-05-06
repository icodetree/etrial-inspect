/**
 * 페이지 링크 수집기 — Phase 3-1 분리 모듈.
 *
 * `<a[href]>`, SPA 라우터 data 속성(`data-href` / `data-to` / `data-route` / ...),
 * `[role="link"]`, 그리고 `onclick` 속성의 URL 패턴까지 폭넓게 추출한다.
 *
 * 결과는 호출처가 주입한 `isValidUrl` / `normalizeUrl` 로 필터링/정규화된 후
 * URL 기준으로 중복 제거된다.
 */

import type { Page } from 'playwright-core';

const LINK_SELECTOR =
  'a[href], [data-href], [data-to], [data-route], [data-link], [data-url], [data-page], [role="link"]';

export interface CollectLinksOptions {
  /** 도메인/제외 패턴 검사 — 보통 `WebCrawler.isValidUrl` */
  isValidUrl: (url: string) => boolean;
  /** URL 정규화 — 보통 `WebCrawler.normalizeUrl` */
  normalizeUrl: (url: string) => string;
  /** 상대경로 변환의 origin (보통 baseUrl 의 origin) */
  origin: string;
}

export interface CollectedLink {
  url: string;
  text: string;
}

export async function collectLinks(
  page: Page,
  options: CollectLinksOptions,
): Promise<CollectedLink[]> {
  const links = await page.$$eval(
    LINK_SELECTOR,
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
            /(?:location\.href|navigate|router\.push|goTo)\s*[=(]\s*['"]([^'"]+)['"]/,
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
    options.origin,
  );

  return links
    .filter((link) => options.isValidUrl(link.url))
    .map((link) => ({ ...link, url: options.normalizeUrl(link.url) }))
    // Unique by URL
    .filter((link, index, self) => self.findIndex((l) => l.url === link.url) === index);
}
