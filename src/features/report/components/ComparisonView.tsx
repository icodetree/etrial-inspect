'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { ComparisonResult, CompactViolation } from '@/lib/comparison/types';
import styles from './ComparisonView.module.css';

interface ComparisonViewProps {
  baseId: string;
  currentId: string;
}

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'] as const;

const IMPACT_LABEL: Record<string, string> = {
  critical: 'Critical',
  serious: 'Serious',
  moderate: 'Moderate',
  minor: 'Minor',
};

function getDeltaClass(delta: number, invertSign = false): string {
  const effective = invertSign ? -delta : delta;
  if (effective > 0) return styles.improved;
  if (effective < 0) return styles.regressed;
  return styles.neutral;
}

function formatDelta(delta: number): string {
  if (delta === 0) return '0';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

function getImpactBadgeClass(impact: string): string {
  switch (impact) {
    case 'critical': return `${styles.impactBadge} ${styles.impactCritical}`;
    case 'serious': return `${styles.impactBadge} ${styles.impactSerious}`;
    case 'moderate': return `${styles.impactBadge} ${styles.impactModerate}`;
    case 'minor': return `${styles.impactBadge} ${styles.impactMinor}`;
    default: return styles.impactBadge;
  }
}

function ViolationList({ violations }: { violations: CompactViolation[] }) {
  return (
    <ul className={styles.sectionBody} role="list">
      {violations.map((v, i) => (
        <li key={`${v.kwcagId}-${v.pageUrl}-${i}`} className={styles.violationItem}>
          <span className={getImpactBadgeClass(v.impact)}>
            {v.impact}
          </span>
          <span className={styles.violationInfo}>
            <span className={styles.violationId}>
              {v.kwcagId} {v.kwcagName}
            </span>
            <span className={styles.violationPage}>{v.pageUrl}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ComparisonView({ baseId, currentId }: ComparisonViewProps) {
  const [data, setData] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    new: true,
    resolved: true,
  });

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchComparison() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/history/compare?baseId=${encodeURIComponent(baseId)}&currentId=${encodeURIComponent(currentId)}`,
        );

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `비교 데이터 로드 실패 (${res.status})`);
        }

        const result: ComparisonResult = await res.json();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchComparison();
    return () => { cancelled = true; };
  }, [baseId, currentId]);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading} role="status" aria-live="polite">
          비교 분석 데이터를 불러오는 중...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <Link href="/" className={styles.backLink} aria-label="히스토리 목록으로 돌아가기">
          ← 돌아가기
        </Link>
        <div className={styles.error} role="alert">{error}</div>
      </div>
    );
  }

  if (!data) return null;

  const baseDate = new Date(data.baseDate).toLocaleDateString();
  const currentDate = new Date(data.currentDate).toLocaleDateString();

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.backLink} aria-label="히스토리 목록으로 돌아가기">
        ← 돌아가기
      </Link>

      {/* 헤더 */}
      <header className={styles.header}>
        <h1 className={styles.title}>진단 비교 분석</h1>
        <p className={styles.subtitle}>
          {data.baseUrl} &middot; {baseDate} → {currentDate}
        </p>
      </header>

      {/* 절삭 경고 */}
      {data.truncationWarning && (
        <div className={styles.warningBanner} role="status">
          <span aria-hidden="true">&#9888;</span>
          <span>{data.truncationWarning}</span>
        </div>
      )}

      {/* 델타 요약 카드 */}
      <div className={styles.deltaGrid}>
        <DeltaCard
          label="위반 수"
          entry={data.violationCountDelta}
          invertSign
        />
        <DeltaCard
          label="SEO 점수"
          entry={data.scoreDelta}
        />
        <DeltaCard
          label="페이지 수"
          entry={data.pageCountDelta}
        />
        <div className={styles.deltaCard}>
          <p className={styles.deltaCardLabel}>지속 위반</p>
          <p className={`${styles.deltaValue} ${styles.neutral}`}>
            {data.persistentCount}
          </p>
          <p className={styles.deltaBeforeAfter}>건</p>
        </div>
      </div>

      {/* Impact 분석 테이블 */}
      <section className={styles.impactSection} aria-labelledby="impact-heading">
        <h2 id="impact-heading" className={styles.sectionTitle}>
          영향도별 변화
        </h2>
        <table className={styles.impactTable}>
          <thead>
            <tr>
              <th scope="col">영향도</th>
              <th scope="col">기준</th>
              <th scope="col">현재</th>
              <th scope="col">변화</th>
            </tr>
          </thead>
          <tbody>
            {IMPACT_ORDER.map(impact => {
              const entry = data.byImpactDelta[impact];
              if (!entry) return null;
              return (
                <tr key={impact}>
                  <td>
                    <span className={getImpactBadgeClass(impact)}>
                      {IMPACT_LABEL[impact]}
                    </span>
                  </td>
                  <td>{entry.before}</td>
                  <td>{entry.after}</td>
                  <td className={getDeltaClass(entry.delta, true)}>
                    {formatDelta(entry.delta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* 신규 위반 */}
      <section className={styles.section} aria-labelledby="new-violations-heading">
        <button
          type="button"
          className={`${styles.sectionHeader} ${styles.sectionHeaderNew}`}
          id="new-violations-heading"
          onClick={() => toggleSection('new')}
          aria-expanded={openSections.new}
          aria-controls="new-violations-body"
        >
          <span>신규 위반 ({data.newViolations.length}건)</span>
          <span className={styles.sectionToggle} aria-hidden="true">
            {openSections.new ? '▲' : '▼'}
          </span>
        </button>
        {openSections.new && (
          <div id="new-violations-body">
            {data.newViolations.length > 0 ? (
              <ViolationList violations={data.newViolations} />
            ) : (
              <p className={styles.violationItem}>신규 위반이 없습니다.</p>
            )}
          </div>
        )}
      </section>

      {/* 해결된 위반 */}
      <section className={styles.section} aria-labelledby="resolved-violations-heading">
        <button
          type="button"
          className={`${styles.sectionHeader} ${styles.sectionHeaderResolved}`}
          id="resolved-violations-heading"
          onClick={() => toggleSection('resolved')}
          aria-expanded={openSections.resolved}
          aria-controls="resolved-violations-body"
        >
          <span>해결된 위반 ({data.resolvedViolations.length}건)</span>
          <span className={styles.sectionToggle} aria-hidden="true">
            {openSections.resolved ? '▲' : '▼'}
          </span>
        </button>
        {openSections.resolved && (
          <div id="resolved-violations-body">
            {data.resolvedViolations.length > 0 ? (
              <ViolationList violations={data.resolvedViolations} />
            ) : (
              <p className={styles.violationItem}>해결된 위반이 없습니다.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

interface DeltaCardProps {
  label: string;
  entry: { before: number; after: number; delta: number };
  invertSign?: boolean;
}

function DeltaCard({ label, entry, invertSign = false }: DeltaCardProps) {
  return (
    <div className={styles.deltaCard}>
      <p className={styles.deltaCardLabel}>{label}</p>
      <p className={`${styles.deltaValue} ${getDeltaClass(entry.delta, invertSign)}`}>
        {formatDelta(entry.delta)}
      </p>
      <p className={styles.deltaBeforeAfter}>
        {entry.before} → {entry.after}
      </p>
    </div>
  );
}
