/**
 * fetchSitemapUrls — Phase 3-1 분리 모듈 단위 테스트.
 *
 * `fetch` 를 모킹해 다음을 검증한다:
 *  - robots.txt 의 Sitemap: 줄을 파싱한다.
 *  - robots.txt 가 없거나 Sitemap: 줄이 없으면 /sitemap.xml fallback 이 동작한다.
 *  - <urlset><url><loc> 패턴에서 URL 을 추출한다.
 *  - <sitemapindex> 가 있으면 재귀적으로 처리한다 (최대 깊이 2).
 *  - isValidUrl 콜백으로 결과가 필터링된다.
 *  - 잘못된 XML / 404 / fetch 실패 등은 silent 하게 빈 결과로 처리된다.
 */

import { fetchSitemapUrls } from '../../crawler/sitemap';

type FetchHandler = (url: string) => Response | null | Promise<Response | null>;

function buildFetchImpl(handler: FetchHandler): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const result = await handler(url);
    if (!result) {
      // 404 시뮬레이션
      return new Response('', { status: 404 });
    }
    return result;
  }) as unknown as typeof fetch;
}

const acceptAll = () => true;

describe('fetchSitemapUrls', () => {
  test('robots.txt 의 Sitemap: 줄에서 sitemap 경로를 추출하고 urlset 을 파싱한다', async () => {
    const fetchImpl = buildFetchImpl((url) => {
      if (url.endsWith('/robots.txt')) {
        return new Response(
          'User-agent: *\nDisallow: /admin\nSitemap: https://example.com/custom-sitemap.xml\n',
          { status: 200 },
        );
      }
      if (url === 'https://example.com/custom-sitemap.xml') {
        return new Response(
          `<?xml version="1.0"?>
           <urlset>
             <url><loc>https://example.com/a</loc></url>
             <url><loc>https://example.com/b</loc></url>
           </urlset>`,
          { status: 200 },
        );
      }
      return null;
    });

    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: acceptAll,
      fetchImpl,
    });

    expect(urls.sort()).toEqual([
      'https://example.com/a',
      'https://example.com/b',
    ]);
  });

  test('robots.txt 에 Sitemap 줄이 없으면 /sitemap.xml 을 fallback 으로 시도한다', async () => {
    const fetchImpl = buildFetchImpl((url) => {
      if (url.endsWith('/robots.txt')) {
        return new Response('User-agent: *\nDisallow:\n', { status: 200 });
      }
      if (url === 'https://example.com/sitemap.xml') {
        return new Response(
          `<urlset><url><loc>https://example.com/fallback</loc></url></urlset>`,
          { status: 200 },
        );
      }
      return null;
    });

    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: acceptAll,
      fetchImpl,
    });

    expect(urls).toEqual(['https://example.com/fallback']);
  });

  test('robots.txt 가 404 이어도 /sitemap.xml fallback 이 시도된다', async () => {
    const fetchImpl = buildFetchImpl((url) => {
      if (url === 'https://example.com/sitemap.xml') {
        return new Response(
          `<urlset><url><loc>https://example.com/only</loc></url></urlset>`,
          { status: 200 },
        );
      }
      return null; // robots.txt 등 그 외 404
    });

    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: acceptAll,
      fetchImpl,
    });

    expect(urls).toEqual(['https://example.com/only']);
  });

  test('sitemapindex 를 재귀적으로 따라간다', async () => {
    const fetchImpl = buildFetchImpl((url) => {
      if (url.endsWith('/robots.txt')) {
        return new Response('Sitemap: https://example.com/sitemap-index.xml\n', { status: 200 });
      }
      if (url === 'https://example.com/sitemap-index.xml') {
        return new Response(
          `<sitemapindex>
             <sitemap><loc>https://example.com/sub1.xml</loc></sitemap>
             <sitemap><loc>https://example.com/sub2.xml</loc></sitemap>
           </sitemapindex>`,
          { status: 200 },
        );
      }
      if (url === 'https://example.com/sub1.xml') {
        return new Response(
          `<urlset><url><loc>https://example.com/p1</loc></url></urlset>`,
          { status: 200 },
        );
      }
      if (url === 'https://example.com/sub2.xml') {
        return new Response(
          `<urlset>
             <url><loc>https://example.com/p2</loc></url>
             <url><loc>https://example.com/p3</loc></url>
           </urlset>`,
          { status: 200 },
        );
      }
      return null;
    });

    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: acceptAll,
      fetchImpl,
    });

    expect(urls.sort()).toEqual([
      'https://example.com/p1',
      'https://example.com/p2',
      'https://example.com/p3',
    ]);
  });

  test('isValidUrl 로 결과가 필터링된다 (외부 도메인 제외 등)', async () => {
    const fetchImpl = buildFetchImpl((url) => {
      if (url.endsWith('/robots.txt')) {
        return new Response('Sitemap: https://example.com/sitemap.xml\n', { status: 200 });
      }
      if (url === 'https://example.com/sitemap.xml') {
        return new Response(
          `<urlset>
             <url><loc>https://example.com/keep</loc></url>
             <url><loc>https://other.com/discard</loc></url>
           </urlset>`,
          { status: 200 },
        );
      }
      return null;
    });

    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: (u) => u.startsWith('https://example.com'),
      fetchImpl,
    });

    expect(urls).toEqual(['https://example.com/keep']);
  });

  test('sitemap XML 이 깨졌어도 throw 하지 않고 빈 배열을 반환한다', async () => {
    const fetchImpl = buildFetchImpl((url) => {
      if (url.endsWith('/robots.txt')) {
        return new Response('Sitemap: https://example.com/bad.xml\n', { status: 200 });
      }
      if (url === 'https://example.com/bad.xml') {
        return new Response('not-xml-at-all', { status: 200 });
      }
      return null;
    });

    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: acceptAll,
      fetchImpl,
    });
    consoleWarn.mockRestore();

    expect(urls).toEqual([]);
  });

  test('fetch 가 throw 해도 함수는 throw 하지 않는다', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const urls = await fetchSitemapUrls('https://example.com', {
      isValidUrl: acceptAll,
      fetchImpl,
    });

    expect(urls).toEqual([]);
  });
});
