'use client';

import styles from '@/app/page.module.css';

interface ReportPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** 윈도우 내 표시할 페이지 번호 개수 (기본 5) */
  windowSize?: number;
}

/**
 * 진단 결과 위반 목록 페이지네이션.
 * `.agent/rules/components/pagination.md` 패턴을 React 단일 페이지 환경에 맞춰 적용:
 * - `<nav aria-label="페이지 탐색">` 시맨틱 컨테이너
 * - 현재 페이지는 `aria-current="page"`
 * - 비활성 prev/next 는 `aria-disabled="true"` + native `disabled`
 * - 아이콘 텍스트는 `.hide-txt` 로 시각적으로만 숨김 (스크린 리더에는 노출)
 *
 * 시각/동작 회귀 0을 위해 기존 `.pagination` 스타일과 완전히 동일하게 유지.
 */
export const ReportPagination = ({
  currentPage,
  totalPages,
  onPageChange,
  windowSize = 5,
}: ReportPaginationProps) => {
  if (totalPages <= 1) return null;

  const visibleCount = Math.min(windowSize, totalPages);
  const halfWindow = Math.floor(windowSize / 2);

  const pageNumbers = Array.from({ length: visibleCount }, (_, i) => {
    if (totalPages <= windowSize) return i + 1;
    if (currentPage <= halfWindow + 1) return i + 1;
    if (currentPage >= totalPages - halfWindow) return totalPages - windowSize + 1 + i;
    return currentPage - halfWindow + i;
  });

  const isFirst = currentPage === 1;
  const isLast = currentPage === totalPages;

  return (
    <nav className={styles.pagination} aria-label="페이지 탐색">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={isFirst}
        aria-disabled={isFirst}
        aria-label="이전 페이지로 이동"
      >
        ← 이전
      </button>
      {pageNumbers.map((pageNum) => {
        const isCurrent = currentPage === pageNum;
        return (
          <button
            key={pageNum}
            type="button"
            className={isCurrent ? styles.on : ''}
            onClick={() => onPageChange(pageNum)}
            aria-current={isCurrent ? 'page' : undefined}
            aria-label={`${pageNum} 페이지${isCurrent ? ' (현재 페이지)' : ''}`}
          >
            {pageNum}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={isLast}
        aria-disabled={isLast}
        aria-label="다음 페이지로 이동"
      >
        다음 →
      </button>
    </nav>
  );
};
