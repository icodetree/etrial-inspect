'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '@/app/page.module.css';
import CostReportModal from '@/components/CostReportModal';
import { AuditResult, Violation } from '@/types';
import { getPlatformAuditService } from '@/services/platform/factory';
import SEODetailView from '@/features/seo/components/SEODetailView';
import AIDetailView from '@/features/seo/components/AIDetailView';
import { ViolationDetailModal } from '@/components/ViolationDetailModal';

interface ReportViewerProps {
  initialResult?: AuditResult | null;
}

export const ReportViewer = ({ initialResult }: ReportViewerProps) => {
  const [result, setResult] = useState<AuditResult | null>(initialResult || null);
  const [showCostModal, setShowCostModal] = useState(false);
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [filter, setFilter] = useState({
    principle: '',
    impact: '',
    kwcagId: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [activeView, setActiveView] = useState<'accessibility' | 'seo' | 'ai'>('accessibility');
  const [pdfExporting, setPdfExporting] = useState(false);
  const [savingNotion, setSavingNotion] = useState(false);

  useEffect(() => {
    // If no initial result provided (e.g. standard /report page), try loading from localStorage
    if (!initialResult) {
      try {
        const savedResult = localStorage.getItem('auditResult');
        if (savedResult) {
          const parsed = JSON.parse(savedResult);
          if (parsed && parsed.violations && parsed.summary) {
            setResult(parsed);
          }
        }
      } catch {
        // localStorage 데이터 파싱 실패 시 무시
      }
    }
  }, [initialResult]);

  if (!result || !result.violations || !result.summary) {
    return (
      <main className="container">
        <section className={`card ${styles['empty-card']}`}>
          <h2>진단 결과가 없습니다</h2>
          <p className={styles['empty-text']}>
            먼저 메인 페이지에서 접근성 진단을 수행해주세요.
          </p>
          <Link href="/" className={`btn btn-primary ${styles['back-link']}`}>
            ← 메인으로 돌아가기
          </Link>
        </section>
      </main>
    );
  }

  // 필터 적용
  let filteredViolations = result.violations;
  if (filter.principle) {
    filteredViolations = filteredViolations.filter(v => v.principle === filter.principle);
  }
  if (filter.impact) {
    filteredViolations = filteredViolations.filter(v => v.impact === filter.impact);
  }
  if (filter.kwcagId) {
    filteredViolations = filteredViolations.filter(v => v.kwcagId === filter.kwcagId);
  }

  // 페이지네이션
  const totalPages = Math.ceil(filteredViolations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedViolations = filteredViolations.slice(startIndex, startIndex + itemsPerPage);

  // 고유한 KWCAG 항목 추출
  const uniqueKwcagItems = [...new Set(result.violations.map(v => v.kwcagId))].sort();

  const impactLabels: Record<string, string> = {
    critical: '심각',
    serious: '높음',
    moderate: '보통',
    minor: '낮음',
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportJSON = () => {
    if (!result) return;
    const jsonString = JSON.stringify(result, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kwcag-audit-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const handleExportExcel = async () => {
    try {
      const service = getPlatformAuditService();
      await service.exportExcel(result);
    } catch (error) {
      alert(`엑셀 다운로드 실패: ${error}`);
    }
  };

  const handleSaveToNotion = async () => {
    if (!result || savingNotion) return;
    setSavingNotion(true);
    try {
      const response = await fetch('/api/history/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Notion 저장 실패');
      }
      const { reportUrl } = await response.json();
      alert(`Notion에 저장되었습니다!\n${reportUrl ?? ''}`);
    } catch (error) {
      alert(`저장 실패: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSavingNotion(false);
    }
  };

  const handleExportPDF = async () => {
    if (!result || pdfExporting) return;
    setPdfExporting(true);
    try {
      const response = await fetch('/api/report/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          options: {
            title: '웹 접근성 진단 보고서',
            includeScreenshots: true,
          },
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'PDF 생성 실패' }));
        throw new Error(err.error || 'PDF 생성 실패');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const domain = result.pages?.[0]?.url ? new URL(result.pages[0].url).hostname : 'report';
      a.download = `accessibility-report-${domain}-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      alert(`PDF 다운로드 실패: ${error}`);
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div className="container">
      <header className={`${styles['report-header']} ${styles['report-header-column']}`}>
        {/* Row 1: Title & Main Link */}
        <div className={styles['header-row']}>
          <div>
            <h1 className={styles['report-title']}>접근성 진단 리포트</h1>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
              진단 시간: {new Date(result.endTime).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a href="/" className="btn btn-secondary">
              ← 메인으로
            </a>
            <button className="btn btn-secondary" onClick={handlePrint}>
              인쇄
            </button>
          </div>
        </div>


        {/* Row 2: Action Buttons */}
        <div className={styles['action-row']}>
          <button className="btn btn-secondary" onClick={() => setShowCostModal(true)}>
            공수 산출
          </button>
          <button className="btn btn-secondary" onClick={handleExportExcel}>
            엑셀 다운로드
          </button>
          <button className="btn btn-secondary" onClick={handleExportJSON}>
            JSON 다운로드
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExportPDF}
            disabled={pdfExporting}
          >
            {pdfExporting ? 'PDF 생성 중...' : 'PDF 보고서'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSaveToNotion}
            disabled={savingNotion}
            style={{ background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' }}
          >
            {savingNotion ? 'Notion 저장 중...' : 'Notion 저장'}
          </button>
          <a href="/report/checklist" className="btn btn-secondary">
            33개 체크리스트
          </a>

        </div>
      </header>

      {showCostModal && result && (
        <CostReportModal
          violations={result.violations}
          onClose={() => setShowCostModal(false)}
        />
      )}

      {selectedViolation && (
        <ViolationDetailModal
          violation={selectedViolation}
          boundingBox={selectedViolation.boundingBox}
          screenshotPath={selectedViolation.screenshotPath}
          artifactName={result?.artifactName}
          screenshotUrl={result?.screenshotUrl}
          onClose={() => setSelectedViolation(null)}
        />
      )}



      {/* 상세 분석 탭 네비게이션 */}
      {result.seoResult && (
        <div style={{ marginBottom: '2rem' }}>
          <div className={styles['tab-nav']}>
            <button
              onClick={() => setActiveView('accessibility')}
              className={`${styles['tab-btn']} ${activeView === 'accessibility' ? styles['active-accessibility'] : ''}`}
            >
              접근성 분석
            </button>
            <button
              onClick={() => setActiveView('seo')}
              className={`${styles['tab-btn']} ${activeView === 'seo' ? styles['active-seo'] : ''}`}
            >
              SEO 분석
            </button>
            <button
              onClick={() => setActiveView('ai')}
              className={`${styles['tab-btn']} ${activeView === 'ai' ? styles['active-ai'] : ''}`}
            >
              GEO 분석
            </button>
          </div>

          {/* 조건부 렌더링: SEO/AI 상세 뷰 */}
          {activeView === 'seo' && <SEODetailView result={result.seoResult} />}
          {activeView === 'ai' && <AIDetailView result={result.seoResult} />}
        </div>
      )}

      {/* 접근성 콘텐츠 (접근성 탭 활성 시에만 표시) */}
      {activeView === 'accessibility' && (
        <>

          {/* 경고 배너 (라우트 0개 / SPA 신뢰도 낮음 등) */}
          {result.warnings && result.warnings.length > 0 && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                background: '#fff7ed',
                border: '1px solid #f97316',
                color: '#9a3412',
                padding: '0.75rem 1rem',
                borderRadius: 8,
                marginBottom: '1rem',
              }}
            >
              <strong style={{ display: 'block', marginBottom: 4 }}>진단 신뢰도 경고</strong>
              <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* SPA 메타 배지 (프레임워크 / 라우트 출처 / 신뢰도) */}
          {result.summary.spa && (
            <div
              aria-label="SPA 진단 메타데이터"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem',
                fontSize: '0.85rem',
              }}
            >
              <span
                style={{
                  background: '#eef2ff',
                  color: '#3730a3',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 999,
                }}
              >
                프레임워크: {result.summary.spa.detectedFramework}
              </span>
              <span
                style={{
                  background: '#ecfeff',
                  color: '#155e75',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 999,
                }}
              >
                렌더 전략: {result.summary.spa.renderStrategy}
              </span>
              {result.summary.spa.suspectedSpa && (
                <span
                  style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    padding: '0.25rem 0.6rem',
                    borderRadius: 999,
                  }}
                >
                  SPA 의심
                </span>
              )}
              <span
                style={{
                  background: '#f1f5f9',
                  color: '#334155',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 999,
                }}
                title="라우트 출처별 페이지 수"
              >
                라우트 — 크롤 {result.summary.spa.routesFromCrawl} · 사이트맵 {result.summary.spa.routesFromSitemap}
              </span>
              {result.summary.reliability && (
                <span
                  style={{
                    background:
                      result.summary.reliability.pagesFailed > 0 ||
                      result.summary.reliability.pagesPartial > 0
                        ? '#fef2f2'
                        : '#ecfdf5',
                    color:
                      result.summary.reliability.pagesFailed > 0 ||
                      result.summary.reliability.pagesPartial > 0
                        ? '#991b1b'
                        : '#065f46',
                    padding: '0.25rem 0.6rem',
                    borderRadius: 999,
                  }}
                  title="페이지 진단 신뢰도"
                >
                  신뢰도 — 성공 {result.summary.reliability.pagesAudited - result.summary.reliability.pagesFailed - result.summary.reliability.pagesPartial} / 부분 {result.summary.reliability.pagesPartial} / 실패 {result.summary.reliability.pagesFailed}
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
            <div className="stat-card" style={{ border: '2px solid #ef4444' }}>
              <div className="stat-value" style={{ color: '#ef4444' }}>{result.totalViolations}</div>
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
          <div className="card" style={{ marginBottom: '2rem' }}>
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

          {/* 필터 */}
          <div className="card">
            <h2 className={styles['card-title']}>위반 사항 목록</h2>

            <div className={styles['filter-bar']}>
              <select
                value={filter.principle}
                onChange={(e) => { setFilter({ ...filter, principle: e.target.value }); setCurrentPage(1); }}
              >
                <option value="">모든 원칙</option>
                <option value="인식의 용이성">인식의 용이성</option>
                <option value="운용의 용이성">운용의 용이성</option>
                <option value="이해의 용이성">이해의 용이성</option>
                <option value="견고성">견고성</option>
              </select>

              <select
                value={filter.impact}
                onChange={(e) => { setFilter({ ...filter, impact: e.target.value }); setCurrentPage(1); }}
              >
                <option value="">모든 영향도</option>
                <option value="critical">치명적 (Critical)</option>
                <option value="serious">중요 (Serious)</option>
                <option value="moderate">보통 (Moderate)</option>
                <option value="minor">낮음 (Minor)</option>
              </select>

              <select
                value={filter.kwcagId}
                onChange={(e) => { setFilter({ ...filter, kwcagId: e.target.value }); setCurrentPage(1); }}
              >
                <option value="">모든 KWCAG 항목</option>
                {uniqueKwcagItems.map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>

              <select
                value={itemsPerPage}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setItemsPerPage(val);
                  setCurrentPage(1);
                }}
              >
                <option value={10}>10개씩 보기</option>
                <option value={50}>50개씩 보기</option>
                <option value={100}>100개씩 보기</option>
                <option value={filteredViolations.length > 0 ? filteredViolations.length : 10000}>전체 보기</option>
              </select>

              <span style={{ color: '#94a3b8', alignSelf: 'center' }}>
                {filteredViolations.length}건 표시 중
              </span>
            </div>

            {/* 위반 목록 */}
            {paginatedViolations.map((violation, index) => (
              <div className={styles['violation-card']} key={`${violation.pageUrl}-${violation.violationNumber}-${index}`}>
                <div className={styles['violation-header']}>
                  <div>
                    <h3 className={styles['violation-title']}>
                      {violation.kwcagId} {violation.kwcagName}
                    </h3>
                    <p className={styles['violation-url']}>
                      <button
                        onClick={() => setSelectedViolation(violation)}
                        className={styles['violation-link']}
                      >
                        {violation.pageUrl}
                      </button>
                      {violation.isCommon && (
                        <span className={styles['badge-common']}>
                          🧩 공통 요소 (Common UI)
                        </span>
                      )}
                      {violation.occurrenceCount && violation.occurrenceCount > 1 && (
                        <span className={styles['badge-count']}>
                          ⚡ {violation.occurrenceCount}개 페이지에서 발견됨
                        </span>
                      )}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                    {violation.screenshotPath && (
                      <button
                        onClick={() => setSelectedViolation(violation)}
                        className={styles['screenshot-btn']}
                        title="스크린샷 보기"
                      >
                        📷 스크린샷
                      </button>
                    )}
                    <span className={`badge badge-${violation.impact}`}>
                      {impactLabels[violation.impact] || violation.impact}
                    </span>
                  </div>
                </div>

                <p className={styles['violation-description']}>{violation.description}</p>

                <div className={styles['code-block']}>
                  {violation.affectedCode}
                </div>

                <div className={styles['help-text']}>
                  💡 <strong>해결방안:</strong> {violation.help}
                  {violation.helpUrl && (
                    <a href={violation.helpUrl} target="_blank" rel="noopener noreferrer" className={styles['help-link']}>
                      자세히 보기 →
                    </a>
                  )}
                </div>
              </div>
            ))}

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  ← 이전
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      className={currentPage === pageNum ? styles.on : ''}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  );
                })}
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
