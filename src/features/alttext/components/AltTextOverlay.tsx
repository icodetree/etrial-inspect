'use client';

import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { AltTextLogEntry, AltTextProgressState } from '../hooks/useAltTextAudit';
import styles from '@/features/audit/components/AuditOverlay.module.css';

interface AltTextOverlayProps {
  logs: AltTextLogEntry[];
  progress: AltTextProgressState;
  onClose: () => void;
  onExport?: () => void;
  onSaveToNotion?: () => void;
  onScrollToResult?: () => void;
  resultSummary?: { pages: number; images: number; mismatches: number } | null;
}

const STATUS_LABELS: Record<string, string> = {
  running: '이미지 진단 진행 중',
  completed: '이미지 진단 완료',
  error: '오류 발생',
};

const BADGE_ITEMS = [
  { label: '이미지 대체텍스트 검증', cls: 'badge1' as const },
  { label: 'OCR 기반 분석', cls: 'badge2' as const },
  { label: 'KWCAG 2.2 준수 검사', cls: 'badge3' as const },
  { label: '실시간 모니터링', cls: 'badge4' as const },
];

export const AltTextOverlay = ({
  logs,
  progress,
  onClose,
  onExport,
  onSaveToNotion,
  onScrollToResult,
  resultSummary,
}: AltTextOverlayProps) => {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const isRunning = progress.status === 'running';
  const isCompleted = progress.status === 'completed';

  const statusMessage = useMemo(() => {
    if (isCompleted && resultSummary) {
      return `${resultSummary.pages}페이지 · ${resultSummary.images}장 · 불일치 ${resultSummary.mismatches}건`;
    }
    if (logs.length > 0) {
      const lastMsg = logs[logs.length - 1].message;
      return lastMsg.length > 50 ? lastMsg.slice(0, 50) + '...' : lastMsg;
    }
    return '초기화 중...';
  }, [logs, isCompleted, resultSummary]);

  const statusLabel = STATUS_LABELS[progress.status] ?? '진행 중';

  const ariaLabel = isRunning
    ? '이미지 진단 진행 중'
    : isCompleted
      ? '이미지 진단 완료'
      : '이미지 진단 오버레이';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      <button className={styles.closeBtn} onClick={onClose} aria-label="오버레이 닫기">
        <X size={24} />
      </button>

      <div className={styles.content}>
        {/* 레이더 시각화 */}
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

              {/* 스윕 암 */}
              <div className={styles.radarSweep} />

              {/* 블립 점 */}
              <div className={styles.radarDot} />
              <div className={styles.radarDot} />
              <div className={styles.radarDot} />
              <div className={styles.radarDot} />

              {/* 중앙 점 */}
              <div className={styles.radarCenter} />

              {/* 핑 링 */}
              <div className={styles.pingRing} />
              <div className={styles.pingRing} />
              <div className={styles.pingRing} />
            </div>
          </div>

          {/* 플랫폼 글로우 */}
          <div className={styles.platform} />
        </div>

        {/* 상태 텍스트 */}
        <div className={styles.statusArea}>
          <div className={styles.statusLabel} aria-live="polite">{statusLabel}</div>
          <div className={styles.statusMessage} key={statusMessage}>
            {statusMessage}
          </div>
        </div>

        {/* 진행 중 shimmer 바 (정확한 진행률 데이터가 없으므로 indeterminate) */}
        {isRunning && (
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-label="이미지 진단 진행 중"
          />
        )}

        {/* 완료 후 버튼 */}
        {isCompleted && (
          <div className={styles.actionButtons}>
            {onScrollToResult && (
              <button
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={() => { onScrollToResult(); onClose(); }}
              >
                보고서 보기
              </button>
            )}
            {onExport && (
              <button
                className={styles.actionBtn}
                onClick={() => { onExport(); onClose(); }}
              >
                엑셀 다운로드
              </button>
            )}
            {onSaveToNotion && (
              <button
                className={styles.actionBtn}
                onClick={() => { onSaveToNotion(); onClose(); }}
              >
                Notion 저장
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
