import { ReportViewer } from '@/features/report/components/ReportViewer';
import { NotionService } from '@/services/notion/NotionService';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ReportPage({ params }: PageProps) {
  const { id } = await params;

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DATABASE_ID) {
    throw new Error('Notion 환경 변수(NOTION_API_KEY, NOTION_DATABASE_ID)가 설정되지 않았습니다.');
  }

  const notionService = new NotionService(
    process.env.NOTION_API_KEY,
    process.env.NOTION_DATABASE_ID
  );

  let auditResult;
  try {
    auditResult = await notionService.getAuditResult(id);
  } catch (err) {
    throw new Error(
      `Notion에서 리포트(${id})를 조회하는 중 오류가 발생했습니다: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!auditResult) {
    notFound();
  }

  return <ReportViewer initialResult={auditResult} />;
}
