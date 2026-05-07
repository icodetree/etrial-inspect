import { NextRequest, NextResponse } from 'next/server';
import type { ProgressEvent } from '@/types';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface CrawlScanRequestBody {
  targetUrl: string;
  inspector?: string;
  maxPages?: number;
  maxDepth?: number;
  excludePaths?: string;
  maxImagesPerPage?: number;
}

export async function POST(request: NextRequest) {
  let body: CrawlScanRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.targetUrl || typeof body.targetUrl !== 'string') {
    return NextResponse.json(
      { error: '대표 URL이 필요합니다.' },
      { status: 400 },
    );
  }

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
        const { runCrawlAltTextAudit } = await import('@/services/AuditExecutor');

        const result = await runCrawlAltTextAudit(
          {
            targetUrl: body.targetUrl,
            inspector: body.inspector,
            maxPages: body.maxPages,
            maxDepth: body.maxDepth,
            excludePaths: body.excludePaths,
            maxImagesPerPage: body.maxImagesPerPage,
          },
          (event: ProgressEvent) => {
            switch (event.type) {
              case 'log':
                send('log', { message: event.message });
                break;
              case 'progress':
                send('crawl-progress', {
                  current: event.current,
                  total: event.total,
                  url: event.url,
                });
                break;
              case 'alt-text-progress':
                send('progress', {
                  current: event.current,
                  total: event.total,
                  url: event.url,
                });
                break;
            }
          },
        );

        send('result', result);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[alttext/crawl-scan] error:', error);
        send('error', { message });
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
      'X-Accel-Buffering': 'no',
    },
  });
}
