import { ComparisonView } from '@/features/report/components/ComparisonView';

interface PageProps {
  searchParams: Promise<{ base?: string; current?: string }>;
}

export default async function ComparePage({ searchParams }: PageProps) {
  const { base, current } = await searchParams;

  if (!base || !current) {
    return (
      <main>
        <p>비교할 진단 결과를 선택해주세요. (base, current 파라미터 필요)</p>
      </main>
    );
  }

  return (
    <main>
      <ComparisonView baseId={base} currentId={current} />
    </main>
  );
}
