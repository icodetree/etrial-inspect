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

  it('should return chrome channel in production', async () => {
    (process.env as any).NODE_ENV = 'production';
    const options = await getBrowserLaunchOptions(true);
    expect(options.headless).toBe(true);
    expect(options.channel).toBe('chrome');
  });

  it('should respect headless parameter', async () => {
    (process.env as any).NODE_ENV = 'production';
    const options = await getBrowserLaunchOptions(false);
    expect(options.headless).toBe(false);
    expect(options.channel).toBe('chrome');
  });
});
