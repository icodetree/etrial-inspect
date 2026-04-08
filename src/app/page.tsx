'use client';

import { useAudit } from '@/features/audit/hooks/useAudit';
import { AuditConfigForm } from '@/features/audit/components/AuditConfigForm';
import { AuditTerminal } from '@/features/audit/components/AuditTerminal';
import { HistoryList } from '@/features/history/components/HistoryList';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import { Activity, AlertTriangle, CheckCircle2, Gauge } from 'lucide-react';

export default function Home() {
  const router = useRouter();
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  const handleHistoryRefresh = useCallback(() => {
    setHistoryRefreshTrigger(prev => prev + 1);
  }, []);

  const {
    config, setConfig, progress, results, logs,
    startAudit, triggerGitHubAudit, exportExcel,
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

  const isProcessing = progress.status === 'crawling' || progress.status === 'auditing' || progress.status === 'github_polling';

  const statusLabel = {
    idle: '대기', crawling: '크롤링 중', auditing: '진단 중',
    completed: '완료', error: '오류', github_polling: '대기 중',
  }[progress.status] ?? '대기';

  const stats = [
    {
      label: '진단 횟수',
      value: results ? '1' : '0',
      icon: Activity,
      iconColor: '#2563eb',
      iconBg: '#eff6ff',
    },
    {
      label: '발견 위반',
      value: results ? String(results.violations) : '0',
      icon: AlertTriangle,
      iconColor: '#dc2626',
      iconBg: '#fef2f2',
    },
    {
      label: '진단 상태',
      value: statusLabel,
      icon: CheckCircle2,
      iconColor: progress.status === 'completed' ? '#16a34a' : progress.status === 'error' ? '#dc2626' : '#d97706',
      iconBg: progress.status === 'completed' ? '#f0fdf4' : progress.status === 'error' ? '#fef2f2' : '#fffbeb',
    },
    {
      label: '페이지 수',
      value: results ? String(results.pages) : String(progress.totalFound || 0),
      icon: Gauge,
      iconColor: '#7c3aed',
      iconBg: '#f5f3ff',
    },
  ];

  return (
    <div style={{ padding: '2rem' }}>
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>웹접근성 진단</h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '4px' }}>KWCAG 2.2 자동 진단 시스템</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={startAudit}
            disabled={isProcessing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            ▶ 진단 시작
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

      {/* 설정 + 터미널 2열 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <section aria-label="진단 설정">
          <AuditConfigForm
            config={config}
            setConfig={setConfig}
            onStart={startAudit}
            onGitHubStart={triggerGitHubAudit}
            isProcessing={isProcessing}
          />
        </section>
        <section aria-label="진단 로그">
          <AuditTerminal
            logs={logs}
            progress={progress}
            onExport={exportExcel}
            onSaveToNotion={() => { if (auditResult) handleSaveToNotion(); }}
            resultSummary={results}
            latestReportId={latestReportId}
            wasGitHubAudit={wasGitHubAudit}
            onViewLatestReport={handleViewLatestReport}
          />
        </section>
      </div>

      {/* 진단 이력 */}
      <section id="history" aria-label="진단 이력">
        <HistoryList refreshTrigger={historyRefreshTrigger} />
      </section>
    </div>
  );
}
