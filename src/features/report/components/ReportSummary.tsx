'use client';

import styles from '@/app/page.module.css';
import { AuditResult } from '@/types';

interface ReportSummaryProps {
  result: AuditResult;
}

/**
 * 진단 결과 상단 요약 영역.
 * - 진단 신뢰도 경고 배너
 * - SPA 메타 배지 (프레임워크 / 렌더 전략 / 라우트 출처 / 신뢰도)
 * - 4-카드 통계 그리드 (총 페이지 / 위반 / Critical / Serious)
 * - 원칙별 위반 현황 카드
 */
export const ReportSummary = ({ result }: ReportSummaryProps) => {
  return (
    <>
      {/* 경고 배너 (라우트 0개 / SPA 신뢰도 낮음 등) */}
      {result.warnings && result.warnings.length > 0 && (
        <div role="alert" aria-live="polite" className={styles['warning-banner']}>
          <strong className={styles['warning-banner-title']}>진단 신뢰도 경고</strong>
          <ul className={styles['warning-banner-list']}>
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* SPA 메타 배지 */}
      {result.summary.spa && (
        <div aria-label="SPA 진단 메타데이터" className={styles['spa-meta-row']}>
          <span className={styles['spa-badge-framework']}>
            프레임워크: {result.summary.spa.detectedFramework}
          </span>
          <span className={styles['spa-badge-strategy']}>
            렌더 전략: {result.summary.spa.renderStrategy}
          </span>
          {result.summary.spa.suspectedSpa &&
            result.summary.spa.detectedFramework === 'unknown' && (
              <span
                className={styles['spa-badge-suspected']}
                title="프레임워크는 감지되지 않았지만, DOM/라우트 패턴이 SPA 같은 신호를 보임"
              >
                SPA 의심
              </span>
            )}
          <span className={styles['spa-badge-routes']} title="라우트 출처별 페이지 수">
            라우트 — 크롤 {result.summary.spa.routesFromCrawl} · 사이트맵{' '}
            {result.summary.spa.routesFromSitemap}
          </span>
          {result.summary.reliability && (
            <span
              className={
                result.summary.reliability.pagesFailed > 0 ||
                result.summary.reliability.pagesPartial > 0
                  ? styles['spa-badge-reliability-fail']
                  : styles['spa-badge-reliability-ok']
              }
              title="페이지 진단 신뢰도"
            >
              신뢰도 — 성공{' '}
              {result.summary.reliability.pagesAudited -
                result.summary.reliability.pagesFailed -
                result.summary.reliability.pagesPartial}{' '}
              / 부분 {result.summary.reliability.pagesPartial} / 실패{' '}
              {result.summary.reliability.pagesFailed}
            </span>
          )}
        </div>
      )}

      {/* 요약 통계 */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{result.totalPages}</div>
          <div className="stat-label">총 페이지 수</div>
        </div>
        <div className={`stat-card ${styles['stat-card-danger']}`}>
          <div className={`stat-value ${styles['stat-value-danger']}`}>
            {result.totalViolations}
          </div>
          <div className="stat-label">총 위반 건수</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{result.summary.byImpact.critical || 0}</div>
          <div className="stat-label">치명적 (Critical)</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{result.summary.byImpact.serious || 0}</div>
          <div className="stat-label">중요 (Serious)</div>
        </div>
      </div>

      {/* 원칙별 통계 */}
      <div className={`card ${styles['principle-card']}`}>
        <h2 className={styles['card-title']}>원칙별 위반 현황</h2>
        <div className="stats-grid">
          {Object.entries(result.summary.byPrinciple).map(([principle, count]) => (
            <div className="stat-card" key={principle}>
              <div className="stat-value">{count}</div>
              <div className="stat-label">{principle}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
