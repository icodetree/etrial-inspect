import { NextResponse } from 'next/server';
import { NotionService } from '@/services/notion/NotionService';
import { diffAuditResults } from '@/lib/comparison/diff';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const baseId = searchParams.get('baseId');
    const currentId = searchParams.get('currentId');

    if (!baseId || !currentId) {
      return NextResponse.json(
        { error: 'Missing baseId or currentId parameter' },
        { status: 400 },
      );
    }

    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !databaseId) {
      return NextResponse.json(
        { error: 'Notion API Key or Database ID not configured.' },
        { status: 500 },
      );
    }

    const notionService = new NotionService(apiKey, databaseId);

    const [base, current] = await Promise.all([
      notionService.getAuditResult(baseId),
      notionService.getAuditResult(currentId),
    ]);

    if (!base) {
      return NextResponse.json(
        { error: `Base audit result not found: ${baseId}` },
        { status: 404 },
      );
    }

    if (!current) {
      return NextResponse.json(
        { error: `Current audit result not found: ${currentId}` },
        { status: 404 },
      );
    }

    const comparison = diffAuditResults(base, current, baseId, currentId);

    return NextResponse.json(comparison);
  } catch (error) {
    console.error('Failed to compare audit results:', error);
    return NextResponse.json(
      { error: 'Failed to compare audit results.' },
      { status: 500 },
    );
  }
}
