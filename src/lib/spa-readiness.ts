import { Page } from 'playwright-core';

export type SpaFramework =
  | 'react'
  | 'next'
  | 'vue'
  | 'nuxt'
  | 'angular'
  | 'unknown';

export type RenderStrategy = 'CSR' | 'SSR' | 'SSG' | 'unknown';

export type SpaReadyStatus = 'ready' | 'partial' | 'timeout';

export interface SpaReadyResult {
  framework: SpaFramework;
  renderStrategy: RenderStrategy;
  hydrationMs: number;
  domNodeCount: number;
  status: SpaReadyStatus;
  notes: string[];
}

export interface SpaReadyOptions {
  readySelector?: string;
  networkIdleMs?: number;
  stabilizeMs?: number;
  maxWaitMs?: number;
}

interface FrameworkDetection {
  framework: SpaFramework;
  renderStrategy: RenderStrategy;
}

/**
 * 페이지 컨텍스트에서 프레임워크와 렌더 전략을 감지한다.
 * page.evaluate 로 직렬화 가능해야 하므로 외부 클로저 참조 없이 self-contained.
 */
function detectFrameworkInPage(): FrameworkDetection {
  const w = window as unknown as Record<string, unknown>;
  const doc = document;

  let framework: 'react' | 'next' | 'vue' | 'nuxt' | 'angular' | 'unknown' = 'unknown';
  let renderStrategy: 'CSR' | 'SSR' | 'SSG' | 'unknown' = 'unknown';

  const nextDataEl = doc.getElementById('__NEXT_DATA__');
  if (nextDataEl || w.__NEXT_DATA__ || w.next) {
    framework = 'next';
    renderStrategy = 'SSR';
    return { framework, renderStrategy };
  }

  if (w.__NUXT__ || w.$nuxt) {
    framework = 'nuxt';
    renderStrategy = 'SSR';
    return { framework, renderStrategy };
  }

  if (doc.querySelector('[ng-version]') || doc.querySelector('app-root')) {
    framework = 'angular';
    renderStrategy = 'CSR';
    return { framework, renderStrategy };
  }

  if (
    doc.querySelector('[data-server-rendered]') ||
    w.__VUE__ ||
    (w as { __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__VUE_DEVTOOLS_GLOBAL_HOOK__
  ) {
    framework = 'vue';
    renderStrategy = doc.querySelector('[data-server-rendered]') ? 'SSR' : 'CSR';
    return { framework, renderStrategy };
  }

  const reactRoot = doc.getElementById('root');
  if (
    doc.querySelector('[data-reactroot]') ||
    (reactRoot && reactRoot.children.length > 0) ||
    (w as { React?: unknown }).React ||
    (w as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__
  ) {
    framework = 'react';
    renderStrategy = 'CSR';
    return { framework, renderStrategy };
  }

  return { framework, renderStrategy };
}

/**
 * SPA 렌더링 완료를 기다린다.
 * 호출자는 이미 page.goto(url, { waitUntil: 'domcontentloaded' }) 후여야 한다.
 */
export async function waitForSpaReady(
  page: Page,
  opts: SpaReadyOptions = {}
): Promise<SpaReadyResult> {
  const networkIdleMs = opts.networkIdleMs ?? 15000;
  const stabilizeMs = opts.stabilizeMs ?? 800;
  const maxWaitMs = opts.maxWaitMs ?? 30000;

  const startedAt = Date.now();
  const notes: string[] = [];
  let status: SpaReadyStatus = 'ready';

  // 1) networkidle best-effort
  try {
    await page.waitForLoadState('networkidle', { timeout: networkIdleMs });
  } catch {
    notes.push('networkidle-timeout');
    status = 'partial';
  }

  // 2) 프레임워크 감지
  let detection: FrameworkDetection = { framework: 'unknown', renderStrategy: 'unknown' };
  try {
    detection = await page.evaluate(detectFrameworkInPage);
  } catch {
    notes.push('detect-failed');
  }
  const { framework, renderStrategy } = detection;

  // 3) 프레임워크별 2차 대기 — 짧은 timeout, 실패해도 진행
  const remainingForFramework = Math.max(2000, maxWaitMs - (Date.now() - startedAt));
  const secondWaitMs = Math.min(8000, remainingForFramework);
  try {
    if (framework === 'next') {
      await page.waitForFunction(
        () => !!document.querySelector('#__next > *, [data-nextjs-router-tree-info]'),
        undefined,
        { timeout: secondWaitMs }
      );
    } else if (framework === 'react') {
      await page.waitForFunction(
        () => {
          const root = document.getElementById('root');
          return !!(
            (root && root.children.length > 0) ||
            document.querySelector('[data-reactroot] > *')
          );
        },
        undefined,
        { timeout: secondWaitMs }
      );
    } else if (framework === 'angular') {
      await page.waitForFunction(
        () => {
          const root = document.querySelector('app-root, [ng-version]');
          return !!(root && root.children.length > 0);
        },
        undefined,
        { timeout: secondWaitMs }
      );
    } else if (framework === 'vue' || framework === 'nuxt') {
      await page.waitForFunction(
        () => {
          const w = window as unknown as Record<string, unknown>;
          return !!(
            w.__VUE__ ||
            w.__NUXT__ ||
            (w as { __VUE_DEVTOOLS_GLOBAL_HOOK__?: unknown }).__VUE_DEVTOOLS_GLOBAL_HOOK__ ||
            document.querySelector('[data-server-rendered], #__nuxt > *, #app > *')
          );
        },
        undefined,
        { timeout: secondWaitMs }
      );
    }
  } catch {
    notes.push('framework-wait-timeout');
    status = status === 'ready' ? 'partial' : status;
  }

  // 4) DOM mutation 안정화 — 본문을 evaluate 안에서 self-contained 로 실행
  const remainingForStable = Math.max(stabilizeMs + 200, maxWaitMs - (Date.now() - startedAt));
  try {
    const stable = await page.evaluate(
      ({ stabilizeMs: s, maxWaitMs: m }) => {
        return new Promise<boolean>((resolve) => {
          let timer: ReturnType<typeof setTimeout> | null = null;
          let settled = false;

          const finish = (ok: boolean) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            observer.disconnect();
            resolve(ok);
          };

          const reset = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => finish(true), s);
          };

          const observer = new MutationObserver(reset);
          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });
          reset();
          setTimeout(() => finish(false), m);
        });
      },
      { stabilizeMs, maxWaitMs: remainingForStable }
    );
    if (stable === false) {
      notes.push('dom-not-stabilized');
      status = status === 'ready' ? 'partial' : status;
    }
  } catch {
    notes.push('stabilize-failed');
  }

  // 5) 사용자 readySelector
  if (opts.readySelector) {
    const remaining = Math.max(2000, maxWaitMs - (Date.now() - startedAt));
    try {
      await page.waitForSelector(opts.readySelector, {
        state: 'visible',
        timeout: remaining,
      });
    } catch {
      notes.push('ready-selector-timeout');
      status = 'timeout';
    }
  }

  // DOM 노드 카운트
  let domNodeCount = 0;
  try {
    domNodeCount = await page.evaluate(() => document.getElementsByTagName('*').length);
  } catch {
    notes.push('node-count-failed');
  }

  return {
    framework,
    renderStrategy,
    hydrationMs: Date.now() - startedAt,
    domNodeCount,
    status,
    notes,
  };
}
