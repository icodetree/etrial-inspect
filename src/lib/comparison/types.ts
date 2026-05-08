/**
 * 감사 결과 비교 분석 타입 정의
 * 이전 진단 결과와 현재 진단 결과의 차이를 표현한다.
 */

import type { BoundingBox } from '@/types';

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
  /** base 감사의 GitHub Pages 스크린샷 베이스 URL */
  baseScreenshotUrl?: string;
  /** current 감사의 GitHub Pages 스크린샷 베이스 URL */
  currentScreenshotUrl?: string;
}

export interface CompactViolation {
  kwcagId: string;
  kwcagName: string;
  impact: string;
  principle: string;
  pageUrl: string;
  selector?: string;
  description: string;
  /** 스크린샷 파일 경로 (진행 보고서용) */
  screenshotPath?: string;
  /** 위반 요소 좌표 (스크린샷 크롭/오버레이용) */
  boundingBox?: BoundingBox;
  /** 위반 코드 스니펫 */
  affectedCode?: string;
}
