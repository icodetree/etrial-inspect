'use client';

import styles from '@/app/page.module.css';
import { AuditResult } from '@/types';
import { useReportExport } from '../hooks/useReportExport';

interface ReportExportButtonsProps {
  result: AuditResult;
  onOpenCostModal: () => void;
}

/**
 * 진단 리포트 상단의 내보내기 버튼 묶음.
 * - 공수 산출 모달 트리거
 * - 엑셀 / JSON / PDF 다운로드
 * - Notion 저장
 * - 33개 체크리스트 페이지 링크
 */
export const ReportExportButtons = ({ result, onOpenCostModal }: ReportExportButtonsProps) => {
  const {
    exportJSON,
    exportExcel,
    exportPDF,
    saveToNotion,
    pdfExporting,
    savingNotion,
  } = useReportExport(result);

  return (
    <div className={styles['action-row']}>
      <button type="button" className="btn btn-secondary" onClick={onOpenCostModal}>
        공수 산출
      </button>
      <button type="button" className="btn btn-secondary" onClick={exportExcel}>
        엑셀 다운로드
      </button>
      <button type="button" className="btn btn-secondary" onClick={exportJSON}>
        JSON 다운로드
      </button>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={exportPDF}
        disabled={pdfExporting}
      >
        {pdfExporting ? 'PDF 생성 중...' : 'PDF 보고서'}
      </button>
      <button
        type="button"
        className={`btn btn-secondary ${styles['btn-notion']}`}
        onClick={saveToNotion}
        disabled={savingNotion}
      >
        {savingNotion ? 'Notion 저장 중...' : 'Notion 저장'}
      </button>
      <a href="/report/checklist" className="btn btn-secondary">
        33개 체크리스트
      </a>
    </div>
  );
};
