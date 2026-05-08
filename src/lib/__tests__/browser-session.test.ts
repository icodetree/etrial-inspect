/**
 * browser-session.ts 단위 테스트
 *
 * Playwright 와 browser-utils 를 mock 하여 openBrowserSession 의
 * 생성/정리 흐름을 검증한다.
 */

// playwright-core mock
const mockClose = jest.fn().mockResolvedValue(undefined);
const mockAddInitScript = jest.fn().mockResolvedValue(undefined);
const mockNewContext = jest.fn().mockResolvedValue({
  close: mockClose,
  addInitScript: mockAddInitScript,
});
const mockBrowserClose = jest.fn().mockResolvedValue(undefined);
const mockLaunch = jest.fn().mockResolvedValue({
  newContext: mockNewContext,
  close: mockBrowserClose,
});

jest.mock('playwright-core', () => ({
  chromium: { launch: mockLaunch },
}));

// browser-utils mock
const mockGetBrowserLaunchOptions = jest.fn().mockResolvedValue({ headless: true });
const mockGetStealthContextOptions = jest.fn().mockReturnValue({
  viewport: { width: 1920, height: 1080 },
  userAgent: 'mock-agent',
});
const MOCK_STEALTH_SCRIPT = '// stealth';

jest.mock('../browser-utils', () => ({
  getBrowserLaunchOptions: mockGetBrowserLaunchOptions,
  getStealthContextOptions: mockGetStealthContextOptions,
  STEALTH_INIT_SCRIPT: MOCK_STEALTH_SCRIPT,
}));

// fs mock — existsSync 만 mock
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(false),
}));

import { openBrowserSession } from '../browser-session';
import * as fs from 'fs';

describe('openBrowserSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
  });

  test('기본 호출 시 browser + context + close 를 반환한다', async () => {
    const session = await openBrowserSession();
    expect(session).toHaveProperty('browser');
    expect(session).toHaveProperty('context');
    expect(session).toHaveProperty('close');
    expect(typeof session.close).toBe('function');
  });

  test('chromium.launch 가 headless 옵션으로 호출된다', async () => {
    await openBrowserSession({ isHeadless: true });
    expect(mockGetBrowserLaunchOptions).toHaveBeenCalledWith(true);
    expect(mockLaunch).toHaveBeenCalled();
  });

  test('isHeadless 기본값은 true', async () => {
    await openBrowserSession();
    expect(mockGetBrowserLaunchOptions).toHaveBeenCalledWith(true);
  });

  test('isHeadless=false 전달 시 false 로 호출', async () => {
    await openBrowserSession({ isHeadless: false });
    expect(mockGetBrowserLaunchOptions).toHaveBeenCalledWith(false);
  });

  test('stealth init script 가 context 에 추가된다', async () => {
    await openBrowserSession();
    expect(mockAddInitScript).toHaveBeenCalledWith(MOCK_STEALTH_SCRIPT);
  });

  test('viewport 옵션이 context 에 전달된다', async () => {
    await openBrowserSession({ viewport: { width: 1280, height: 720 } });
    expect(mockNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        viewport: { width: 1280, height: 720 },
      }),
    );
  });

  test('storageStatePath 가 존재하면 context 옵션에 포함된다', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    await openBrowserSession({ storageStatePath: '/tmp/auth.json' });
    expect(mockNewContext).toHaveBeenCalledWith(
      expect.objectContaining({
        storageState: '/tmp/auth.json',
      }),
    );
  });

  test('storageStatePath 파일이 없으면 storageState 미포함', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    await openBrowserSession({ storageStatePath: '/tmp/missing.json' });
    const callArgs = mockNewContext.mock.calls[0][0];
    expect(callArgs.storageState).toBeUndefined();
  });

  describe('session.close()', () => {
    test('close 호출 시 context.close + browser.close 가 호출된다', async () => {
      const session = await openBrowserSession();
      await session.close();
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockBrowserClose).toHaveBeenCalledTimes(1);
    });

    test('close 를 여러 번 호출해도 안전하다 (idempotent)', async () => {
      const session = await openBrowserSession();
      await session.close();
      await session.close();
      // 두 번째 호출에서는 실제 close 가 다시 호출되지 않아야 함
      expect(mockClose).toHaveBeenCalledTimes(1);
      expect(mockBrowserClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('에러 핸들링', () => {
    test('newContext 실패 시 browser.close 가 호출되고 에러 전파', async () => {
      const contextError = new Error('context creation failed');
      mockNewContext.mockRejectedValueOnce(contextError);

      await expect(openBrowserSession()).rejects.toThrow('context creation failed');
      expect(mockBrowserClose).toHaveBeenCalledTimes(1);
    });

    test('newContext 실패 시 browser.close 자체가 실패해도 원래 에러 전파', async () => {
      mockNewContext.mockRejectedValueOnce(new Error('context failed'));
      mockBrowserClose.mockRejectedValueOnce(new Error('browser close failed'));

      await expect(openBrowserSession()).rejects.toThrow('context failed');
    });
  });
});
