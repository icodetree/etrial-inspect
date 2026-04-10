'use client';

import { useEffect } from 'react';
import styles from './error.module.css';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[ReportPage Error]', error);
  }, [error]);

  return (
    <div className={styles.container} role="alert">
      <div className={styles.icon} aria-hidden="true">
        <svg
          className={styles.iconSvg}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h2 className={styles.title}>리포트를 불러올 수 없습니다</h2>
      <p className={styles.message}>
        {error.message || 'Notion 연결 상태를 확인하고 다시 시도해 주세요.'}
      </p>
      <button
        type="button"
        className={styles.retryButton}
        onClick={reset}
      >
        다시 시도
      </button>
    </div>
  );
}
