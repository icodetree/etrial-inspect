'use client';

import styles from '@/app/page.module.css';
import { Violation } from '@/types';

const IMPACT_LABELS: Record<string, string> = {
  critical: '심각',
  serious: '높음',
  moderate: '보통',
  minor: '낮음',
};

interface ViolationItemProps {
  violation: Violation;
  onSelect: () => void;
}

/**
 * 단일 위반 항목 카드.
 * - 제목(KWCAG ID + name) / 페이지 URL 버튼 / 공통 요소·발생 횟수 배지
 * - 영향도 배지 / 스크린샷 버튼
 * - 설명 / 영향 코드 / 해결 방안
 */
export const ViolationItem = ({ violation, onSelect }: ViolationItemProps) => {
  return (
    <div className={styles['violation-card']}>
      <div className={styles['violation-header']}>
        <div>
          <h3 className={styles['violation-title']}>
            {violation.kwcagId} {violation.kwcagName}
          </h3>
          <p className={styles['violation-url']}>
            <button type="button" onClick={onSelect} className={styles['violation-link']}>
              {violation.pageUrl}
            </button>
            {violation.isCommon && (
              <span className={styles['badge-common']}>🧩 공통 요소 (Common UI)</span>
            )}
            {violation.occurrenceCount && violation.occurrenceCount > 1 && (
              <span className={styles['badge-count']}>
                ⚡ {violation.occurrenceCount}개 페이지에서 발견됨
              </span>
            )}
          </p>
        </div>
        <div className={styles['violation-meta']}>
          {violation.screenshotPath && (
            <button
              type="button"
              onClick={onSelect}
              className={styles['screenshot-btn']}
              title="스크린샷 보기"
            >
              📷 스크린샷
            </button>
          )}
          <span className={`badge badge-${violation.impact}`}>
            {IMPACT_LABELS[violation.impact] || violation.impact}
          </span>
        </div>
      </div>

      <p className={styles['violation-description']}>{violation.description}</p>

      <div className={styles['code-block']}>{violation.affectedCode}</div>

      <div className={styles['help-text']}>
        💡 <strong>해결방안:</strong> {violation.help}
        {violation.helpUrl && (
          <a
            href={violation.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles['help-link']}
          >
            자세히 보기 →
          </a>
        )}
      </div>
    </div>
  );
};
