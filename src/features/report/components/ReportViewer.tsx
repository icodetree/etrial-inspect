'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '@/app/page.module.css';
import CostReportModal from '@/components/CostReportModal';
import ProposalModal from '@/components/ProposalModal';
import { AuditResult, Violation } from '@/types';
import SEODetailView from '@/features/seo/components/SEODetailView';
import AIDetailView from '@/features/seo/components/AIDetailView';
import { ViolationDetailModal } from '@/components/ViolationDetailModal';
import { ReportHeader } from './ReportHeader';
import { ReportTabs, REPORT_TAB_PANEL_IDS, REPORT_TAB_IDS, ReportView } from './ReportTabs';
import { ReportFilters } from './ReportFilters';
import { ReportPagination } from './ReportPagination';
import { ReportSummary } from './ReportSummary';
import { ViolationItem } from './ViolationItem';
import { useReportFilters } from '../hooks/useReportFilters';

interface ReportViewerProps {
  initialResult?: AuditResult | null;
}

/**
 * 진단 리포트 화면의 최상위 조립 컴포넌트.
 *
 * 책임:
 * - 결과 로딩 (props 또는 localStorage 폴백)
 * - 탭/모달의 최상위 상태 보유
 * - 자식 컴포넌트(헤더 / 탭 / 요약 / 필터 / 페이지네이션 / 모달)를 조립
 *
 * 세부 UI 와 상태는 다음으로 분리되어 있음:
 *  - {@link ReportHeader} — 제목/액션 + {@link ReportExportButtons} ({@link useReportExport})
 *  - {@link ReportTabs} — 접근성/SEO/GEO 탭 (role="tablist")
 *  - {@link ReportSummary} — 경고 / SPA 메타 / 통계 / 원칙별 위반
 *  - {@link ReportFilters} + {@link useReportFilters} — 필터 + 페이지네이션 상태
 *  - {@link ReportPagination} — 페이지네이션 UI (role="navigation")
 *  - {@link ViolationItem} — 단일 위반 카드
 */
export const ReportViewer = ({ initialResult }: ReportViewerProps) => {
  const [result, setResult] = useState<AuditResult | null>(initialResult || null);
  const [showCostModal, setShowCostModal] = useState(false);
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [activeView, setActiveView] = useState<ReportView>('accessibility');

  useEffect(() => {
    // initialResult 가 없을 때 (예: 일반 /report 페이지) localStorage 에서 로드 시도
    if (!initialResult) {
      try {
        const savedResult = localStorage.getItem('auditResult');
        if (savedResult) {
          const parsed = JSON.parse(savedResult);
          if (parsed && parsed.violations && parsed.summary) {
            setResult(parsed);
          }
        }
      } catch {
        // localStorage 데이터 파싱 실패 시 무시
      }
    }
  }, [initialResult]);

  if (!result || !result.violations || !result.summary) {
    return (
      <main className="container">
        <section className={`card ${styles['empty-card']}`}>
          <h2>진단 결과가 없습니다</h2>
          <p className={styles['empty-text']}>
            먼저 메인 페이지에서 접근성 진단을 수행해주세요.
          </p>
          <Link href="/" className={`btn btn-primary ${styles['back-link']}`}>
            ← 메인으로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  const hasSeo = !!result.seoResult;

  return (
    <div className="container">
      <ReportHeader result={result} onOpenCostModal={() => setShowCostModal(true)} onOpenProposalModal={() => setShowProposalModal(true)} />

      {showCostModal && (
        <CostReportModal
          violations={result.violations}
          onClose={() => setShowCostModal(false)}
        />
      )}

      {showProposalModal && (
        <ProposalModal
          result={result}
          onClose={() => setShowProposalModal(false)}
        />
      )}

      {selectedViolation && (
        <ViolationDetailModal
          violation={selectedViolation}
          boundingBox={selectedViolation.boundingBox}
          screenshotPath={selectedViolation.screenshotPath}
          artifactName={result?.artifactName}
          screenshotUrl={result?.screenshotUrl}
          onClose={() => setSelectedViolation(null)}
        />
      )}

      {/* 상세 분석 탭 네비게이션 (SEO 결과가 있을 때만 표시) */}
      {hasSeo && (
        <div className={styles['tab-section']}>
          <ReportTabs activeView={activeView} onChange={setActiveView} />

          {activeView === 'seo' && result.seoResult && (
            <div
              role="tabpanel"
              id={REPORT_TAB_PANEL_IDS.seo}
              aria-labelledby={REPORT_TAB_IDS.seo}
            >
              <SEODetailView result={result.seoResult} />
            </div>
          )}
          {activeView === 'ai' && result.seoResult && (
            <div
              role="tabpanel"
              id={REPORT_TAB_PANEL_IDS.ai}
              aria-labelledby={REPORT_TAB_IDS.ai}
            >
              <AIDetailView result={result.seoResult} />
            </div>
          )}
        </div>
      )}

      {/* 접근성 콘텐츠 (접근성 탭 활성 시에만 표시) */}
      {activeView === 'accessibility' && (
        <div
          role={hasSeo ? 'tabpanel' : undefined}
          id={hasSeo ? REPORT_TAB_PANEL_IDS.accessibility : undefined}
          aria-labelledby={hasSeo ? REPORT_TAB_IDS.accessibility : undefined}
        >
          <ReportSummary result={result} />
          <ViolationsSection result={result} onSelectViolation={setSelectedViolation} />
        </div>
      )}
    </div>
  );
};

/**
 * 위반 사항 목록 섹션 (필터 + 카드 리스트 + 페이지네이션).
 * useReportFilters 훅을 보유하기 때문에 별도 함수로 분리되어 있음.
 */
const ViolationsSection = ({
  result,
  onSelectViolation,
}: {
  result: AuditResult;
  onSelectViolation: (v: Violation) => void;
}) => {
  const {
    filter,
    setFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    filteredViolations,
    paginatedViolations,
    totalPages,
    uniqueKwcagItems,
  } = useReportFilters(result.violations);

  return (
    <div className="card">
      <h2 className={styles['card-title']}>위반 사항 목록</h2>

      <ReportFilters
        filter={filter}
        onFilterChange={setFilter}
        itemsPerPage={itemsPerPage}
        onItemsPerPageChange={setItemsPerPage}
        filteredCount={filteredViolations.length}
        uniqueKwcagItems={uniqueKwcagItems}
      />

      {paginatedViolations.map((violation, index) => (
        <ViolationItem
          key={`${violation.pageUrl}-${violation.violationNumber}-${index}`}
          violation={violation}
          onSelect={() => onSelectViolation(violation)}
        />
      ))}

      <ReportPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
};
