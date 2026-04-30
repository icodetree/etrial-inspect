'use client';

import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { LogEntry, ProgressState } from '../hooks/useAudit';
import styles from './AuditOverlay.module.css';

interface AuditOverlayProps {
  logs: LogEntry[];
  progress: ProgressState;
  onExport: () => void;
  onSaveToNotion: () => void;
  onCancel?: () => void;
  resultSummary: { pages: number; violations: number } | null;
  onViewLatestReport?: () => void;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  crawling: '크롤링 진행 중',
  auditing: '접근성 진단 중',
  completed: '진단 완료',
  error: '오류 발생',
  github_polling: 'GitHub Actions 대기',
  cancelling: '정지 중...',
  cancelled: '취소됨',
};

const BADGE_ITEMS = [
  { label: '웹접근성 자동 진단', cls: 'badge1' as const },
  { label: 'KWCAG 2.2 준수 검사', cls: 'badge2' as const },
  { label: 'AI 기반 분석 엔진', cls: 'badge3' as const },
  { label: '실시간 모니터링', cls: 'badge4' as const },
];

export const AuditOverlay = ({
  logs,
  progress,
  onExport,
  onSaveToNotion,
  onCancel,
  resultSummary,
  onViewLatestReport,
  onClose,
}: AuditOverlayProps) => {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isProcessing =
    progress.status === 'crawling' ||
    progress.status === 'auditing' ||
    progress.status === 'github_polling';

  const isCompleted = progress.status === 'completed';
  const canCancel =
    !!onCancel &&
    (progress.status === 'crawling' || progress.status === 'auditing');

  const statusMessage = useMemo(() => {
    if (isCompleted && resultSummary) {
      return `${resultSummary.pages}페이지 · ${resultSummary.violations}건 발견`;
    }
    if (logs.length > 0) {
      const lastMsg = logs[logs.length - 1].message;
      return lastMsg.length > 40 ? lastMsg.slice(0, 40) + '...' : lastMsg;
    }
    return '초기화 중...';
  }, [logs, isCompleted, resultSummary]);

  const statusLabel = STATUS_LABELS[progress.status] ?? '진행 중';
  const progressText = isProcessing
    ? `${progress.processed} / ${progress.totalFound || '?'}`
    : '';

  return (
    <div className={styles.overlay} role="dialog" aria-label="진단 진행 오버레이">
      <button className={styles.closeBtn} onClick={onClose} aria-label="오버레이 닫기">
        <X size={24} />
      </button>

      <div className={styles.content}>
        {/* ── 레이더 시각화 ── */}
        <div className={styles.sceneContainer}>
          {/* 플로팅 배지 */}
          {BADGE_ITEMS.map((item) => (
            <div key={item.cls} className={`${styles.badge} ${styles[item.cls]}`}>
              {item.label}
            </div>
          ))}

          {/* 레이더 디스크 */}
          <div className={styles.scene}>
            <div className={styles.radar}>
              {/* 동심원 가이드 */}
              <div className={styles.radarRing} />
              <div className={styles.radarRing} />
              <div className={styles.radarRing} />

              {/* 십자선 */}
              <div className={styles.radarCross} />

              {/* 스윕 암 (회전하는 빔) */}
              <div className={styles.radarSweep} />

              {/* 블립 점 */}
              <div className={styles.radarDot} />
              <div className={styles.radarDot} />
              <div className={styles.radarDot} />
              <div className={styles.radarDot} />

              {/* 중앙 점 */}
              <div className={styles.radarCenter} />

              {/* 핑 링 (확장 파동) */}
              <div className={styles.pingRing} />
              <div className={styles.pingRing} />
              <div className={styles.pingRing} />
            </div>
          </div>

          {/* 플랫폼 글로우 */}
          <div className={styles.platform} />
        </div>

        {/* ── 상태 텍스트 ── */}
        <div className={styles.statusArea}>
          <div className={styles.statusLabel}>{statusLabel}</div>
          <div className={styles.statusMessage} key={statusMessage}>
            {statusMessage}
          </div>
          {progressText && (
            <div className={styles.progressCount}>{progressText}</div>
          )}
        </div>

        {/* 프로그레스 바 */}
        {isProcessing && progress.totalFound > 0 && (
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-valuenow={progress.processed}
            aria-valuemax={progress.totalFound}
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, #6366f1, #06b6d4, #6366f1)',
                borderRadius: 'inherit',
                transform: `scaleX(${Math.min(progress.processed / (progress.totalFound || 1), 1)})`,
                transformOrigin: 'left',
                transition: 'transform 0.3s ease-out',
              }}
            />
          </div>
        )}

        {/* ── 완료 후 버튼 ── */}
        {isCompleted && (
          <div className={styles.actionButtons}>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => { onViewLatestReport?.(); onClose(); }}
            >
              상세 리포트 보기
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => { onExport(); onClose(); }}
            >
              엑셀 다운로드
            </button>
            <button
              className={styles.actionBtn}
              onClick={() => { onSaveToNotion(); onClose(); }}
            >
              Notion 저장
            </button>
          </div>
        )}

        {canCancel && (
          <div className={styles.cancelArea}>
            <button
              className={styles.actionBtn}
              onClick={() => onCancel?.()}
              style={{ color: '#f87171', borderColor: 'rgba(248,113,113,0.3)' }}
            >
              진단 정지
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
