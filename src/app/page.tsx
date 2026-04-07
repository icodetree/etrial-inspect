'use client';

import Image from 'next/image';
import logoImg from '../../public/images/logo.png';
import styles from './page.module.css';
import { useAudit } from '@/features/audit/hooks/useAudit';
import { AuditConfigForm } from '@/features/audit/components/AuditConfigForm';
import { AuditTerminal } from '@/features/audit/components/AuditTerminal';
import { HistoryList } from '@/features/history/components/HistoryList';
import { useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';

export default function Home() {
  const router = useRouter();
  const [historyRefreshTrigger, setHistoryRefreshTrigger] = useState(0);

  // 히스토리 갱신 콜백
  const handleHistoryRefresh = useCallback(() => {
    setHistoryRefreshTrigger(prev => prev + 1);
  }, []);

  const {
    config,
    setConfig,
    progress,
    results,
    logs,
    startAudit,
    triggerGitHubAudit,
    exportExcel,
    saveToNotion,
    auditResult,
    isPollingGitHub,
    latestReportId,
    wasGitHubAudit,
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

      // Refresh History List
      setHistoryRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('저장 실패: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleViewLatestReport = () => {
    checkAndNavigateToLatestReport(router);
  };

  const isProcessing = progress.status === 'crawling' || progress.status === 'auditing' || progress.status === 'github_polling';

  return (
    <div className="container">
      <header className={styles.header}>
        <h1 className={styles.title}>
          <Image
            src={logoImg}
            alt="E-Tribe Logo"
            className={`${styles['title-icon']} ${styles['logo-image']}`}
          />
          이트라이브 웹접근성 자동 진단 도구
        </h1>
        <p className={styles.subtitle}>
          KWCAG 2.2 웹 접근성 진단 시스템
        </p>
      </header>

      <main className={styles.main}>
        <div className={styles.grid}>


          {/* 설정 카드 */}
          <section>
            <AuditConfigForm
              config={config}
              setConfig={setConfig}
              onStart={startAudit}
              onGitHubStart={triggerGitHubAudit}
              isProcessing={isProcessing}
            />
          </section>

          {/* 터미널 윈도우 UI */}
          <section>
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

          {/* 진단 이력 리스트 */}
          <section className={styles['full-width']}>
            <HistoryList refreshTrigger={historyRefreshTrigger} />
          </section>
        </div>
      </main>
    </div>
  );
}
