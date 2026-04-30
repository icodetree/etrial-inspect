/**
 * spa-readiness — 단위 테스트
 *
 * Playwright Page 의존을 모두 모킹해 단계별 분기(노트, status, 시간)를 검증한다.
 * 실제 브라우저는 띄우지 않는다.
 */

import type { Page } from 'playwright-core';
import { waitForSpaReady, SpaReadyResult } from '../spa-readiness';

interface MockSpec {
  /** 호출 1번째: framework detection 결과 */
  detection?: { framework: SpaReadyResult['framework']; renderStrategy: SpaReadyResult['renderStrategy'] };
  /** 호출 2번째: stabilize 결과 (true=안정 / false=타임아웃) */
  stabilize?: boolean | 'throw';
  /** 호출 3번째: domNodeCount */
  nodeCount?: number;
  /** waitForLoadState networkidle 거동 */
  networkIdle?: 'ok' | 'throw';
  /** waitForFunction 거동 */
  frameworkWait?: 'ok' | 'throw';
  /** waitForSelector 거동 */
  readySelector?: 'ok' | 'throw';
}

function buildMockPage(spec: MockSpec) {
  const evalResults: unknown[] = [
    spec.detection ?? { framework: 'unknown', renderStrategy: 'unknown' },
    spec.stabilize === 'throw' ? new Error('eval throw') : (spec.stabilize ?? true),
    spec.nodeCount ?? 100,
  ];
  let evalIdx = 0;

  const evaluate = jest.fn().mockImplementation(async () => {
    const v = evalResults[evalIdx++];
    if (v instanceof Error) throw v;
    return v;
  });

  const waitForLoadState = jest.fn().mockImplementation(async () => {
    if (spec.networkIdle === 'throw') throw new Error('networkidle timeout');
    return undefined;
  });

  const waitForFunction = jest.fn().mockImplementation(async () => {
    if (spec.frameworkWait === 'throw') throw new Error('framework wait timeout');
    return undefined;
  });

  const waitForSelector = jest.fn().mockImplementation(async () => {
    if (spec.readySelector === 'throw') throw new Error('selector timeout');
    return undefined;
  });

  const page = {
    evaluate,
    waitForLoadState,
    waitForFunction,
    waitForSelector,
  } as unknown as Page;

  return { page, evaluate, waitForLoadState, waitForFunction, waitForSelector };
}

describe('waitForSpaReady', () => {
  test('정상 경로 — networkidle OK + 프레임워크 감지 + 안정화 → status=ready', async () => {
    const { page } = buildMockPage({
      detection: { framework: 'react', renderStrategy: 'CSR' },
      stabilize: true,
      nodeCount: 500,
      networkIdle: 'ok',
      frameworkWait: 'ok',
    });

    const r = await waitForSpaReady(page);

    expect(r.status).toBe('ready');
    expect(r.framework).toBe('react');
    expect(r.renderStrategy).toBe('CSR');
    expect(r.domNodeCount).toBe(500);
    expect(r.notes).not.toContain('networkidle-timeout');
    expect(r.notes).not.toContain('dom-not-stabilized');
    expect(r.hydrationMs).toBeGreaterThanOrEqual(0);
  });

  test('networkidle 타임아웃 → status=partial + note=networkidle-timeout', async () => {
    const { page } = buildMockPage({
      detection: { framework: 'next', renderStrategy: 'SSR' },
      stabilize: true,
      nodeCount: 800,
      networkIdle: 'throw',
      frameworkWait: 'ok',
    });

    const r = await waitForSpaReady(page, { networkIdleMs: 100 });

    expect(r.status).toBe('partial');
    expect(r.notes).toContain('networkidle-timeout');
    expect(r.framework).toBe('next');
  });

  test('DOM 안정화 실패 → note=dom-not-stabilized + partial', async () => {
    const { page } = buildMockPage({
      detection: { framework: 'angular', renderStrategy: 'CSR' },
      stabilize: false,
      nodeCount: 200,
      networkIdle: 'ok',
      frameworkWait: 'ok',
    });

    const r = await waitForSpaReady(page, { stabilizeMs: 50, maxWaitMs: 200 });

    expect(r.notes).toContain('dom-not-stabilized');
    expect(r.status).toBe('partial');
  });

  test('readySelector 입력 시 → waitForSelector 호출, 타임아웃이면 status=timeout', async () => {
    const { page, waitForSelector } = buildMockPage({
      detection: { framework: 'vue', renderStrategy: 'CSR' },
      stabilize: true,
      nodeCount: 300,
      networkIdle: 'ok',
      frameworkWait: 'ok',
      readySelector: 'throw',
    });

    const r = await waitForSpaReady(page, { readySelector: '#app.loaded' });

    expect(waitForSelector).toHaveBeenCalledWith(
      '#app.loaded',
      expect.objectContaining({ state: 'visible' })
    );
    expect(r.notes).toContain('ready-selector-timeout');
    expect(r.status).toBe('timeout');
  });

  test('프레임워크 unknown 인 경우 framework 별 waitForFunction 호출하지 않음', async () => {
    const { page, waitForFunction } = buildMockPage({
      detection: { framework: 'unknown', renderStrategy: 'unknown' },
      stabilize: true,
      nodeCount: 50,
      networkIdle: 'ok',
    });

    const r = await waitForSpaReady(page);

    expect(waitForFunction).not.toHaveBeenCalled();
    expect(r.framework).toBe('unknown');
  });

  test('프레임워크 감지 evaluate 가 실패해도 진행 — note=detect-failed', async () => {
    const evalSequence: unknown[] = [
      new Error('detect throw'),
      true, // stabilize
      120, // node count
    ];
    let i = 0;
    const evaluate = jest.fn().mockImplementation(async () => {
      const v = evalSequence[i++];
      if (v instanceof Error) throw v;
      return v;
    });
    const page = {
      evaluate,
      waitForLoadState: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
    } as unknown as Page;

    const r = await waitForSpaReady(page);

    expect(r.framework).toBe('unknown');
    expect(r.notes).toContain('detect-failed');
  });

  test('hydrationMs 는 0 이상의 number 로 반환된다', async () => {
    const { page } = buildMockPage({
      detection: { framework: 'react', renderStrategy: 'CSR' },
      stabilize: true,
      nodeCount: 100,
      networkIdle: 'ok',
      frameworkWait: 'ok',
    });

    const r = await waitForSpaReady(page);
    expect(typeof r.hydrationMs).toBe('number');
    expect(r.hydrationMs).toBeGreaterThanOrEqual(0);
  });
});
