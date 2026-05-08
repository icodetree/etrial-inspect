'use client';

import { useCallback, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAltTextAudit } from '@/features/alttext/hooks/useAltTextAudit';
import { AltTextAuditForm } from '@/features/alttext/components/AltTextAuditForm';
import { AltTextResultViewer } from '@/features/alttext/components/AltTextResultViewer';
import { AltTextOverlay } from '@/features/alttext/components/AltTextOverlay';
import styles from './page.module.css';

export default function AltTextPage() {
  const { config, setConfig, progress, logs, result, startScan, cancelScan } = useAltTextAudit();
  const [isSavingNotion, setIsSavingNotion] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  const handleStartScan = useCallback(() => {
    setShowOverlay(true);
    startScan();
  }, [startScan]);

  const handleSaveToNotion = useCallback(async () => {
    if (!result) return;
    setIsSavingNotion(true);
    try {
      const res = await fetch('/api/alttext/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Notion 저장 실패');
      }
      const { reportUrl } = await res.json();
      alert(`Notion에 저장되었습니다!\n${reportUrl ?? ''}`);
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsSavingNotion(false);
    }
  }, [result]);

  const handleScrollToResult = useCallback(() => {
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleExportExcel = useCallback(async () => {
    if (!result) return;
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
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alttext-audit-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      alert(`엑셀 다운로드 실패: ${error instanceof Error ? error.message : error}`);
    }
  }, [result]);

  const isProcessing = progress.status === 'crawling' || progress.status === 'scanning';

  const resultSummary = result
    ? { pages: result.totalUrls, images: result.totalImagesScanned, mismatches: result.totalMismatches }
    : null;

  return (
    <div className={styles.page}>
      {/* 오버레이 */}
      {showOverlay && progress.status !== 'idle' && (
        <AltTextOverlay
          logs={logs}
          progress={progress}
          onClose={() => setShowOverlay(false)}
          onCancel={cancelScan}
          onScrollToResult={handleScrollToResult}
          onExport={handleExportExcel}
          onSaveToNotion={handleSaveToNotion}
          resultSummary={resultSummary}
        />
      )}

      {/* 헤더 */}
      <div className={styles['page-header']}>
        <h1 className={styles['page-title']}>
          이미지 진단 (대체 텍스트 OCR 검증)
        </h1>
        <button
          className={`btn btn-primary ${styles['start-btn']}`}
          onClick={handleStartScan}
          disabled={isProcessing}
        >
          <Sparkles size={15} aria-hidden="true" />
          <span>이미지 진단 시작</span>
        </button>
      </div>

      {/* 입력 폼 */}
      <section aria-label="이미지 진단 설정" className={styles['config-section']}>
        <AltTextAuditForm
          config={config}
          setConfig={setConfig}
          onStart={handleStartScan}
          isProcessing={isProcessing}
        />
      </section>

      {/* 결과 뷰어 */}
      {result && (
        <section ref={resultRef} aria-label="이미지 진단 결과">
          <AltTextResultViewer
            result={result}
            onSaveToNotion={handleSaveToNotion}
            isSavingNotion={isSavingNotion}
          />
        </section>
      )}
    </div>
  );
}
