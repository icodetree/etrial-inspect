/**
 * 감사 결과 비교 분석 타입 정의
 * 이전 진단 결과와 현재 진단 결과의 차이를 표현한다.
 */

export interface DeltaEntry {
  before: number;
  after: number;
  delta: number;
}

export interface ComparisonResult {
  baseId: string;
  currentId: string;
  baseDate: string;
  currentDate: string;
  baseUrl: string;
  currentUrl: string;
  scoreDelta: DeltaEntry;
  violationCountDelta: DeltaEntry;
  pageCountDelta: DeltaEntry;
  byImpactDelta: Record<string, DeltaEntry>;
  byPrincipleDelta: Record<string, DeltaEntry>;
  newViolations: CompactViolation[];
  resolvedViolations: CompactViolation[];
  persistentCount: number;
  truncationWarning?: string;
}

export interface CompactViolation {
  kwcagId: string;
  kwcagName: string;
  impact: string;
  principle: string;
  pageUrl: string;
  selector?: string;
  description: string;
}
