'use client';

import styles from '@/app/page.module.css';

export type ReportView = 'accessibility' | 'seo' | 'ai';

interface ReportTabsProps {
  activeView: ReportView;
  onChange: (view: ReportView) => void;
}

interface TabDef {
  value: ReportView;
  label: string;
  /** 활성 시 추가되는 색상 클래스 (기존 스타일 유지를 위해 유지) */
  activeClass: string;
  controlsId: string;
}

const TABS: ReadonlyArray<TabDef> = [
  {
    value: 'accessibility',
    label: '접근성 분석',
    activeClass: 'active-accessibility',
    controlsId: 'report-tabpanel-accessibility',
  },
  {
    value: 'seo',
    label: 'SEO 분석',
    activeClass: 'active-seo',
    controlsId: 'report-tabpanel-seo',
  },
  {
    value: 'ai',
    label: 'GEO 분석',
    activeClass: 'active-ai',
    controlsId: 'report-tabpanel-ai',
  },
];

/**
 * 리포트 상단 탭 네비게이션 (접근성 / SEO / GEO).
 * `.agent/rules/components/tab.md` 의 ARIA 권장 사항 적용:
 * - `role="tablist"` + `aria-label`
 * - 각 버튼에 `role="tab"`, `aria-selected`, `aria-controls`
 * - `<button type="button">` 으로 키보드 활성화 보장
 *
 * 시각 스타일은 기존 `tab-nav`/`tab-btn`/`active-*` 클래스를 그대로 재사용.
 */
export const ReportTabs = ({ activeView, onChange }: ReportTabsProps) => {
  return (
    <div className={styles['tab-nav']} role="tablist" aria-label="진단 영역 선택">
      {TABS.map((tab) => {
        const isActive = activeView === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            id={`report-tab-${tab.value}`}
            aria-selected={isActive}
            aria-controls={tab.controlsId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={`${styles['tab-btn']} ${isActive ? styles[tab.activeClass] : ''}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

/** ReportTabs 가 controls 로 가리키는 panel id 들. tabpanel 측에서 사용. */
export const REPORT_TAB_PANEL_IDS: Record<ReportView, string> = {
  accessibility: 'report-tabpanel-accessibility',
  seo: 'report-tabpanel-seo',
  ai: 'report-tabpanel-ai',
};

/** ReportTabs 의 각 탭 버튼 id. tabpanel 의 aria-labelledby 에 사용. */
export const REPORT_TAB_IDS: Record<ReportView, string> = {
  accessibility: 'report-tab-accessibility',
  seo: 'report-tab-seo',
  ai: 'report-tab-ai',
};
