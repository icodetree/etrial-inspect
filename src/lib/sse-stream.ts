/**
 * SSE (Server-Sent Events) 스트림 팩토리.
 *
 * 여러 API route에서 반복되는 ReadableStream + TextEncoder + send 헬퍼 +
 * try/catch/finally + controller.close() 보일러플레이트를 한곳으로 추출한다.
 */

import type { ProgressEvent } from '@/types';

/* ------------------------------------------------------------------ */
/*  공통 SSE 응답 헤더                                                 */
/* ------------------------------------------------------------------ */

export const SSE_HEADERS: HeadersInit = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no', // nginx proxy buffering 방지
};

/* ------------------------------------------------------------------ */
/*  SSE 이벤트 매핑                                                    */
/* ------------------------------------------------------------------ */

/**
 * ProgressEvent.type → SSE event name 매핑.
 * route마다 같은 ProgressEvent.type을 다른 SSE 이벤트 이름으로 보낼 수 있으므로
 * 매핑 테이블로 분리한다.
 *
 * 예) audit route: { progress: 'progress', 'alt-text-progress': 'alt-text-progress' }
 *     crawl-scan: { progress: 'crawl-progress', 'alt-text-progress': 'progress' }
 */
export type SSEEventMap = Partial<Record<ProgressEvent['type'], string>>;

/* ------------------------------------------------------------------ */
/*  createSSEStream options                                            */
/* ------------------------------------------------------------------ */

export interface CreateSSEStreamOptions {
  /** ProgressEvent.type → SSE event name 재매핑. 미지정 시 type 그대로 사용. */
  eventMap?: SSEEventMap;
  /** AbortSignal — 클라이언트가 연결을 끊었을 때 abort 처리용 */
  signal?: AbortSignal;
  /** abort 시 로그 메시지 (기본: 'Aborted by client.') */
  abortLogMessage?: string;
  /** catch 시 에러를 콘솔에 출력할 때 prefix (기본: 'SSE stream error:') */
  errorLogPrefix?: string;
}

/* ------------------------------------------------------------------ */
/*  send 헬퍼 타입                                                     */
/* ------------------------------------------------------------------ */

type SendFn = (event: string, data: unknown) => void;

/* ------------------------------------------------------------------ */
/*  팩토리                                                             */
/* ------------------------------------------------------------------ */

/**
 * SSE ReadableStream을 생성한다.
 *
 * @param runFn  실제 비즈니스 로직. onProgress 콜백을 받아 진행 이벤트를 발행하고,
 *               최종 결과를 Promise로 반환한다. 반환값은 자동으로 `event: result`로 전송된다.
 * @param options  이벤트 매핑, abort signal 등 부가 옵션.
 * @returns  Response 생성자에 넘길 ReadableStream.
 */
export function createSSEStream<T>(
  runFn: (onProgress: (event: ProgressEvent) => void) => Promise<T>,
  options: CreateSSEStreamOptions = {},
): ReadableStream {
  const {
    eventMap,
    signal,
    abortLogMessage = 'Aborted by client.',
    errorLogPrefix = 'SSE stream error:',
  } = options;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send: SendFn = (event, data) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller already closed
        }
      };

      /** ProgressEvent → SSE send */
      const onProgress = (event: ProgressEvent) => {
        switch (event.type) {
          case 'log':
            send('log', { message: event.message });
            break;
          case 'progress': {
            const sseEvent = eventMap?.progress ?? 'progress';
            send(sseEvent, {
              current: event.current,
              total: event.total,
              url: event.url,
            });
            break;
          }
          case 'alt-text-progress': {
            const sseEvent = eventMap?.['alt-text-progress'] ?? 'alt-text-progress';
            send(sseEvent, {
              current: event.current,
              total: event.total,
              url: event.url,
            });
            break;
          }
        }
      };

      try {
        const result = await runFn(onProgress);
        send('result', result);
      } catch (error: unknown) {
        if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
          console.log(`🛑 ${abortLogMessage}`);
          send('error', { message: 'aborted', aborted: true });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          console.error(errorLogPrefix, error);
          send('error', { message });
        }
      } finally {
        controller.close();
      }
    },
  });
}

/* ------------------------------------------------------------------ */
/*  편의 함수: SSE Response 한 번에 생성                                */
/* ------------------------------------------------------------------ */

/**
 * createSSEStream + SSE_HEADERS를 합쳐 바로 Response를 반환한다.
 */
export function createSSEResponse<T>(
  runFn: (onProgress: (event: ProgressEvent) => void) => Promise<T>,
  options?: CreateSSEStreamOptions,
): Response {
  return new Response(createSSEStream(runFn, options), {
    headers: SSE_HEADERS,
  });
}
