import { NextRequest, NextResponse } from 'next/server';
import { AuditConfig } from '@/types';

// Set max duration for Vercel Serverless Function (Start with 60s, max 300s for Pro)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let config: AuditConfig;
  try {
    config = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  console.log('🚀 Starting audit execution (SSE stream)...');

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      try {
        // Dynamic import to avoid bundling excessive dependencies on cold start
        const { runAudit } = await import('@/services/AuditExecutor');

        const result = await runAudit(
          config,
          (progressData: { type: string; message?: string; current?: number; total?: number; url?: string }) => {
            if (progressData.type === 'log') {
              send('log', { message: progressData.message });
            } else if (progressData.type === 'progress') {
              send('progress', {
                current: progressData.current,
                total: progressData.total,
                url: progressData.url,
              });
            }
          },
          request.signal
        );

        send('result', result);
      } catch (error: unknown) {
        if (request.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
          console.log('🛑 Audit aborted by client.');
          send('error', { message: 'aborted', aborted: true });
        } else {
          const message = error instanceof Error ? error.message : String(error);
          console.error('Audit execution error:', error);
          send('error', { message });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx proxy buffering 방지
    },
  });
}
