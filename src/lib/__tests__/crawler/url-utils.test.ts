/**
 * url-utils — Phase 3-1 분리 모듈 단위 테스트.
 */

import { normalizeUrl, isValidUrl, calculateDepthPath } from '../../crawler/url-utils';

describe('normalizeUrl', () => {
  test('상대경로를 baseUrl 기준 절대경로로 변환한다', () => {
    expect(normalizeUrl('/a/b', 'https://example.com/page')).toBe(
      'https://example.com/a/b',
    );
  });

  test('일반 앵커(#foo)는 제거한다', () => {
    expect(normalizeUrl('https://example.com/p#section', 'https://example.com')).toBe(
      'https://example.com/p',
    );
  });

  test('SPA 해시 라우팅(#/route, #!path)은 보존한다', () => {
    expect(normalizeUrl('https://example.com/#/users', 'https://example.com')).toBe(
      'https://example.com/#/users',
    );
    expect(normalizeUrl('https://example.com/#!path', 'https://example.com')).toBe(
      'https://example.com/#!path',
    );
  });

  test('후행 슬래시를 제거한다 (1자리 초과 시)', () => {
    expect(normalizeUrl('https://example.com/foo/', 'https://example.com')).toBe(
      'https://example.com/foo',
    );
    // origin URL 은 length > 1 이라 후행 슬래시도 제거됨 (legacy 거동 보존)
    expect(normalizeUrl('https://example.com/', 'https://example.com')).toBe(
      'https://example.com',
    );
  });

  test('잘못된 URL 은 원본 그대로 반환한다', () => {
    expect(normalizeUrl('::not-a-url::', '')).toBe('::not-a-url::');
  });
});

describe('isValidUrl', () => {
  const baseOpts = {
    baseUrl: 'https://example.com',
    baseDomain: 'example.com',
  };

  test('같은 도메인은 true', () => {
    expect(isValidUrl('https://example.com/p', baseOpts)).toBe(true);
  });

  test('다른 도메인은 false', () => {
    expect(isValidUrl('https://other.com/p', baseOpts)).toBe(false);
  });

  test('상대경로는 baseUrl 기준으로 검사된다', () => {
    expect(isValidUrl('/sub', baseOpts)).toBe(true);
  });

  test('excludePatterns 에 매치되면 false', () => {
    expect(
      isValidUrl('https://example.com/admin', {
        ...baseOpts,
        excludePatterns: [/\/admin/i],
      }),
    ).toBe(false);
  });

  test('excludePatterns 에 매치되지 않으면 true', () => {
    expect(
      isValidUrl('https://example.com/about', {
        ...baseOpts,
        excludePatterns: [/\/admin/i],
      }),
    ).toBe(true);
  });

  test('잘못된 URL 은 false', () => {
    expect(isValidUrl('::not-a-url::', { baseUrl: '', baseDomain: 'x' })).toBe(false);
  });
});

describe('calculateDepthPath', () => {
  test('빈 부모 + 현재 = depth1 만 채워진다', () => {
    expect(calculateDepthPath([], 'Home')).toEqual(['Home', '', '', '']);
  });

  test('부모 1단 + 현재 = depth1, depth2 가 채워진다', () => {
    expect(calculateDepthPath(['Home'], 'About')).toEqual(['Home', 'About', '', '']);
  });

  test('부모 3단 + 현재 = 4단계 모두 채워진다', () => {
    expect(calculateDepthPath(['L1', 'L2', 'L3'], 'L4')).toEqual([
      'L1',
      'L2',
      'L3',
      'L4',
    ]);
  });

  test('부모가 4단 이상이어도 마지막 3단 + 현재로 잘린다', () => {
    expect(calculateDepthPath(['L1', 'L2', 'L3', 'L4-orphan'], 'L4-current')).toEqual([
      'L1',
      'L2',
      'L3',
      'L4-current',
    ]);
  });
});
