'use client';

import { useState } from 'react';
import { AuditResult } from '@/types';
import { getPlatformAuditService } from '@/services/platform/factory';

/**
 * 진단 결과 내보내기 (JSON / Excel / PDF / Notion) 핸들러를 제공하는 훅.
 *
 * 책임:
 * - 4종 내보내기 트리거 함수
 * - PDF/Notion 비동기 처리 중 진행 상태(`pdfExporting`, `savingNotion`)
 * - PDF 실패 시 HTML 폴백 confirm 흐름
 *
 * UI 컴포넌트는 이 훅이 노출하는 핸들러와 상태만 사용한다.
 */
export const useReportExport = (result: AuditResult) => {
  const [pdfExporting, setPdfExporting] = useState(false);
  const [savingNotion, setSavingNotion] = useState(false);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const getDomain = () => {
    try {
      return result?.pages?.[0]?.url ? new URL(result.pages[0].url).hostname : 'report';
    } catch {
      return 'report';
    }
  };

  const exportJSON = () => {
    if (!result) return;
    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    downloadBlob(blob, `kwcag-audit-${new Date().toISOString().split('T')[0]}.json`);
  };

  const exportExcel = async () => {
    try {
      const service = getPlatformAuditService();
      await service.exportExcel(result);
    } catch (error) {
      alert(`엑셀 다운로드 실패: ${error}`);
    }
  };

  const saveToNotion = async () => {
    if (!result || savingNotion) return;
    setSavingNotion(true);
    try {
      const response = await fetch('/api/history/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Notion 저장 실패');
      }
      const { reportUrl } = await response.json();
      alert(`Notion에 저장되었습니다!\n${reportUrl ?? ''}`);
    } catch (error) {
      alert(`저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSavingNotion(false);
    }
  };

  const downloadHTMLFallback = async () => {
    if (!result) return;
    setPdfExporting(true);
    try {
      const response = await fetch('/api/report/pdf', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          options: { title: '웹 접근성 진단 보고서', includeScreenshots: true },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'HTML 생성 실패' }));
        throw new Error(err.error || 'HTML 생성 실패');
      }
      const blob = await response.blob();
      downloadBlob(
        blob,
        `accessibility-report-${getDomain()}-${new Date().toISOString().split('T')[0]}.html`
      );
    } catch (error) {
      alert(`HTML 다운로드 실패: ${error instanceof Error ? error.message : error}`);
    } finally {
      setPdfExporting(false);
    }
  };

  const exportPDF = async () => {
    if (!result || pdfExporting) return;
    setPdfExporting(true);
    try {
      const response = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          options: { title: '웹 접근성 진단 보고서', includeScreenshots: true },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'PDF 생성 실패' }));
        // PDF 실패 시 HTML 폴백 제안
        const useHtml = window.confirm(
          'PDF 생성에 실패했습니다.\n(데이터가 너무 커서 변환 중 시간 초과)\n\nHTML 파일로 대신 다운로드하시겠습니까?\n(브라우저에서 열어 인쇄→PDF 저장 가능)'
        );
        if (useHtml) {
          setPdfExporting(false);
          await downloadHTMLFallback();
          return;
        }
        throw new Error(err.error || 'PDF 생성 실패');
      }
      const blob = await response.blob();
      downloadBlob(
        blob,
        `accessibility-report-${getDomain()}-${new Date().toISOString().split('T')[0]}.pdf`
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('PDF 생성 실패')) return; // 이미 confirm에서 처리됨
      alert(`PDF 다운로드 실패: ${error instanceof Error ? error.message : error}`);
    } finally {
      setPdfExporting(false);
    }
  };

  return {
    exportJSON,
    exportExcel,
    exportPDF,
    saveToNotion,
    pdfExporting,
    savingNotion,
  };
};
