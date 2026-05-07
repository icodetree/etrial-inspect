import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';
import { apiError, resolveBaseOrigin } from '@/lib/api-helpers';

export async function POST(request: Request) {
  try {
    const result = await request.json();

    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_ALTTEXT_DATABASE_ID;

    if (!apiKey || !databaseId) {
      console.error(`[alttext/save] Missing Env Vars - API Key: ${!!apiKey}, Alt-Text DB ID: ${!!databaseId}`);
      return apiError(500, 'Notion API Key 또는 NOTION_ALTTEXT_DATABASE_ID가 설정되지 않았습니다.');
    }

    console.log('[alttext/save] Saving to Notion DB:', databaseId);

    const notionService = new NotionService(apiKey, databaseId);
    const pageId = await notionService.saveAltTextAuditResult(result);

    console.log('[alttext/save] Page created:', pageId);

    // Report Link 계산 — api-helpers 의 resolveBaseOrigin 으로 일원화
    const baseOrigin = resolveBaseOrigin(request);
    const reportUrl = `${baseOrigin}/alttext/${pageId}`;

    await notionService.updatePageProperty(pageId, {
      'Report Link': { url: reportUrl },
    });

    return NextResponse.json({ success: true, pageId, reportUrl });
  } catch (error) {
    // Notion API 에러의 전체 구조를 로깅 (code, status, body 포함)
    const code = (error as { code?: string })?.code;
    const status = (error as { status?: number })?.status;
    const body = (error as { body?: unknown })?.body;
    console.error('[alttext/save] Failed:', {
      message: error instanceof Error ? error.message : String(error),
      code,
      status,
      body: body ? JSON.stringify(body).substring(0, 500) : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Notion DB 권한 누락 — 사용자가 Notion 측에서 integration을 연결해야 함
    if (code === 'object_not_found' || status === 404) {
      return apiError(
        500,
        'Notion DB에 접근할 수 없습니다. Notion에서 해당 DB의 "Connections" 메뉴에서 "E-able A11y" integration을 연결해 주세요.\n\n경로: DB 페이지 우상단 "..." 메뉴 → Connections → Add connections → E-able A11y',
        { code: 'notion_object_not_found' },
      );
    }

    // Notion DB 속성 불일치 — DB 스키마에 필요한 속성이 없을 때
    if (code === 'validation_error') {
      return apiError(
        500,
        `Notion DB 속성이 일치하지 않습니다. DB에 필요한 속성(Page URL, Date, Total URLs, Total Images, Mismatches, Pass, Missing Alt, Decorative Mismatch, Text Mismatch, Review Needed, Report Link, Deleted)이 올바른 타입으로 존재하는지 확인해 주세요.\n\n상세: ${errorMessage}`,
        { code: 'notion_validation_error' },
      );
    }

    return apiError(500, `Notion 저장 실패: ${errorMessage}`);
  }
}
