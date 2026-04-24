import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

interface ScanRequestBody {
  urls: string[];
  maxImagesPerPage?: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: ScanRequestBody = await request.json();

    if (!Array.isArray(body.urls) || body.urls.length === 0) {
      return NextResponse.json(
        { error: 'urls 배열이 필요합니다.' },
        { status: 400 },
      );
    }

    if (body.urls.length > 50) {
      return NextResponse.json(
        { error: 'standalone 모드는 최대 50개 URL까지 지원합니다.' },
        { status: 400 },
      );
    }

    const { runStandaloneAltTextScan } = await import('@/services/AuditExecutor');
    const results = await runStandaloneAltTextScan(body.urls, {
      maxImagesPerPage: body.maxImagesPerPage,
    });

    return NextResponse.json({
      scannedAt: new Date().toISOString(),
      totalUrls: body.urls.length,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[alt-text-scan] error:', error);
    return NextResponse.json(
      { error: 'OCR 스캔 실행 중 오류가 발생했습니다.', details: message },
      { status: 500 },
    );
  }
}
