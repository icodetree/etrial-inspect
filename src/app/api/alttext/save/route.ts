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
    return NextResponse.json(
      { error: `Notion 저장 실패: ${errorMessage}` },
      { status: 500 },
    );
  }
}
