'use client';

import styles from '@/app/page.module.css';
import { ReportFilterState } from '../hooks/useReportFilters';

interface ReportFiltersProps {
  filter: ReportFilterState;
  onFilterChange: (next: ReportFilterState) => void;
  itemsPerPage: number;
  onItemsPerPageChange: (next: number) => void;
  filteredCount: number;
  uniqueKwcagItems: string[];
}

/**
 * 위반 목록 상단 필터 바.
 * - 원칙 / 영향도 / KWCAG 항목 / 페이지당 개수 4종 select
 * - 우측에 현재 표시 건수 텍스트
 *
 * 상태는 부모(useReportFilters)가 보유하고, 본 컴포넌트는 props 로만 동작.
 */
export const ReportFilters = ({
  filter,
  onFilterChange,
  itemsPerPage,
  onItemsPerPageChange,
  filteredCount,
  uniqueKwcagItems,
}: ReportFiltersProps) => {
  return (
    <div className={styles['filter-bar']}>
      <select
        aria-label="원칙별 필터"
        value={filter.principle}
        onChange={(e) => onFilterChange({ ...filter, principle: e.target.value })}
      >
        <option value="">모든 원칙</option>
        <option value="인식의 용이성">인식의 용이성</option>
        <option value="운용의 용이성">운용의 용이성</option>
        <option value="이해의 용이성">이해의 용이성</option>
        <option value="견고성">견고성</option>
      </select>

      <select
        aria-label="영향도 필터"
        value={filter.impact}
        onChange={(e) => onFilterChange({ ...filter, impact: e.target.value })}
      >
        <option value="">모든 영향도</option>
        <option value="critical">치명적 (Critical)</option>
        <option value="serious">중요 (Serious)</option>
        <option value="moderate">보통 (Moderate)</option>
        <option value="minor">낮음 (Minor)</option>
      </select>

      <select
        aria-label="KWCAG 항목 필터"
        value={filter.kwcagId}
        onChange={(e) => onFilterChange({ ...filter, kwcagId: e.target.value })}
      >
        <option value="">모든 KWCAG 항목</option>
        {uniqueKwcagItems.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <select
        aria-label="페이지당 표시 개수"
        value={itemsPerPage}
        onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
      >
        <option value={10}>10개씩 보기</option>
        <option value={50}>50개씩 보기</option>
        <option value={100}>100개씩 보기</option>
        <option value={filteredCount > 0 ? filteredCount : 10000}>전체 보기</option>
      </select>

      <span className={styles['filter-count']} aria-live="polite">
        {filteredCount}건 표시 중
      </span>
    </div>
  );
};
