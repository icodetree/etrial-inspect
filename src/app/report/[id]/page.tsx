import { ReportViewer } from '@/features/report/components/ReportViewer';
import { ReportFallback } from '@/features/report/components/ReportFallback';
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
    console.error(`Notion 리포트 조회 실패 (${id}):`, err);
  }

  // Notion JSON이 truncated/파싱 실패 → localStorage 폴백 시도
  if (!auditResult) {
    return <ReportFallback notionPageId={id} />;
  }

  return <ReportViewer initialResult={auditResult} />;
}
