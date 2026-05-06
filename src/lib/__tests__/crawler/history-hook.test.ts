/**
 * installHistoryHook — Phase 3-1 분리 모듈 단위 테스트.
 *
 * `BrowserContext` 를 모킹해 다음을 검증한다:
 *  - exposeBinding 이 항상 `__captureRoute` 이름으로 호출된다 (page-side 와 계약).
 *  - addInitScript 가 정확히 1 회 호출되고, init script 본문이 history.pushState/
 *    replaceState/popstate/hashchange 모두를 wrap 하는 코드를 포함한다.
 *  - exposeBinding 에 등록된 콜백이 호출되면 `getSink()` 가 반환한 sink 가 호출된다.
 *  - exposeBinding 실패 시 함수는 throw 하지 않고 false 를 반환한다 (best-effort).
 */

import type { BrowserContext } from 'playwright-core';
import { installHistoryHook } from '../../crawler/history-hook';

type ExposeBindingCallback = (source: unknown, ...args: unknown[]) => void;

interface MockContext {
  exposeBinding: jest.Mock;
  addInitScript: jest.Mock;
  capturedBindingCallback?: ExposeBindingCallback;
  capturedInitScript?: string | (() => void);
}

function buildMockContext(): MockContext {
  const m: MockContext = {
    exposeBinding: jest.fn(),
    addInitScript: jest.fn().mockResolvedValue(undefined),
  };
  m.exposeBinding.mockImplementation(async (_name: string, cb: ExposeBindingCallback) => {
    m.capturedBindingCallback = cb;
  });
  m.addInitScript.mockImplementation(async (script: string | (() => void)) => {
    m.capturedInitScript = script;
  });
  return m;
}

describe('installHistoryHook', () => {
  test('exposeBinding 은 정확한 이름(__captureRoute)으로 호출된다', async () => {
    const ctx = buildMockContext();
    const ok = await installHistoryHook(ctx as unknown as BrowserContext, {
      getSink: () => null,
    });

    expect(ok).toBe(true);
    expect(ctx.exposeBinding).toHaveBeenCalledTimes(1);
    expect(ctx.exposeBinding).toHaveBeenCalledWith(
      '__captureRoute',
      expect.any(Function),
    );
  });

  test('addInitScript 가 1회 호출되고 history wrap 코드를 포함한다', async () => {
    const ctx = buildMockContext();
    await installHistoryHook(ctx as unknown as BrowserContext, {
      getSink: () => null,
    });

    expect(ctx.addInitScript).toHaveBeenCalledTimes(1);
    const script = String(ctx.capturedInitScript ?? '');
    expect(script).toContain('history.pushState');
    expect(script).toContain('history.replaceState');
    expect(script).toContain('popstate');
    expect(script).toContain('hashchange');
    // sink 의 인터페이스 식별자
    expect(script).toContain('__captureRoute');
  });

  test('binding 콜백 호출 시 getSink() 가 반환한 sink 가 URL 인자로 호출된다', async () => {
    const ctx = buildMockContext();
    const sink = jest.fn();
    await installHistoryHook(ctx as unknown as BrowserContext, {
      getSink: () => sink,
    });

    // page-side 에서 binding 이 호출되는 것을 시뮬레이트
    expect(ctx.capturedBindingCallback).toBeDefined();
    ctx.capturedBindingCallback!({ frame: 'main' }, 'https://example.com/route-a');

    expect(sink).toHaveBeenCalledWith('https://example.com/route-a');
  });

  test('getSink() 가 null 을 반환하면 binding 콜백이 와도 sink 가 호출되지 않는다', async () => {
    const ctx = buildMockContext();
    let sink: jest.Mock | null = null;
    await installHistoryHook(ctx as unknown as BrowserContext, {
      getSink: () => sink,
    });

    // sink 미등록 상태에서 binding 호출 — 어떤 sink 도 호출되면 안 됨
    expect(() =>
      ctx.capturedBindingCallback!({ frame: 'main' }, 'https://example.com/x'),
    ).not.toThrow();

    // 이제 sink 등록 후 binding 호출 — sink 가 호출되어야 함
    sink = jest.fn();
    ctx.capturedBindingCallback!({ frame: 'main' }, 'https://example.com/y');
    expect(sink).toHaveBeenCalledWith('https://example.com/y');
  });

  test('url 이 string 이 아니면 sink 가 호출되지 않는다 (방어 코드)', async () => {
    const ctx = buildMockContext();
    const sink = jest.fn();
    await installHistoryHook(ctx as unknown as BrowserContext, {
      getSink: () => sink,
    });

    // 잘못된 인자 — number, undefined 등
    ctx.capturedBindingCallback!({ frame: 'main' }, 123 as unknown as string);
    ctx.capturedBindingCallback!({ frame: 'main' }, undefined as unknown as string);

    expect(sink).not.toHaveBeenCalled();
  });

  test('exposeBinding 이 throw 하면 best-effort 로 false 를 반환하고 throw 하지 않는다', async () => {
    const ctx: MockContext = {
      exposeBinding: jest.fn().mockRejectedValueOnce(new Error('binding-blocked')),
      addInitScript: jest.fn().mockResolvedValue(undefined),
    };
    const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const ok = await installHistoryHook(ctx as unknown as BrowserContext, {
      getSink: () => null,
    });

    expect(ok).toBe(false);
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });
});
