'use client';

import { useAudit } from '@/features/audit/hooks/useAudit';
import { AuditConfigForm } from '@/features/audit/components/AuditConfigForm';
import { AuditPanel } from '@/features/audit/components/AuditPanel';
import { AuditOverlay } from '@/features/audit/components/AuditOverlay';
import { HistoryList } from '@/features/history/components/HistoryList';
import { useRouter } from 'next/navigation';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Gauge, Sparkles } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);
  const [overlayVisible, setOverlayVisible] = useState(false);

  const handleHistoryRefresh = useCallback(() => {
    setHistoryRefreshTrigger(prev => prev + 1);
  }, []);

  const {
    config, setConfig, progress, results, logs,
    startAudit, cancelAudit, triggerGitHubAudit, exportExcel,
    auditResult, latestReportId, wasGitHubAudit,
    checkAndNavigateToLatestReport,
  } = useAudit(handleHistoryRefresh);

  const handleSaveToNotion = async () => {
    if (!auditResult) return;
    try {
      const response = await fetch('/api/history/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auditResult),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to save to Notion');
      }
      const { reportUrl } = await response.json();
      alert(`Notion에 저장되었습니다!\n${reportUrl}`);
      setHistoryRefreshTrigger(prev => prev + 1);
    } catch (error) {
      alert('저장 실패: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleViewLatestReport = () => checkAndNavigateToLatestReport(router);

  // 진단 시작 시 오버레이 자동 표시
  const prevStatusRef = useRef(progress.status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = progress.status;
    if (
      (prev === 'idle' || prev === 'completed' || prev === 'error' || prev === 'cancelled') &&
      (progress.status === 'crawling' || progress.status === 'auditing')
    ) {
      setOverlayVisible(true);
    }
  }, [progress.status]);

  const handleOverlayClose = useCallback(() => setOverlayVisible(false), []);

  const isProcessing = progress.status === 'crawling' || progress.status === 'auditing' || progress.status === 'github_polling';

  const statusLabel = {
    idle: '대기', crawling: '크롤링 중', auditing: '진단 중',
    completed: '완료', error: '오류', github_polling: '대기 중',
    cancelling: '정지 중', cancelled: '취소됨',
  }[progress.status] ?? '대기';

  const stats = [
    {
      label: '진단 횟수',
      value: results ? '1' : '0',
      icon: Activity,
      iconColor: '#9ca3af',
      iconBg: '#f3f4f6',
    },
    {
      label: '발견 위반',
      value: results ? String(results.violations) : '0',
      icon: AlertTriangle,
      iconColor: '#9ca3af',
      iconBg: '#f3f4f6',
    },
    {
      label: '진단 상태',
      value: statusLabel,
      icon: CheckCircle2,
      iconColor: '#9ca3af',
      iconBg: '#f3f4f6',
    },
    {
      label: '페이지 수',
      value: results ? String(results.pages) : String(progress.totalFound || 0),
      icon: Gauge,
      iconColor: '#9ca3af',
      iconBg: '#f3f4f6',
    },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: '#111827', margin: 0 }}>웹접근성 자동 진단 시스템 (KWCAG 2.2)</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={startAudit}
            disabled={isProcessing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={15} aria-hidden="true" />
            <span>진단 시작</span>
          </button>
          <button
            className="btn btn-secondary"
            onClick={exportExcel}
            disabled={!results}
          >
            ↓ 내보내기
          </button>
        </div>
      </div>

      {/* 통계 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              style={{
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '10px',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: '0 0 8px' }}>{stat.label}</p>
                <p style={{ fontSize: '2rem', fontWeight: 700, color: '#111827', margin: 0, lineHeight: 1 }}>{stat.value}</p>
              </div>
              <div style={{ background: stat.iconBg, borderRadius: '8px', padding: '8px' }}>
                <Icon size={20} color={stat.iconColor} aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 진단 설정 */}
      <section aria-label="진단 설정" style={{ marginBottom: '1.5rem' }}>
        <AuditConfigForm
          config={config}
          setConfig={setConfig}
          onStart={startAudit}
          onGitHubStart={triggerGitHubAudit}
          isProcessing={isProcessing}
        />
      </section>

      {/* 진단 완료 후 결과 액션 바 */}
      {progress.status === 'completed' && results && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: '10px',
            borderLeft: '4px solid var(--c-success)',
          }}
        >
          <span style={{ fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
            진단 완료 — {results.pages}페이지, 위반 {results.violations}건
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary" onClick={() => handleViewLatestReport()} style={{ fontSize: '0.8125rem' }}>
              리포트 보기
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleSaveToNotion}
              style={{ fontSize: '0.8125rem', background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' }}
            >
              Notion 저장
            </button>
            <button className="btn btn-secondary" onClick={exportExcel} style={{ fontSize: '0.8125rem' }}>
              엑셀 다운로드
            </button>
          </div>
        </div>
      )}

      {/* 진단 이력 */}
      <section id="history" aria-label="진단 이력">
        <HistoryList refreshTrigger={historyRefreshTrigger} />
      </section>

      {/* 3D 로딩 오버레이 */}
      {overlayVisible && progress.status !== 'idle' && (
        <AuditOverlay
          logs={logs}
          progress={progress}
          onExport={() => { exportExcel(); handleOverlayClose(); }}
          onSaveToNotion={() => { if (auditResult) { handleSaveToNotion(); handleOverlayClose(); } }}
          onCancel={cancelAudit}
          resultSummary={results}
          onViewLatestReport={() => { handleViewLatestReport(); handleOverlayClose(); }}
          onClose={handleOverlayClose}
        />
      )}

      {/* 진단 진행 패널 (하단 고정) — 오버레이 활성 시 숨김 */}
      {!overlayVisible && (
        <AuditPanel
          logs={logs}
          progress={progress}
          onExport={exportExcel}
          onSaveToNotion={() => { if (auditResult) handleSaveToNotion(); }}
          onCancel={cancelAudit}
          resultSummary={results}
          latestReportId={latestReportId}
          wasGitHubAudit={wasGitHubAudit}
          onViewLatestReport={handleViewLatestReport}
        />
      )}
    </div>
  );
}
