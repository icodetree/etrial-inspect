'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  X,
  Terminal,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Square,
} from 'lucide-react';
import { AuditTerminal } from './AuditTerminal';
import { LogEntry, ProgressState } from '../hooks/useAudit';
import styles from './AuditPanel.module.css';

interface AuditPanelProps {
  logs: LogEntry[];
  progress: ProgressState;
  onExport: () => void;
  onSaveToNotion: () => void;
  onCancel?: () => void;
  resultSummary: { pages: number; violations: number } | null;
  latestReportId?: string | null;
  wasGitHubAudit?: boolean;
  onViewLatestReport?: () => void;
}

const STATUS_LABELS: Record<ProgressState['status'], string> = {
  idle: '대기',
  crawling: '크롤링 중',
  auditing: '진단 중',
  summarizing: '결과 집계 중',
  completed: '진단 완료',
  error: '오류 발생',
  github_polling: 'GitHub 대기 중',
  cancelling: '정지 중...',
  cancelled: '취소됨',
};

const STATUS_STYLE_MAP: Record<string, string> = {
  crawling: styles.statusCrawling,
  auditing: styles.statusAuditing,
  github_polling: styles.statusPolling,
  completed: styles.statusCompleted,
  error: styles.statusError,
  cancelling: styles.statusError,
  cancelled: styles.statusError,
};

function StatusIcon({ status }: { status: ProgressState['status'] }) {
  switch (status) {
    case 'crawling':
    case 'auditing':
    case 'github_polling':
    case 'cancelling':
      return <Loader2 size={16} className={styles.spinning} aria-hidden="true" />;
    case 'completed':
      return <CheckCircle2 size={16} aria-hidden="true" />;
    case 'error':
    case 'cancelled':
      return <AlertTriangle size={16} aria-hidden="true" />;
    default:
      return <Terminal size={16} aria-hidden="true" />;
  }
}

export const AuditPanel = ({
  logs,
  progress,
  onExport,
  onSaveToNotion,
  onCancel,
  resultSummary,
  latestReportId,
  wasGitHubAudit,
  onViewLatestReport,
}: AuditPanelProps) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isClosed, setIsClosed] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);

  const isActive = progress.status !== 'idle';

  /* 진단이 시작되면 패널을 열고, 슬라이드업 애니메이션 적용 */
  useEffect(() => {
    if (isActive) {
      setIsClosed(false);
      setIsExpanded(true);
      setHasAnimated(false);
      /* requestAnimationFrame으로 다음 렌더에서 애니메이션 클래스 적용 */
      requestAnimationFrame(() => {
        setHasAnimated(true);
      });
    }
  }, [isActive]);

  const handleToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const handleClose = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setIsClosed(true);
  }, []);

  const handleHeaderKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  }, [handleToggle]);

  const handleCloseKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClose(e);
    }
  }, [handleClose]);

  /* idle 상태이거나 사용자가 닫았으면 숨김 */
  if (!isActive || isClosed) {
    return null;
  }

  const statusLabel = STATUS_LABELS[progress.status] ?? '대기';
  const statusClassName = STATUS_STYLE_MAP[progress.status] ?? '';
  const isProcessing = progress.status === 'crawling' || progress.status === 'auditing' || progress.status === 'github_polling';
  const canCancel = !!onCancel && (progress.status === 'crawling' || progress.status === 'auditing');

  const progressText = isProcessing
    ? `(${progress.processed}/${progress.totalFound || '?'})`
    : progress.status === 'completed' && resultSummary
      ? `- ${resultSummary.pages}페이지, 위반 ${resultSummary.violations}건`
      : '';

  const panelClassNames = [
    styles.panel,
    hasAnimated ? styles.panelEnter : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={panelClassNames}
      data-state={isExpanded ? 'expanded' : 'minimized'}
      role="region"
      aria-label="진단 진행 패널"
    >
      {/* 헤더 바 — 항상 표시 */}
      <div
        className={styles.panelHeader}
        onClick={handleToggle}
        onKeyDown={handleHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls="audit-panel-body"
        aria-label={isExpanded ? '진단 패널 최소화' : '진단 패널 확장'}
      >
        <div className={`${styles.panelStatus} ${statusClassName}`}>
          <span className={styles.statusIcon}>
            <StatusIcon status={progress.status} />
          </span>
          <span className={styles.statusText}>{statusLabel}</span>
          {progressText && (
            <span className={styles.progressInfo}>{progressText}</span>
          )}
        </div>

        <div className={styles.panelActions}>
          {canCancel && (
            <button
              type="button"
              className={`${styles.iconButton} ${styles.cancelBtn}`}
              onClick={(e) => {
                e.stopPropagation();
                onCancel?.();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onCancel?.();
                }
              }}
              aria-label="진단 정지"
              title="진단 정지"
            >
              <Square size={16} aria-hidden="true" fill="currentColor" />
            </button>
          )}
          <button
            type="button"
            className={styles.iconButton}
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            aria-label={isExpanded ? '패널 최소화' : '패널 확장'}
          >
            {isExpanded
              ? <ChevronDown size={18} aria-hidden="true" />
              : <ChevronUp size={18} aria-hidden="true" />
            }
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={handleClose}
            onKeyDown={handleCloseKeyDown}
            aria-label="진단 패널 닫기"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 확장 콘텐츠 */}
      {isExpanded && (
        <div className={styles.panelBody} id="audit-panel-body">
          <AuditTerminal
            logs={logs}
            progress={progress}
            onExport={onExport}
            onSaveToNotion={onSaveToNotion}
            resultSummary={resultSummary}
            latestReportId={latestReportId}
            wasGitHubAudit={wasGitHubAudit}
            onViewLatestReport={onViewLatestReport}
          />
        </div>
      )}
    </div>
  );
};
