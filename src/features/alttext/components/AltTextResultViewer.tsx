'use client';

import { useState } from 'react';
import AltTextScanSection from '@/features/report/components/AltTextScanSection';
import type { AltTextAuditResult } from '@/types/alt-text';
import styles from '@/app/page.module.css';

interface AltTextResultViewerProps {
  result: AltTextAuditResult;
  onSaveToNotion?: () => Promise<void> | void;
  isSavingNotion?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  a.remove();
}

function todayStamp(): string {
  return new Date().toISOString().split('T')[0];
}

export const AltTextResultViewer = ({ result, onSaveToNotion, isSavingNotion }: AltTextResultViewerProps) => {
  const [pdfExporting, setPdfExporting] = useState(false);
  const [excelExporting, setExcelExporting] = useState(false);

  const handleExportJSON = () => {
    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    downloadBlob(blob, `alttext-audit-${todayStamp()}.json`);
  };

  const handleExportExcel = async () => {
    if (excelExporting) return;
    setExcelExporting(true);
    try {
      const res = await fetch('/api/alttext/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '엑셀 생성 실패');
      }
      const blob = await res.blob();
      downloadBlob(blob, `alttext-audit-${todayStamp()}.xlsx`);
    } catch (error) {
      alert(`엑셀 다운로드 실패: ${error instanceof Error ? error.message : error}`);
    } finally {
      setExcelExporting(false);
    }
  };

  const handleExportPDF = async () => {
    if (pdfExporting) return;
    setPdfExporting(true);
    try {
      const res = await fetch('/api/alttext/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result, options: { title: '이미지 대체텍스트 진단 보고서' } }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'PDF 생성 실패');
      }
      const blob = await res.blob();
      downloadBlob(blob, `alttext-report-${todayStamp()}.pdf`);
    } catch (error) {
      alert(`PDF 다운로드 실패: ${error instanceof Error ? error.message : error}`);
    } finally {
      setPdfExporting(false);
    }
  };

  const counts = result.countsByJudgment;

  return (
    <div className="container">
      <header className={`${styles['report-header']} ${styles['report-header-column']}`}>
        <div className={styles['header-row']}>
          <div>
            <h1 className={styles['report-title']}>이미지 진단 보고서</h1>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
              진단 시간: {new Date(result.endTime).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
              {result.inspector ? ` · 점검자: ${result.inspector}` : ''}
            </p>
          </div>
        </div>

        <div className={styles['action-row']}>
          <button
            className="btn btn-secondary"
            onClick={handleExportExcel}
            disabled={excelExporting}
          >
            {excelExporting ? '엑셀 생성 중...' : '엑셀 다운로드'}
          </button>
          <button className="btn btn-secondary" onClick={handleExportJSON}>
            JSON 다운로드
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportPDF}
            disabled={pdfExporting}
          >
            {pdfExporting ? 'PDF 생성 중...' : 'PDF 보고서'}
          </button>
          {onSaveToNotion && (
            <button
              className="btn btn-secondary"
              onClick={() => onSaveToNotion()}
              disabled={isSavingNotion}
              style={{ background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' }}
            >
              {isSavingNotion ? 'Notion 저장 중...' : 'Notion 저장'}
            </button>
          )}
        </div>
      </header>

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem 1.25rem',
          background: '#fff',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{ marginTop: 0 }}>요약</h3>
        <ul style={{ margin: 0, lineHeight: 1.8 }}>
          <li>대상 URL: {result.totalUrls}개</li>
          <li>OCR 실행 이미지: {result.totalImagesScanned}장</li>
          <li>불일치(pass 제외): {result.totalMismatches}건</li>
          <li>
            판정별 카운트 — 정상 {counts.pass} / alt 누락 {counts.missing_alt} /
            장식 오분류 {counts.decorative_mismatch} / 텍스트 불일치 {counts.text_mismatch} /
            수동 검토 {counts.review_needed}
          </li>
        </ul>
      </section>

      <AltTextScanSection scans={result.scans} />
    </div>
  );
};

export default AltTextResultViewer;
