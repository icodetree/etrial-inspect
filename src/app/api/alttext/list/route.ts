import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';

export const dynamic = 'force-dynamic';

export async function GET() {
  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_ALTTEXT_DATABASE_ID;

  if (!apiKey || !dbId) {
    console.error(`[alttext/list] Missing Env Vars - API Key: ${!!apiKey}, DB ID: ${!!dbId}`);
    return NextResponse.json(
      { error: 'Notion 설정 누락 (NOTION_API_KEY / NOTION_ALTTEXT_DATABASE_ID 확인)' },
      { status: 500 },
    );
  }

  try {
    const notionService = new NotionService(apiKey, dbId);
    const history = await notionService.getAltTextHistory();
    return NextResponse.json(history);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[alttext/list] Error:', error);
    return NextResponse.json(
      { error: '이미지 진단 이력 조회 실패', details: message },
      { status: 500 },
    );
  }
}
