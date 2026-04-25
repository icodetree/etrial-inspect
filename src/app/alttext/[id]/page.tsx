import { NotionService } from '@/services/notion/NotionService';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * 이미지 진단 단건 보고서 페이지 (Notion에서 조회)
 *
 * 결과 뷰어 컴포넌트는 다음 단계에서 도입된다.
 */
export default async function AltTextReportPage({ params }: PageProps) {
  const { id } = await params;

  if (!process.env.NOTION_API_KEY || !process.env.NOTION_ALTTEXT_DATABASE_ID) {
    throw new Error('Notion 환경 변수(NOTION_API_KEY, NOTION_ALTTEXT_DATABASE_ID)가 설정되지 않았습니다.');
  }

  const notionService = new NotionService(
    process.env.NOTION_API_KEY,
    process.env.NOTION_ALTTEXT_DATABASE_ID,
  );

  const result = await notionService.getAltTextAuditResult(id);
  if (!result) {
    notFound();
  }

  return (
    <main className="container">
      <h1>이미지 진단 보고서</h1>
      <p>저장된 보고서 ID: {id}</p>
      <p>총 URL: {result.totalUrls}개 / 불일치: {result.totalMismatches}건</p>
      <p>결과 뷰어 컴포넌트는 다음 단계에서 추가됩니다.</p>
    </main>
  );
}
