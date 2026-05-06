import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';
import { apiError, resolveBaseOrigin } from '@/lib/api-helpers';

export async function POST(request: Request) {
  try {
    const result = await request.json();

    // 환경 변수 체크
    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !databaseId) {
      console.error(`Missing Env Vars - API Key: ${!!apiKey}, DB ID: ${!!databaseId}`);
      return apiError(500, 'Notion API Key or Database ID not configured (Check Vercel Env Vars).');
    }

    const notionService = new NotionService(apiKey, databaseId);

    // 1. Notion 페이지 생성 (리포트 링크 없이)
    const pageId = await notionService.saveAuditResult(result);

    // 2. 리포트 링크 생성 — Vercel/로컬/리버스 프록시 모두 케어 (api-helpers 로 일원화)
    const baseOrigin = resolveBaseOrigin(request);
    const reportUrl = `${baseOrigin}/report/${pageId}`;

    // 3. 페이지에 리포트 링크 업데이트
    await notionService.updatePageProperty(pageId, {
      'Report Link': {
        url: reportUrl,
      },
    });

    return NextResponse.json({ success: true, message: 'Saved to Notion successfully.', reportUrl });
  } catch (error) {
    console.error('Failed to save to Notion:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Notion DB 권한 누락 — 사용자가 Notion 측에서 integration을 연결해야 함
    const code = (error as { code?: string })?.code;
    const status = (error as { status?: number })?.status;
    if (code === 'object_not_found' || status === 404) {
      return apiError(
        500,
        'Notion DB에 접근할 수 없습니다. Notion에서 해당 DB의 "Connections" 메뉴에서 "E-able A11y" integration을 연결해 주세요.\n\n경로: DB 페이지 우상단 "..." 메뉴 → Connections → Add connections → E-able A11y',
        { code: 'notion_object_not_found' },
      );
    }

    return apiError(500, `Failed to save to Notion: ${errorMessage}`);
  }
}
