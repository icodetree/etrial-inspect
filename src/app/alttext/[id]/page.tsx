import { notFound } from 'next/navigation';
import { NotionService } from '@/services/notion/NotionService';
import { AltTextResultViewer } from '@/features/alttext/components/AltTextResultViewer';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AltTextReportPage({ params }: PageProps) {
  const { id } = await params;

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_ALTTEXT_DATABASE_ID) {
    throw new Error('Notion 환경 변수(NOTION_API_KEY, NOTION_ALTTEXT_DATABASE_ID)가 설정되지 않았습니다.');
  }

  const notionService = new NotionService(
    process.env.NOTION_API_KEY,
    process.env.NOTION_ALTTEXT_DATABASE_ID,
  );

  let result;
  try {
    result = await notionService.getAltTextAuditResult(id);
  } catch (err) {
    throw new Error(
      `Notion에서 이미지 진단 보고서(${id})를 조회하는 중 오류가 발생했습니다: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!result) {
    notFound();
  }

  return <AltTextResultViewer result={result} />;
}
