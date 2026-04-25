import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_ALTTEXT_DATABASE_ID;
  if (!apiKey || !dbId) {
    return NextResponse.json(
      { error: 'Notion 설정 누락 (NOTION_API_KEY / NOTION_ALTTEXT_DATABASE_ID 확인)' },
      { status: 500 },
    );
  }

  try {
    const notionService = new NotionService(apiKey, dbId);
    const result = await notionService.getAltTextAuditResult(id);
    if (!result) {
      return NextResponse.json({ error: '이미지 진단 결과를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[alttext/[id]/GET] Error:', error);
    return NextResponse.json({ error: '조회 실패', details: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  const apiKey = process.env.NOTION_API_KEY;
  const dbId = process.env.NOTION_ALTTEXT_DATABASE_ID;
  if (!apiKey || !dbId) {
    return NextResponse.json(
      { error: 'Notion 설정 누락 (NOTION_API_KEY / NOTION_ALTTEXT_DATABASE_ID 확인)' },
      { status: 500 },
    );
  }

  try {
    const notionService = new NotionService(apiKey, dbId);
    const ok = await notionService.softDeletePage(id);
    if (!ok) {
      return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[alttext/[id]/DELETE] Error:', error);
    return NextResponse.json({ error: '삭제 실패', details: message }, { status: 500 });
  }
}
