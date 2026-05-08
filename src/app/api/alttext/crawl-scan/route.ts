import { NextRequest, NextResponse } from 'next/server';
import { createSSEResponse } from '@/lib/sse-stream';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface CrawlScanRequestBody {
  targetUrl: string;
  inspector?: string;
  maxPages?: number;
  maxDepth?: number;
  excludePaths?: string;
  maxImagesPerPage?: number;
  useClaudeVision?: boolean;
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

  return createSSEResponse(
    async (onProgress) => {
      const { runCrawlAltTextAudit } = await import('@/services/AuditExecutor');

      return runCrawlAltTextAudit(
        {
          targetUrl: body.targetUrl,
          inspector: body.inspector,
          maxPages: body.maxPages,
          maxDepth: body.maxDepth,
          excludePaths: body.excludePaths,
          maxImagesPerPage: body.maxImagesPerPage,
          useClaudeVision: body.useClaudeVision,
        },
        onProgress,
      );
    },
    {
      eventMap: {
        progress: 'crawl-progress',
        'alt-text-progress': 'progress',
      },
      errorLogPrefix: '[alttext/crawl-scan] error:',
    },
  );
}
