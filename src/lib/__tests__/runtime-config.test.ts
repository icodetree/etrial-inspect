/**
 * runtime-config.ts 단위 테스트
 *
 * 환경변수에 따른 RuntimeProfile 반환 값과 buildExcludePatterns 유틸을 검증한다.
 */
import {
  getRuntimeProfile,
  isServerlessEnvironment,
  buildExcludePatterns,
  type RuntimeProfile,
} from '../runtime-config';

describe('runtime-config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // 각 테스트마다 깨끗한 env 사용
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isServerlessEnvironment', () => {
    test('VERCEL=1 이면 true', () => {
      process.env.VERCEL = '1';
      expect(isServerlessEnvironment()).toBe(true);
    });

    test('AWS_LAMBDA_FUNCTION_NAME 설정 시 true', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'my-function';
      expect(isServerlessEnvironment()).toBe(true);
    });

    test('둘 다 없으면 false', () => {
      expect(isServerlessEnvironment()).toBe(false);
    });

    test('VERCEL=0 이면 false (문자열 "1" 만 매칭)', () => {
      process.env.VERCEL = '0';
      expect(isServerlessEnvironment()).toBe(false);
    });
  });

  describe('getRuntimeProfile — serverless 환경', () => {
    let profile: RuntimeProfile;

    beforeEach(() => {
      process.env.VERCEL = '1';
      profile = getRuntimeProfile();
    });

    test('kind 가 "serverless"', () => {
      expect(profile.kind).toBe('serverless');
    });

    test('isServerless 가 true', () => {
      expect(profile.isServerless).toBe(true);
    });

    test('maxDepth 가 2 (보수적)', () => {
      expect(profile.maxDepth).toBe(2);
    });

    test('maxPages 가 5', () => {
      expect(profile.maxPages).toBe(5);
    });

    test('crawlConcurrency 가 1', () => {
      expect(profile.crawlConcurrency).toBe(1);
    });

    test('gotoTimeoutMs 가 30000', () => {
      expect(profile.gotoTimeoutMs).toBe(30000);
    });
  });

  describe('getRuntimeProfile — Lambda 환경', () => {
    test('AWS_LAMBDA_FUNCTION_NAME 설정 시에도 serverless 프로파일', () => {
      process.env.AWS_LAMBDA_FUNCTION_NAME = 'audit-handler';
      const profile = getRuntimeProfile();
      expect(profile.kind).toBe('serverless');
      expect(profile.isServerless).toBe(true);
      expect(profile.maxDepth).toBe(2);
    });
  });

  describe('getRuntimeProfile — local 환경', () => {
    let profile: RuntimeProfile;

    beforeEach(() => {
      profile = getRuntimeProfile();
    });

    test('kind 가 "local"', () => {
      expect(profile.kind).toBe('local');
    });

    test('isServerless 가 false', () => {
      expect(profile.isServerless).toBe(false);
    });

    test('maxDepth 가 10 (풀 트래버설)', () => {
      expect(profile.maxDepth).toBe(10);
    });

    test('maxPages 가 1000', () => {
      expect(profile.maxPages).toBe(1000);
    });

    test('crawlConcurrency 가 3', () => {
      expect(profile.crawlConcurrency).toBe(3);
    });

    test('gotoTimeoutMs 가 60000', () => {
      expect(profile.gotoTimeoutMs).toBe(60000);
    });
  });

  describe('getRuntimeProfile — serverless vs local 대비', () => {
    test('serverless 의 maxDepth/maxPages 가 local 보다 작다', () => {
      process.env.VERCEL = '1';
      const serverless = getRuntimeProfile();
      delete process.env.VERCEL;
      const local = getRuntimeProfile();

      expect(serverless.maxDepth).toBeLessThan(local.maxDepth);
      expect(serverless.maxPages).toBeLessThan(local.maxPages);
      expect(serverless.crawlConcurrency).toBeLessThan(local.crawlConcurrency);
      expect(serverless.gotoTimeoutMs).toBeLessThan(local.gotoTimeoutMs);
    });
  });

  describe('buildExcludePatterns', () => {
    test('undefined 입력 시 빈 배열 반환', () => {
      expect(buildExcludePatterns(undefined)).toEqual([]);
    });

    test('빈 문자열 입력 시 빈 배열 반환', () => {
      expect(buildExcludePatterns('')).toEqual([]);
    });

    test('줄바꿈으로 구분된 문자열을 RegExp 배열로 변환', () => {
      const patterns = buildExcludePatterns('/admin\n/login');
      expect(patterns).toHaveLength(2);
      expect(patterns[0]).toBeInstanceOf(RegExp);
      expect(patterns[1]).toBeInstanceOf(RegExp);
    });

    test('문자열 배열 입력도 처리', () => {
      const patterns = buildExcludePatterns(['/admin', '/login']);
      expect(patterns).toHaveLength(2);
    });

    test('path 경계에서만 매칭 — /admin 이 /administration 을 매칭하지 않음', () => {
      const patterns = buildExcludePatterns('/admin');
      expect(patterns[0].test('/admin')).toBe(true);
      expect(patterns[0].test('/admin/')).toBe(true);
      expect(patterns[0].test('/admin?foo=1')).toBe(true);
      expect(patterns[0].test('/administration')).toBe(false);
    });

    test('대소문자 무시 (case-insensitive)', () => {
      const patterns = buildExcludePatterns('/Admin');
      expect(patterns[0].test('/admin')).toBe(true);
      expect(patterns[0].test('/ADMIN/')).toBe(true);
    });

    test('빈 줄은 필터링', () => {
      const patterns = buildExcludePatterns('/admin\n\n  \n/login');
      expect(patterns).toHaveLength(2);
    });

    test('정규식 메타문자가 이스케이프 된다', () => {
      const patterns = buildExcludePatterns('/path.with.dots');
      // . 이 이스케이프되어 리터럴 . 만 매칭
      expect(patterns[0].test('/path.with.dots')).toBe(true);
      expect(patterns[0].test('/pathXwithXdots')).toBe(false);
    });

    test('공백이 트리밍된다', () => {
      const patterns = buildExcludePatterns('  /admin  \n  /login  ');
      expect(patterns).toHaveLength(2);
      expect(patterns[0].test('/admin')).toBe(true);
    });
  });
});
