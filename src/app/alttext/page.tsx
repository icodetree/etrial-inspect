'use client';

import { useCallback, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useAltTextAudit } from '@/features/alttext/hooks/useAltTextAudit';
import { AltTextAuditForm } from '@/features/alttext/components/AltTextAuditForm';
import { AltTextResultViewer } from '@/features/alttext/components/AltTextResultViewer';
import { AltTextHistoryList } from '@/features/alttext/components/AltTextHistoryList';

export default function AltTextPage() {
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const { config, setConfig, progress, logs, result, startScan } = useAltTextAudit(() => setHistoryRefreshTrigger(prev => prev + 1));
  const [isSavingNotion, setIsSavingNotion] = useState(false);

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
      setHistoryRefreshTrigger(prev => prev + 1);
    } catch (e) {
      alert(`저장 실패: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setIsSavingNotion(false);
    }
  }, [result]);

  const isProcessing = progress.status === 'running';

  return (
    <div style={{ padding: '2rem' }}>
      {/* 헤더 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', margin: 0 }}>
          이미지 진단 (대체 텍스트 OCR 검증)
        </h1>
        <button
          className="btn btn-primary"
          onClick={startScan}
          disabled={isProcessing}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Sparkles size={15} aria-hidden="true" />
          <span>이미지 진단 시작</span>
        </button>
      </div>

      {/* 입력 폼 */}
      <section aria-label="이미지 진단 설정" style={{ marginBottom: '1.5rem' }}>
        <AltTextAuditForm
          config={config}
          setConfig={setConfig}
          onStart={startScan}
          isProcessing={isProcessing}
        />
      </section>

      {/* 진행 로그 */}
      {(progress.status !== 'idle' || logs.length > 0) && (
        <section
          aria-label="진행 로그"
          style={{
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: '10px',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            lineHeight: 1.6,
            maxHeight: '240px',
            overflowY: 'auto',
          }}
        >
          {logs.map((log, i) => (
            <div key={i}>
              <span style={{ color: '#64748b' }}>[{log.time}]</span> {log.message}
            </div>
          ))}
          {progress.status === 'running' && <div style={{ color: '#fbbf24' }}>실행 중...</div>}
          {progress.status === 'completed' && (
            <div style={{ color: '#34d399', marginTop: '0.5rem' }}>{progress.message}</div>
          )}
          {progress.status === 'error' && (
            <div style={{ color: '#f87171', marginTop: '0.5rem' }}>오류: {progress.message}</div>
          )}
        </section>
      )}

      {/* 결과 뷰어 */}
      {result && (
        <section aria-label="이미지 진단 결과" style={{ marginBottom: '1.5rem' }}>
          <AltTextResultViewer
            result={result}
            onSaveToNotion={handleSaveToNotion}
            isSavingNotion={isSavingNotion}
          />
        </section>
      )}

      {/* 이력 리스트 */}
      <section aria-label="이미지 진단 이력">
        <AltTextHistoryList refreshTrigger={historyRefreshTrigger} />
      </section>
    </div>
  );
}
