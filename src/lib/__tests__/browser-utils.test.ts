/* eslint-disable @typescript-eslint/no-explicit-any */
import { getBrowserLaunchOptions } from '../browser-utils';

describe('getBrowserLaunchOptions', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
  });

  it('should return default options in development', async () => {
    (process.env as any).NODE_ENV = 'development';
    const options = await getBrowserLaunchOptions(true);
    expect(options.headless).toBe(true);
    expect(options.channel).toBeUndefined();
  });

  // playwright 패키지가 devDependency 로 설치되어 있으면 executablePath 가 우선되고 channel 은 사용되지 않는다.
  // channel:'chrome' 폴백 분기는 require('playwright') 가 실패할 때만 진입한다 (별도 테스트 트랙).
  it('should use playwright executablePath, not chrome channel, when playwright is available', async () => {
    (process.env as any).NODE_ENV = 'production';
    const options = await getBrowserLaunchOptions(true);
    expect(options.headless).toBe(true);
    expect(options.channel).toBeUndefined();
    expect(options.executablePath).toBeDefined();
  });

  it('should respect headless parameter', async () => {
    (process.env as any).NODE_ENV = 'production';
    const options = await getBrowserLaunchOptions(false);
    expect(options.headless).toBe(false);
    expect(options.executablePath).toBeDefined();
  });
});
