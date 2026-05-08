'use client';

import styles from '@/app/page.module.css';
import { AuditResult } from '@/types';
import { ReportExportButtons } from './ReportExportButtons';

interface ReportHeaderProps {
  result: AuditResult;
  onOpenCostModal: () => void;
  onOpenProposalModal: () => void;
}

/**
 * 진단 리포트 상단 헤더.
 * Row 1: 제목 + 진단 시간 + 인쇄/메인 링크
 * Row 2: 내보내기 버튼 묶음 ({@link ReportExportButtons})
 */
export const ReportHeader = ({ result, onOpenCostModal, onOpenProposalModal }: ReportHeaderProps) => {
  const handlePrint = () => window.print();

  return (
    <header className={`${styles['report-header']} ${styles['report-header-column']}`}>
      <div className={styles['header-row']}>
        <div>
          <h1 className={styles['report-title']}>접근성 진단 리포트</h1>
          <p className={styles['report-timestamp']}>
            진단 시간:{' '}
            {new Date(result.endTime).toLocaleString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            })}
          </p>
        </div>
        <div className={styles['header-actions']}>
          <a href="/" className="btn btn-secondary">
            ← 메인으로
          </a>
          <button type="button" className="btn btn-secondary" onClick={handlePrint}>
            인쇄
          </button>
        </div>
      </div>

      <ReportExportButtons result={result} onOpenCostModal={onOpenCostModal} onOpenProposalModal={onOpenProposalModal} />
    </header>
  );
};
