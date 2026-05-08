'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import type { ComparisonResult, CompactViolation } from '@/lib/comparison/types';
import { ViolationBeforeAfter } from './ViolationBeforeAfter';
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

interface ViolationListProps {
  violations: CompactViolation[];
  type: 'resolved' | 'new';
  screenshotUrl?: string;
}

function ViolationList({ violations, type, screenshotUrl }: ViolationListProps) {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  const toggleItem = useCallback((index: number) => {
    setExpandedItems(prev => ({ ...prev, [index]: !prev[index] }));
  }, []);

  return (
    <ul className={styles.sectionBody} role="list">
      {violations.map((v, i) => {
        const isExpanded = !!expandedItems[i];
        const itemId = `violation-detail-${type}-${i}`;
        return (
          <li key={`${v.kwcagId}-${v.pageUrl}-${i}`}>
            <button
              type="button"
              className={styles.violationItemExpandable}
              onClick={() => toggleItem(i)}
              aria-expanded={isExpanded}
              aria-controls={itemId}
            >
              <span
                className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}
                aria-hidden="true"
              >
                &#9654;
              </span>
              <span className={getImpactBadgeClass(v.impact)}>
                {v.impact}
              </span>
              <span className={styles.violationInfo}>
                <span className={styles.violationId}>
                  {v.kwcagId} {v.kwcagName}
                </span>
                <span className={styles.violationPage}>{v.pageUrl}</span>
              </span>
            </button>
            {isExpanded && (
              <div id={itemId} className={styles.violationDetail}>
                <ViolationBeforeAfter
                  violation={v}
                  type={type}
                  screenshotUrl={screenshotUrl}
                />
              </div>
            )}
          </li>
        );
      })}
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
  const [showPdfForm, setShowPdfForm] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfForm, setPdfForm] = useState({
    clientName: '',
    reportPeriod: '',
    weekNumber: '',
  });
  const pdfFormRef = useRef<HTMLFormElement>(null);

  const toggleSection = useCallback((key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handlePdfSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setPdfLoading(true);

    try {
      const res = await fetch('/api/report/comparison-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseId,
          currentId,
          options: {
            clientName: pdfForm.clientName || undefined,
            reportPeriod: pdfForm.reportPeriod || undefined,
            weekNumber: pdfForm.weekNumber ? Number(pdfForm.weekNumber) : undefined,
          },
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `PDF 생성 실패 (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comparison-report-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setShowPdfForm(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setPdfLoading(false);
    }
  }, [baseId, currentId, pdfForm]);

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
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>진단 비교 분석</h1>
            <p className={styles.subtitle}>
              {data.baseUrl} &middot; {baseDate} → {currentDate}
            </p>
          </div>
          <button
            type="button"
            className={styles.pdfButton}
            onClick={() => setShowPdfForm(prev => !prev)}
            aria-expanded={showPdfForm}
            aria-controls="pdf-form"
          >
            PDF 진행 보고서
          </button>
        </div>

        {showPdfForm && (
          <form
            id="pdf-form"
            ref={pdfFormRef}
            className={styles.pdfForm}
            onSubmit={handlePdfSubmit}
          >
            <label className={styles.pdfLabel}>
              <span>고객사명</span>
              <input
                type="text"
                className={styles.pdfInput}
                placeholder="예: 롯데GRS"
                value={pdfForm.clientName}
                onChange={e => setPdfForm(prev => ({ ...prev, clientName: e.target.value }))}
              />
            </label>
            <label className={styles.pdfLabel}>
              <span>보고 기간</span>
              <input
                type="text"
                className={styles.pdfInput}
                placeholder="예: 2026.05.12 ~ 2026.05.16"
                value={pdfForm.reportPeriod}
                onChange={e => setPdfForm(prev => ({ ...prev, reportPeriod: e.target.value }))}
              />
            </label>
            <label className={styles.pdfLabel}>
              <span>주차</span>
              <input
                type="number"
                className={styles.pdfInput}
                placeholder="1"
                min={1}
                value={pdfForm.weekNumber}
                onChange={e => setPdfForm(prev => ({ ...prev, weekNumber: e.target.value }))}
              />
            </label>
            <button
              type="submit"
              className={styles.pdfSubmit}
              disabled={pdfLoading}
            >
              {pdfLoading ? 'PDF 생성 중...' : 'PDF 다운로드'}
            </button>
          </form>
        )}
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
              <ViolationList
                violations={data.newViolations}
                type="new"
                screenshotUrl={data.currentScreenshotUrl}
              />
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
              <ViolationList
                violations={data.resolvedViolations}
                type="resolved"
                screenshotUrl={data.baseScreenshotUrl}
              />
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
