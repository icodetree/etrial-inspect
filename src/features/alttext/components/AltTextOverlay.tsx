'use client';

import { useEffect, useMemo, useState } from 'react';
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
  crawling: '크롤링 진행 중',
  scanning: 'OCR 분석 중',
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

  const isProcessing = progress.status === 'crawling' || progress.status === 'scanning';
  const isCompleted = progress.status === 'completed';

  // 진행률 계산
  const progressRatio = isProcessing && progress.total > 0
    ? Math.min(progress.current / progress.total, 1)
    : 0;
  const progressPct = Math.round(progressRatio * 100);

  // 경과 시간 (1초마다 갱신)
  const [elapsedSec, setElapsedSec] = useState(0);
  useEffect(() => {
    if (!isProcessing || !progress.startTime) return;
    const id = setInterval(() => {
      setElapsedSec(Math.round((Date.now() - progress.startTime!) / 1000));
    }, 1000);
    return () => { clearInterval(id); setElapsedSec(0); };
  }, [isProcessing, progress.startTime]);

  const elapsedText = useMemo(() => {
    if (elapsedSec <= 0) return '';
    if (elapsedSec < 60) return `${elapsedSec}초 경과`;
    const min = Math.floor(elapsedSec / 60);
    const sec = elapsedSec % 60;
    return `${min}분 ${sec}초 경과`;
  }, [elapsedSec]);

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

  // SVG 원형 게이지 파라미터
  const gaugeRadius = 118;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - progressRatio);

  const ariaLabel = isProcessing
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
            {/* SVG 원형 프로그레스 게이지 */}
            {isProcessing && progress.total > 0 && (
              <svg className={styles.progressGauge} viewBox="0 0 260 260">
                <circle
                  cx="130" cy="130" r={gaugeRadius}
                  fill="none"
                  stroke="rgba(99, 102, 241, 0.15)"
                  strokeWidth="4"
                />
                <circle
                  cx="130" cy="130" r={gaugeRadius}
                  fill="none"
                  stroke="url(#altGaugeGradient)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={gaugeCircumference}
                  strokeDashoffset={gaugeOffset}
                  transform="rotate(-90 130 130)"
                  style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
                />
                <defs>
                  <linearGradient id="altGaugeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#06b6d4" />
                  </linearGradient>
                </defs>
              </svg>
            )}
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

          {/* 진행률 정보 */}
          {isProcessing && progress.total > 0 && (
            <div className={styles.progressInfo}>
              <div className={styles.progressCount}>
                {progress.current} / {progress.total} 페이지
                <span className={styles.progressPct}>{progressPct}%</span>
              </div>
              {elapsedText && (
                <div className={styles.progressEta}>{elapsedText}</div>
              )}
            </div>
          )}
          {isProcessing && progress.total === 0 && elapsedText && (
            <div className={styles.progressInfo}>
              <div className={styles.progressEta}>{elapsedText}</div>
            </div>
          )}
        </div>

        {/* 프로그레스 바 */}
        {isProcessing && (
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-valuenow={progress.current}
            aria-valuemax={progress.total || undefined}
            aria-label="이미지 진단 진행 중"
          >
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, #6366f1, #06b6d4, #6366f1)',
                borderRadius: 'inherit',
                transform: progress.total > 0
                  ? `scaleX(${progressRatio})`
                  : undefined,
                transformOrigin: 'left',
                transition: 'transform 0.5s ease-out',
                animation: progress.total === 0
                  ? 'shimmer 2s linear infinite'
                  : undefined,
              }}
            />
          </div>
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
