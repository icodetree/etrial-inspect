import {
  getMemoryUsageMB,
  shouldReduceConcurrency,
  logMemorySnapshot,
  HEAP_WARNING_MB,
  HEAP_CRITICAL_MB,
} from '../memory-monitor';

describe('memory-monitor', () => {
  describe('getMemoryUsageMB', () => {
    it('heapUsed / rss / external 을 양수 MB 값으로 반환한다', () => {
      const mem = getMemoryUsageMB();
      expect(mem.heapUsed).toBeGreaterThan(0);
      expect(mem.rss).toBeGreaterThan(0);
      expect(mem.external).toBeGreaterThanOrEqual(0);
    });

    it('소수점 2자리까지 반올림된 값을 반환한다', () => {
      const mem = getMemoryUsageMB();
      // 소수점 2자리까지만 있는지 확인
      const decimals = (n: number) => {
        const s = n.toString();
        const dot = s.indexOf('.');
        return dot === -1 ? 0 : s.length - dot - 1;
      };
      expect(decimals(mem.heapUsed)).toBeLessThanOrEqual(2);
      expect(decimals(mem.rss)).toBeLessThanOrEqual(2);
      expect(decimals(mem.external)).toBeLessThanOrEqual(2);
    });
  });

  describe('shouldReduceConcurrency', () => {
    const originalMemoryUsage = process.memoryUsage;

    afterEach(() => {
      process.memoryUsage = originalMemoryUsage;
    });

    it('힙 사용량이 기본 임계값(512MB) 미만이면 false 반환', () => {
      process.memoryUsage = (() => ({
        heapUsed: 400 * 1024 * 1024, // 400MB
        heapTotal: 600 * 1024 * 1024,
        rss: 500 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      expect(shouldReduceConcurrency()).toBe(false);
    });

    it('힙 사용량이 기본 임계값(512MB) 이상이면 true 반환', () => {
      process.memoryUsage = (() => ({
        heapUsed: 600 * 1024 * 1024, // 600MB
        heapTotal: 800 * 1024 * 1024,
        rss: 700 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      expect(shouldReduceConcurrency()).toBe(true);
    });

    it('커스텀 임계값을 지정할 수 있다', () => {
      process.memoryUsage = (() => ({
        heapUsed: 300 * 1024 * 1024, // 300MB
        heapTotal: 600 * 1024 * 1024,
        rss: 400 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      expect(shouldReduceConcurrency(200)).toBe(true);
      expect(shouldReduceConcurrency(400)).toBe(false);
    });

    it('정확히 임계값과 같은 힙 사용량이면 true 반환', () => {
      process.memoryUsage = (() => ({
        heapUsed: HEAP_WARNING_MB * 1024 * 1024,
        heapTotal: 800 * 1024 * 1024,
        rss: 700 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      expect(shouldReduceConcurrency()).toBe(true);
    });
  });

  describe('logMemorySnapshot', () => {
    const originalMemoryUsage = process.memoryUsage;

    afterEach(() => {
      process.memoryUsage = originalMemoryUsage;
    });

    it('OK 레벨로 로그를 출력한다 (힙 < 512MB)', () => {
      process.memoryUsage = (() => ({
        heapUsed: 200 * 1024 * 1024,
        heapTotal: 400 * 1024 * 1024,
        rss: 300 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      const spy = jest.spyOn(console, 'log').mockImplementation();
      logMemorySnapshot('test-ok');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[Memory:OK] test-ok'),
      );
      spy.mockRestore();
    });

    it('WARNING 레벨로 로그를 출력한다 (512MB <= 힙 < 768MB)', () => {
      process.memoryUsage = (() => ({
        heapUsed: 600 * 1024 * 1024,
        heapTotal: 800 * 1024 * 1024,
        rss: 700 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      const spy = jest.spyOn(console, 'log').mockImplementation();
      logMemorySnapshot('test-warn');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[Memory:WARNING] test-warn'),
      );
      spy.mockRestore();
    });

    it('CRITICAL 레벨로 로그를 출력한다 (힙 >= 768MB)', () => {
      process.memoryUsage = (() => ({
        heapUsed: 800 * 1024 * 1024,
        heapTotal: 1024 * 1024 * 1024,
        rss: 900 * 1024 * 1024,
        external: 10 * 1024 * 1024,
        arrayBuffers: 5 * 1024 * 1024,
      })) as typeof process.memoryUsage;

      const spy = jest.spyOn(console, 'log').mockImplementation();
      logMemorySnapshot('test-critical');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('[Memory:CRITICAL] test-critical'),
      );
      spy.mockRestore();
    });
  });

  describe('constants', () => {
    it('HEAP_WARNING_MB 가 HEAP_CRITICAL_MB 보다 작다', () => {
      expect(HEAP_WARNING_MB).toBeLessThan(HEAP_CRITICAL_MB);
    });

    it('HEAP_WARNING_MB = 512, HEAP_CRITICAL_MB = 768', () => {
      expect(HEAP_WARNING_MB).toBe(512);
      expect(HEAP_CRITICAL_MB).toBe(768);
    });
  });
});
