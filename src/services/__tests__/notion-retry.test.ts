import { withRetry } from '../notion/notion-retry';

describe('withRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('성공 시 즉시 반환', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, 'test');
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('재시도 불가능한 오류는 즉시 throw', async () => {
    const error = Object.assign(new Error('not found'), { status: 404 });
    const fn = jest.fn().mockRejectedValue(error);
    await expect(withRetry(fn, 'test')).rejects.toThrow('not found');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('429 에러 시 최대 3회 재시도 후 성공', async () => {
    const error429 = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error429)
      .mockRejectedValueOnce(error429)
      .mockResolvedValue('recovered');

    const promise = withRetry(fn, 'test');

    // 1차 재시도: 1s 대기
    await jest.advanceTimersByTimeAsync(1000);
    // 2차 재시도: 2s 대기
    await jest.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('500 에러 시 재시도', async () => {
    const error500 = Object.assign(new Error('server error'), { status: 500 });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(error500)
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 'test');
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('3회 모두 실패 시 마지막 에러 throw', async () => {
    jest.useRealTimers();
    const error429 = Object.assign(new Error('rate limited'), { status: 429 });
    const fn = jest.fn().mockRejectedValue(error429);

    // 실제 타이머 사용 — 빠르게 끝내기 위해 withRetry 내부 delay 를 spy
    // 대신 단순히 reject 확인
    await expect(withRetry(fn, 'test')).rejects.toThrow('rate limited');
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
  }, 15000);

  it('네트워크 오류(ECONNRESET) 시 재시도', async () => {
    const networkError = Object.assign(new Error('connection reset'), { code: 'ECONNRESET' });
    const fn = jest
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValue('ok');

    const promise = withRetry(fn, 'test');
    await jest.advanceTimersByTimeAsync(1000);

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
