'use client';

import { useMemo, useState } from 'react';
import { Violation } from '@/types';

export interface ReportFilterState {
  principle: string;
  impact: string;
  kwcagId: string;
}

const INITIAL_FILTER: ReportFilterState = {
  principle: '',
  impact: '',
  kwcagId: '',
};

/**
 * 진단 위반 목록의 필터 + 페이지네이션 상태를 관리한다.
 *
 * 책임:
 * - principle / impact / kwcagId 3종 필터 상태와 setter
 * - itemsPerPage / currentPage 페이지네이션 상태
 * - 필터 변경 시 1페이지로 초기화
 * - filteredViolations / paginatedViolations / totalPages / uniqueKwcagItems 파생 값 계산
 *
 * UI 컴포넌트는 이 훅의 반환만 가지고 렌더링한다.
 */
export const useReportFilters = (violations: Violation[]) => {
  const [filter, setFilterState] = useState<ReportFilterState>(INITIAL_FILTER);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPageState] = useState(10);

  const setFilter = (next: ReportFilterState) => {
    setFilterState(next);
    setCurrentPage(1);
  };

  const setItemsPerPage = (next: number) => {
    setItemsPerPageState(next);
    setCurrentPage(1);
  };

  const filteredViolations = useMemo(() => {
    let list = violations;
    if (filter.principle) list = list.filter((v) => v.principle === filter.principle);
    if (filter.impact) list = list.filter((v) => v.impact === filter.impact);
    if (filter.kwcagId) list = list.filter((v) => v.kwcagId === filter.kwcagId);
    return list;
  }, [violations, filter]);

  const totalPages = Math.max(1, Math.ceil(filteredViolations.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedViolations = filteredViolations.slice(startIndex, startIndex + itemsPerPage);

  const uniqueKwcagItems = useMemo(
    () => [...new Set(violations.map((v) => v.kwcagId))].sort(),
    [violations]
  );

  return {
    filter,
    setFilter,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    filteredViolations,
    paginatedViolations,
    totalPages,
    uniqueKwcagItems,
  };
};
