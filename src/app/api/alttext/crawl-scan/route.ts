import { NextRequest, NextResponse } from 'next/server';

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
  try {
    const body: CrawlScanRequestBody = await request.json();

    if (!body.targetUrl || typeof body.targetUrl !== 'string') {
      return NextResponse.json(
        { error: '대표 URL이 필요합니다.' },
        { status: 400 },
      );
    }

    const { runCrawlAltTextAudit } = await import('@/services/AuditExecutor');
    const result = await runCrawlAltTextAudit({
      targetUrl: body.targetUrl,
      inspector: body.inspector,
      maxPages: body.maxPages,
      maxDepth: body.maxDepth,
      excludePaths: body.excludePaths,
      maxImagesPerPage: body.maxImagesPerPage,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[alttext/crawl-scan] error:', error);
    return NextResponse.json(
      { error: '크롤링 + OCR 실행 중 오류가 발생했습니다.', details: message },
      { status: 500 },
    );
  }
}
