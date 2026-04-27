import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';

export async function POST(request: Request) {
  try {
    const result = await request.json();

    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_ALTTEXT_DATABASE_ID;

    if (!apiKey || !databaseId) {
      console.error(`[alttext/save] Missing Env Vars - API Key: ${!!apiKey}, Alt-Text DB ID: ${!!databaseId}`);
      return NextResponse.json(
        { error: 'Notion API Key 또는 NOTION_ALTTEXT_DATABASE_ID가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    const notionService = new NotionService(apiKey, databaseId);
    const pageId = await notionService.saveAltTextAuditResult(result);

    // Report Link 계산 (Vercel/로컬 모두 케어)
    let baseOrigin = request.headers.get('origin') || 'http://localhost:3000';
    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    if (process.env.VERCEL_URL) {
      baseOrigin = `https://${process.env.VERCEL_URL}`;
    } else if (host && !host.includes('localhost')) {
      baseOrigin = `${proto}://${host}`;
    }
    const reportUrl = `${baseOrigin}/alttext/${pageId}`;

    await notionService.updatePageProperty(pageId, {
      'Report Link': { url: reportUrl },
    });

    return NextResponse.json({ success: true, pageId, reportUrl });
  } catch (error) {
    console.error('[alttext/save] Failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Notion DB 권한 누락 — 사용자가 Notion 측에서 integration을 연결해야 함
    const code = (error as { code?: string })?.code;
    const status = (error as { status?: number })?.status;
    if (code === 'object_not_found' || status === 404) {
      return NextResponse.json(
        {
          error:
            'Notion DB에 접근할 수 없습니다. Notion에서 해당 DB의 "Connections" 메뉴에서 "E-able A11y" integration을 연결해 주세요.\n\n경로: DB 페이지 우상단 "..." 메뉴 → Connections → Add connections → E-able A11y',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: `Notion 저장 실패: ${errorMessage}` },
      { status: 500 },
    );
  }
}
