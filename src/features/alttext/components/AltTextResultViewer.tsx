'use client';

import { useState } from 'react';
import AltTextScanSection from '@/features/report/components/AltTextScanSection';
import type { AltTextAuditResult } from '@/types/alt-text';
import styles from './AltTextResultViewer.module.css';

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

  // 소요 시간 계산
  const elapsedSeconds = result.startTime && result.endTime
    ? Math.round((new Date(result.endTime).getTime() - new Date(result.startTime).getTime()) / 1000)
    : null;
  const elapsedDisplay = elapsedSeconds !== null
    ? elapsedSeconds >= 60
      ? `${Math.floor(elapsedSeconds / 60)}분 ${elapsedSeconds % 60}초`
      : `${elapsedSeconds}초`
    : null;

  return (
    <div className="container">
      <header className={`${styles['report-header']} ${styles['report-header-column']}`}>
        <div className={styles['header-row']}>
          <div>
            <h1 className={styles['report-title']}>이미지 진단 보고서</h1>
            <p className={styles['header-time']}>
              진단 시간: {new Date(result.endTime).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
              {elapsedDisplay ? ` · 소요 시간: ${elapsedDisplay}` : ''}
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
              className={`btn btn-secondary ${styles['notion-btn']}`}
              onClick={() => onSaveToNotion()}
              disabled={isSavingNotion}
            >
              {isSavingNotion ? 'Notion 저장 중...' : 'Notion 저장'}
            </button>
          )}
        </div>
      </header>

      <section className={styles['summary-section']}>
        <h3 className={styles['summary-title']}>요약</h3>
        <ul className={styles['summary-list']}>
          <li>대상 URL: {result.totalUrls}개</li>
          <li>OCR 실행 이미지: {result.totalImagesScanned}장</li>
          <li>불일치(pass 제외): {result.totalMismatches}건</li>
          <li>
            판정별 카운트 — 정상 {counts.pass} / alt 누락 {counts.missing_alt} /
            장식 오분류 {counts.decorative_mismatch} / 텍스트 불일치 {counts.text_mismatch} /
            수동 검토 {counts.review_needed}
          </li>
        </ul>

        {result.siteInfo && (
          <div
            aria-label="사이트 유형 정보"
            className={styles['site-info']}
          >
            <span className={styles['badge-framework']}>
              프레임워크: {result.siteInfo.framework === 'unknown' ? '정적 HTML' : result.siteInfo.framework}
            </span>
            <span className={styles['badge-render']}>
              렌더링: {result.siteInfo.renderStrategy === 'unknown' ? '일반' : result.siteInfo.renderStrategy}
            </span>
            <span
              className={
                result.siteInfo.spaReadyStatus === 'ready'
                  ? styles['badge-status-ready']
                  : result.siteInfo.spaReadyStatus === 'partial'
                    ? styles['badge-status-partial']
                    : styles['badge-status-timeout']
              }
              title={result.siteInfo.notes.length > 0 ? result.siteInfo.notes.join(', ') : undefined}
            >
              페이지 상태: {result.siteInfo.spaReadyStatus === 'ready' ? '정상' : result.siteInfo.spaReadyStatus === 'partial' ? '부분 로드' : '타임아웃'}
            </span>
            <span className={styles['badge-hydration']}>
              하이드레이션: {result.siteInfo.hydrationMs}ms
            </span>
          </div>
        )}
      </section>

      <AltTextScanSection scans={result.scans} />
    </div>
  );
};

export default AltTextResultViewer;
