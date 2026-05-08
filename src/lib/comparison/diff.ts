/**
 * 감사 결과 비교(diff) 로직
 *
 * 두 AuditResult 를 받아 변화량(delta), 신규/해소/지속 위반을 계산한다.
 * 순수 함수로 구현 — 부수 효과 없음.
 */

import { AuditResult, Violation } from '@/types';
import { ComparisonResult, CompactViolation, DeltaEntry } from './types';

/**
 * 위반 항목의 복합 키를 생성한다.
 * kwcagId + pageUrl + selector(있을 경우) + axeRuleId(있을 경우) 조합으로
 * 동일 위반을 식별한다.
 */
export function buildViolationKey(v: {
  kwcagId: string;
  pageUrl: string;
  selector?: string;
  axeRuleId?: string;
}): string {
  const parts = [v.kwcagId, v.pageUrl];
  if (v.selector) parts.push(v.selector);
  if (v.axeRuleId) parts.push(v.axeRuleId);
  return parts.join('||');
}

/**
 * 두 수치의 DeltaEntry 를 계산한다.
 * delta = after - before (양수이면 증가, 음수이면 감소)
 */
export function delta(before: number, after: number): DeltaEntry {
  return { before, after, delta: after - before };
}

/**
 * Violation 을 CompactViolation 으로 변환한다.
 * 리포트에 필요한 핵심 필드만 남긴다.
 */
function toCompact(v: Violation): CompactViolation {
  return {
    kwcagId: v.kwcagId,
    kwcagName: v.kwcagName,
    impact: v.impact,
    principle: v.principle,
    pageUrl: v.pageUrl,
    selector: v.selector,
    description: v.description,
  };
}

/**
 * Record<string, number> 형태의 두 맵을 비교하여
 * 모든 키에 대한 DeltaEntry 맵을 반환한다.
 */
function diffRecordMaps(
  baseMap: Record<string, number> | undefined,
  currentMap: Record<string, number> | undefined,
): Record<string, DeltaEntry> {
  const base = baseMap ?? {};
  const current = currentMap ?? {};
  const allKeys = new Set([...Object.keys(base), ...Object.keys(current)]);
  const result: Record<string, DeltaEntry> = {};

  for (const key of allKeys) {
    result[key] = delta(base[key] ?? 0, current[key] ?? 0);
  }

  return result;
}

/**
 * AuditResult 에서 대표 URL 을 추출한다.
 * 첫 번째 페이지의 URL 또는 빈 문자열.
 */
function extractUrl(result: AuditResult): string {
  return result.pages?.[0]?.url ?? '';
}

/**
 * 두 AuditResult 를 비교하여 ComparisonResult 를 생성한다.
 *
 * @param base - 이전(기준) 진단 결과
 * @param current - 현재 진단 결과
 * @param baseId - 이전 결과의 Notion 페이지 ID
 * @param currentId - 현재 결과의 Notion 페이지 ID
 */
export function diffAuditResults(
  base: AuditResult,
  current: AuditResult,
  baseId: string,
  currentId: string,
): ComparisonResult {
  // 점수 비교 (SEO score)
  const baseScore = base.seoResult?.score ?? 0;
  const currentScore = current.seoResult?.score ?? 0;

  // 위반 키 → Violation 매핑
  const baseViolationMap = new Map<string, Violation>();
  for (const v of base.violations ?? []) {
    baseViolationMap.set(buildViolationKey(v), v);
  }

  const currentViolationMap = new Map<string, Violation>();
  for (const v of current.violations ?? []) {
    currentViolationMap.set(buildViolationKey(v), v);
  }

  // 신규 위반: current 에만 존재
  const newViolations: CompactViolation[] = [];
  for (const [key, v] of currentViolationMap) {
    if (!baseViolationMap.has(key)) {
      newViolations.push(toCompact(v));
    }
  }

  // 해소된 위반: base 에만 존재
  const resolvedViolations: CompactViolation[] = [];
  for (const [key, v] of baseViolationMap) {
    if (!currentViolationMap.has(key)) {
      resolvedViolations.push(toCompact(v));
    }
  }

  // 지속 위반: 양쪽 모두 존재
  let persistentCount = 0;
  for (const key of baseViolationMap.keys()) {
    if (currentViolationMap.has(key)) {
      persistentCount++;
    }
  }

  // 절단 경고 확인
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const baseTruncated = (base as any)._truncated;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentTruncated = (current as any)._truncated;
  let truncationWarning: string | undefined;
  if (baseTruncated || currentTruncated) {
    const parts: string[] = [];
    if (baseTruncated) parts.push(`기준 결과: ${baseTruncated}`);
    if (currentTruncated) parts.push(`현재 결과: ${currentTruncated}`);
    truncationWarning = `일부 위반 항목이 생략되어 비교가 불완전할 수 있습니다. ${parts.join(', ')}`;
  }

  return {
    baseId,
    currentId,
    baseDate: base.startTime,
    currentDate: current.startTime,
    baseUrl: extractUrl(base),
    currentUrl: extractUrl(current),
    scoreDelta: delta(baseScore, currentScore),
    violationCountDelta: delta(base.totalViolations, current.totalViolations),
    pageCountDelta: delta(base.totalPages, current.totalPages),
    byImpactDelta: diffRecordMaps(base.summary?.byImpact, current.summary?.byImpact),
    byPrincipleDelta: diffRecordMaps(base.summary?.byPrinciple, current.summary?.byPrinciple),
    newViolations,
    resolvedViolations,
    persistentCount,
    truncationWarning,
  };
}
