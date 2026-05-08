/**
 * Memory Monitor Utility
 *
 * 대규모 크롤링 시 메모리 사용량을 모니터링하고, 임계치를 초과하면
 * 동시성을 줄이거나 경고를 발생시키는 유틸리티.
 */

/** 힙 사용량 경고 임계값 (MB) — 이 값 이상이면 동시성 축소 권장 */
export const HEAP_WARNING_MB = 512;

/** 힙 사용량 위험 임계값 (MB) — 이 값 이상이면 즉시 조치 필요 */
export const HEAP_CRITICAL_MB = 768;

/** 기본 동시성 축소 임계값 (MB) */
const DEFAULT_THRESHOLD_MB = HEAP_WARNING_MB;

export interface MemoryUsageMB {
  heapUsed: number;
  rss: number;
  external: number;
}

/**
 * 현재 프로세스의 메모리 사용량을 MB 단위로 반환한다.
 */
export function getMemoryUsageMB(): MemoryUsageMB {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round((usage.heapUsed / 1024 / 1024) * 100) / 100,
    rss: Math.round((usage.rss / 1024 / 1024) * 100) / 100,
    external: Math.round((usage.external / 1024 / 1024) * 100) / 100,
  };
}

/**
 * 힙 사용량이 임계값을 초과하면 true 를 반환한다.
 * 워커 루프에서 호출하여 동시성을 줄일지 판단한다.
 *
 * @param thresholdMB - 임계값 (MB). 기본값 512MB.
 */
export function shouldReduceConcurrency(thresholdMB: number = DEFAULT_THRESHOLD_MB): boolean {
  const usage = process.memoryUsage();
  const heapUsedMB = usage.heapUsed / 1024 / 1024;
  return heapUsedMB >= thresholdMB;
}

/**
 * 현재 메모리 상태를 로그로 출력한다.
 * 디버깅 및 성능 모니터링용.
 *
 * @param label - 로그 접두어 (예: 'crawl-start', 'page-100')
 */
export function logMemorySnapshot(label: string): void {
  const mem = getMemoryUsageMB();
  const level = mem.heapUsed >= HEAP_CRITICAL_MB
    ? 'CRITICAL'
    : mem.heapUsed >= HEAP_WARNING_MB
      ? 'WARNING'
      : 'OK';
  console.log(
    `[Memory:${level}] ${label} — heap: ${mem.heapUsed}MB, rss: ${mem.rss}MB, external: ${mem.external}MB`,
  );
}
