/**
 * link-collector — Phase 3-1 분리 모듈 단위 테스트.
 *
 * Playwright `Page.$$eval` 을 모킹해 다음을 검증한다:
 *  - 다양한 selector(`a[href]`, `[data-href]`, `[role="link"]` 등) 가 한 번에 호출된다.
 *  - isValidUrl / normalizeUrl 콜백이 호출되어 결과가 필터링/정규화된다.
 *  - 중복 URL 은 첫 번째만 남고 제거된다.
 */

import type { Page } from 'playwright-core';
import { collectLinks } from '../../crawler/link-collector';

interface MockPage {
  $$eval: jest.Mock;
}

describe('collectLinks', () => {
  test('단일 selector 호출로 모든 링크 패턴을 한 번에 가져온다', async () => {
    const page: MockPage = {
      $$eval: jest.fn().mockResolvedValue([]),
    };

    await collectLinks(page as unknown as Page, {
      isValidUrl: () => true,
      normalizeUrl: (u) => u,
      origin: 'https://example.com',
    });

    expect(page.$$eval).toHaveBeenCalledTimes(1);
    const selector = page.$$eval.mock.calls[0][0] as string;
    expect(selector).toContain('a[href]');
    expect(selector).toContain('data-href');
    expect(selector).toContain('data-to');
    expect(selector).toContain('data-route');
    expect(selector).toContain('role="link"');
  });

  test('isValidUrl=false 인 링크는 결과에서 제외된다', async () => {
    const page: MockPage = {
      $$eval: jest.fn().mockResolvedValue([
        { url: 'https://example.com/keep', text: 'keep' },
        { url: 'https://other.com/discard', text: 'discard' },
      ]),
    };

    const result = await collectLinks(page as unknown as Page, {
      isValidUrl: (u) => u.startsWith('https://example.com'),
      normalizeUrl: (u) => u,
      origin: 'https://example.com',
    });

    expect(result).toHaveLength(1);
    expect(result[0].url).toBe('https://example.com/keep');
  });

  test('normalizeUrl 콜백이 결과 URL 에 적용된다', async () => {
    const page: MockPage = {
      $$eval: jest.fn().mockResolvedValue([
        { url: 'https://example.com/A/', text: 'a' },
      ]),
    };

    const result = await collectLinks(page as unknown as Page, {
      isValidUrl: () => true,
      normalizeUrl: (u) => u.toLowerCase().replace(/\/$/, ''),
      origin: 'https://example.com',
    });

    expect(result[0].url).toBe('https://example.com/a');
  });

  test('중복 URL 은 첫 번째만 남는다', async () => {
    const page: MockPage = {
      $$eval: jest.fn().mockResolvedValue([
        { url: 'https://example.com/dup', text: 'first' },
        { url: 'https://example.com/dup', text: 'second' },
        { url: 'https://example.com/uniq', text: 'third' },
      ]),
    };

    const result = await collectLinks(page as unknown as Page, {
      isValidUrl: () => true,
      normalizeUrl: (u) => u,
      origin: 'https://example.com',
    });

    expect(result).toHaveLength(2);
    expect(result.map((l) => l.text)).toEqual(['first', 'third']);
  });

  test('origin 인자가 $$eval 의 두 번째 인자로 그대로 전달된다', async () => {
    const page: MockPage = {
      $$eval: jest.fn().mockResolvedValue([]),
    };

    await collectLinks(page as unknown as Page, {
      isValidUrl: () => true,
      normalizeUrl: (u) => u,
      origin: 'https://my-origin.example/',
    });

    expect(page.$$eval.mock.calls[0][2]).toBe('https://my-origin.example/');
  });
});
