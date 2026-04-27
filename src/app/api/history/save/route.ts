import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';

export async function POST(request: Request) {
  try {
    const result = await request.json();

    // 환경 변수 체크
    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !databaseId) {
      console.error(`Missing Env Vars - API Key: ${!!apiKey}, DB ID: ${!!databaseId}`);
      return NextResponse.json(
        { error: 'Notion API Key or Database ID not configured (Check Vercel Env Vars).' },
        { status: 500 }
      );
    }

    const notionService = new NotionService(apiKey, databaseId);

    // 1. Notion 페이지 생성 (리포트 링크 없이)
    const pageId = await notionService.saveAuditResult(result);

    // 2. 리포트 링크 생성 (페이지 ID 포함 - Clean URL)
    // Vercel 배포 시 'origin' 헤더가 없거나 내부 네트워크 아이피가 될 수 있으므로
    // VERCEL_URL 환경 변수나 x-forwarded-host 헤더도 체크합니다.
    let baseOrigin = request.headers.get('origin') || 'http://localhost:3000';

    // Vercel 환경에서 origin이 localhost로 잡히는 경우 방지
    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || 'https';

    if (process.env.VERCEL_URL) {
      baseOrigin = `https://${process.env.VERCEL_URL}`;
    } else if (host && !host.includes('localhost')) {
      baseOrigin = `${proto}://${host}`;
    }

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
      return NextResponse.json(
        {
          error:
            'Notion DB에 접근할 수 없습니다. Notion에서 해당 DB의 "Connections" 메뉴에서 "E-able A11y" integration을 연결해 주세요.\n\n경로: DB 페이지 우상단 "..." 메뉴 → Connections → Add connections → E-able A11y',
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: `Failed to save to Notion: ${errorMessage}` },
      { status: 500 }
    );
  }
}
