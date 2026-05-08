'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import pageStyles from '../../page.module.css';
import styles from './page.module.css';

// KWCAG 2.2 33개 검사항목 정의
const KWCAG_ITEMS = [
  // 1. 인식의 용이성 (9개)
  { id: '1.1.1', name: '적절한 대체 텍스트 제공', principle: '인식의 용이성', automationLevel: 'high' },
  { id: '1.2.1', name: '자막 제공', principle: '인식의 용이성', automationLevel: 'medium' },
  { id: '1.2.2', name: '수어 제공', principle: '인식의 용이성', automationLevel: 'manual' },
  { id: '1.3.1', name: '콘텐츠의 선형화', principle: '인식의 용이성', automationLevel: 'medium' },
  { id: '1.3.2', name: '표의 구성', principle: '인식의 용이성', automationLevel: 'high' },
  { id: '1.4.1', name: '명도 대비', principle: '인식의 용이성', automationLevel: 'high' },
  { id: '1.4.2', name: '색에 무관한 콘텐츠 인식', principle: '인식의 용이성', automationLevel: 'manual' },
  { id: '1.4.3', name: '배경음 사용 금지', principle: '인식의 용이성', automationLevel: 'medium' },
  { id: '1.4.4', name: '콘텐츠 간의 구분', principle: '인식의 용이성', automationLevel: 'manual' },
  // 2. 운용의 용이성 (15개)
  { id: '2.1.1', name: '키보드 사용 보장', principle: '운용의 용이성', automationLevel: 'medium' },
  { id: '2.1.2', name: '초점 이동과 표시', principle: '운용의 용이성', automationLevel: 'medium' },
  { id: '2.1.3', name: '조작 가능', principle: '운용의 용이성', automationLevel: 'high' },
  { id: '2.1.4', name: '문자 단축키', principle: '운용의 용이성', automationLevel: 'manual' },
  { id: '2.2.1', name: '응답 시간 조절', principle: '운용의 용이성', automationLevel: 'medium' },
  { id: '2.2.2', name: '정지 기능 제공', principle: '운용의 용이성', automationLevel: 'high' },
  { id: '2.3.1', name: '깜빡임과 번쩍임 사용 제한', principle: '운용의 용이성', automationLevel: 'manual' },
  { id: '2.4.1', name: '반복 영역 건너뛰기', principle: '운용의 용이성', automationLevel: 'high' },
  { id: '2.4.2', name: '페이지 제목 제공', principle: '운용의 용이성', automationLevel: 'high' },
  { id: '2.4.3', name: '적절한 링크 텍스트', principle: '운용의 용이성', automationLevel: 'high' },
  { id: '2.4.4', name: '고정된 참조 위치 정보', principle: '운용의 용이성', automationLevel: 'manual' },
  { id: '2.5.1', name: '단일 포인터 입력 지원', principle: '운용의 용이성', automationLevel: 'manual' },
  { id: '2.5.2', name: '포인터 입력 취소', principle: '운용의 용이성', automationLevel: 'manual' },
  { id: '2.5.3', name: '레이블과 네임', principle: '운용의 용이성', automationLevel: 'high' },
  { id: '2.5.4', name: '동작기반 작동', principle: '운용의 용이성', automationLevel: 'manual' },
  // 3. 이해의 용이성 (7개)
  { id: '3.1.1', name: '기본 언어 표시', principle: '이해의 용이성', automationLevel: 'high' },
  { id: '3.2.1', name: '사용자 요구에 따른 실행', principle: '이해의 용이성', automationLevel: 'medium' },
  { id: '3.3.1', name: '콘텐츠의 선형 구조', principle: '이해의 용이성', automationLevel: 'medium' },
  { id: '3.4.1', name: '오류 정정', principle: '이해의 용이성', automationLevel: 'medium' },
  { id: '3.4.2', name: '레이블 제공', principle: '이해의 용이성', automationLevel: 'high' },
  { id: '3.4.3', name: '접근 가능한 인증', principle: '이해의 용이성', automationLevel: 'manual' },
  { id: '3.4.4', name: '반복 입력 정보', principle: '이해의 용이성', automationLevel: 'manual' },
  // 4. 견고성 (2개)
  { id: '4.1.1', name: '마크업 오류 방지', principle: '견고성', automationLevel: 'high' },
  { id: '4.1.2', name: '웹 애플리케이션 접근성 준수', principle: '견고성', automationLevel: 'high' },
];

interface ChecklistResult {
  id: string;
  status: 'pass' | 'fail' | 'manual' | 'na';
  violationCount: number;
  pages: string[];
  violations: ViolationSummary[];
}

interface ViolationSummary {
  pageUrl: string;
  description: string;
  count: number;
}

interface AuditResultLocal {
  violations: Array<{
    kwcagId: string;
    pageUrl: string;
    description: string;
  }>;
}

export default function ChecklistPage() {
  const [results, setResults] = useState<ChecklistResult[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const savedResult = localStorage.getItem('auditResult');
    if (savedResult) {
      const auditResult: AuditResultLocal = JSON.parse(savedResult);

      // 33개 항목에 대한 결과 생성
      const checklistResults: ChecklistResult[] = KWCAG_ITEMS.map(item => {
        const itemViolations = auditResult.violations.filter(v => v.kwcagId === item.id);
        const pages = [...new Set(itemViolations.map(v => v.pageUrl))];

        // 페이지별 위반 요약
        const violationsByPage = new Map<string, { count: number; descriptions: Set<string> }>();
        for (const v of itemViolations) {
          const entry = violationsByPage.get(v.pageUrl) || { count: 0, descriptions: new Set<string>() };
          entry.count += 1;
          if (v.description) entry.descriptions.add(v.description);
          violationsByPage.set(v.pageUrl, entry);
        }

        const violations: ViolationSummary[] = Array.from(violationsByPage.entries()).map(
          ([pageUrl, data]) => ({
            pageUrl,
            description: Array.from(data.descriptions).slice(0, 2).join(', ') || '위반 발견',
            count: data.count,
          })
        );

        let status: 'pass' | 'fail' | 'manual' | 'na';
        if (item.automationLevel === 'manual') {
          status = 'manual';
        } else if (itemViolations.length > 0) {
          status = 'fail';
        } else {
          status = 'pass';
        }

        return {
          id: item.id,
          status,
          violationCount: itemViolations.length,
          pages,
          violations,
        };
      });

      setResults(checklistResults);
    }
  }, []);

  // 필터링
  const filteredItems = KWCAG_ITEMS.filter(item => {
    if (filter === 'all') return true;
    const result = results.find(r => r.id === item.id);
    return result?.status === filter;
  });

  // 통계 계산
  const stats = {
    pass: results.filter(r => r.status === 'pass').length,
    fail: results.filter(r => r.status === 'fail').length,
    manual: results.filter(r => r.status === 'manual').length,
  };

  // 준수율 계산 (manual 제외)
  const automatedTotal = stats.pass + stats.fail;
  const complianceRate = automatedTotal > 0 ? Math.round((stats.pass / automatedTotal) * 100) : 0;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pass':
        return <span className={pageStyles['status-pass']}>통과</span>;
      case 'fail':
        return <span className={pageStyles['status-fail']}>위반</span>;
      case 'manual':
        return <span className={pageStyles['status-manual']}>수동확인</span>;
      default:
        return <span className={pageStyles['status-na']}>N/A</span>;
    }
  };

  const getAutomationBadge = (level: string) => {
    switch (level) {
      case 'high':
        return <span className={pageStyles['auto-high']}>자동</span>;
      case 'medium':
        return <span className={pageStyles['auto-medium']}>반자동</span>;
      case 'manual':
        return <span className={pageStyles['auto-manual']}>수동</span>;
      default:
        return null;
    }
  };

  // CSV 내보내기
  const exportCSV = useCallback(() => {
    const header = ['항목ID', '검사항목명', '원칙', '검사방식', '결과', '위반수', '위반페이지'];
    const rows = KWCAG_ITEMS.map(item => {
      const r = results.find(res => res.id === item.id);
      const statusLabel = r?.status === 'pass' ? '통과' : r?.status === 'fail' ? '위반' : r?.status === 'manual' ? '수동확인' : 'N/A';
      const automationLabel = item.automationLevel === 'high' ? '자동' : item.automationLevel === 'medium' ? '반자동' : '수동';
      const pages = r?.pages.join(' | ') || '';
      return [item.id, item.name, item.principle, automationLabel, statusLabel, String(r?.violationCount || 0), pages];
    });

    const bom = '\uFEFF';
    const csvContent = bom + [header, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KWCAG_체크리스트_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [results]);

  // 원칙별 그룹화
  const principles = ['인식의 용이성', '운용의 용이성', '이해의 용이성', '견고성'];

  const complianceBarClass = complianceRate >= 80
    ? styles['compliance-bar-fill-high']
    : complianceRate >= 50
      ? styles['compliance-bar-fill-mid']
      : styles['compliance-bar-fill-low'];

  const compliancePctClass = complianceRate >= 80
    ? styles['compliance-pct-high']
    : complianceRate >= 50
      ? styles['compliance-pct-mid']
      : styles['compliance-pct-low'];

  if (results.length === 0) {
    return (
      <div className="container">
        <div className={`card ${styles['empty-card']}`}>
          <h2>진단 결과가 없습니다</h2>
          <p className={styles['empty-desc']}>
            먼저 메인 페이지에서 접근성 진단을 수행해주세요.
          </p>
          <a href="/" className={`btn btn-primary ${styles['empty-link']}`}>
            메인으로 돌아가기
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className={pageStyles['report-header']}>
        <div>
          <h1 className={pageStyles['report-title']}>KWCAG 2.2 체크리스트</h1>
          <p className={styles['header-desc']}>
            33개 검사항목 전체 점검 결과
          </p>
        </div>
        <div className={styles['header-actions']}>
          <button type="button" className="btn btn-primary" onClick={exportCSV}>
            CSV 내보내기
          </button>
          <Link href="/report" className="btn btn-secondary">
            리포트로
          </Link>
          <Link href="/" className="btn btn-secondary">
            메인으로
          </Link>
        </div>
      </header>

      {/* 준수율 게이지 */}
      <div className={`card ${styles['compliance-card']}`}>
        <h2 className={styles['compliance-title']}>
          전체 준수율 (자동 검사 항목 기준)
        </h2>
        <div className={styles['compliance-body']}>
          <div className={styles['compliance-bar-wrap']}>
            <div
              className={styles['compliance-bar-track']}
              role="progressbar"
              aria-valuenow={complianceRate}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`준수율 ${complianceRate}%`}
            >
              <div
                className={`${styles['compliance-bar-fill']} ${complianceBarClass}`}
                style={{ width: `${complianceRate}%` }}
              />
            </div>
            <div className={styles['compliance-sub']}>
              <span>통과 {stats.pass}개 / 위반 {stats.fail}개</span>
              <span>수동확인 제외 ({stats.manual}개)</span>
            </div>
          </div>
          <div className={`${styles['compliance-pct']} ${compliancePctClass}`}>
            {complianceRate}%
          </div>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="stats-grid">
        <button
          type="button"
          className={pageStyles['stat-card-clickable']}
          onClick={() => setFilter('all')}
          aria-label="전체 검사항목 33개 보기"
          aria-pressed={filter === 'all'}
        >
          <div className="stat-value">33</div>
          <div className="stat-label">전체 검사항목</div>
        </button>
        <button
          type="button"
          className={pageStyles['stat-card-clickable']}
          onClick={() => setFilter('pass')}
          aria-label={`통과 ${stats.pass}건 보기`}
          aria-pressed={filter === 'pass'}
        >
          <div className={`stat-value ${styles['stat-value-green']}`}>{stats.pass}</div>
          <div className="stat-label">통과</div>
        </button>
        <button
          type="button"
          className={pageStyles['stat-card-clickable']}
          onClick={() => setFilter('fail')}
          aria-label={`위반 ${stats.fail}건 보기`}
          aria-pressed={filter === 'fail'}
        >
          <div className={`stat-value ${styles['stat-value-red']}`}>{stats.fail}</div>
          <div className="stat-label">위반</div>
        </button>
        <button
          type="button"
          className={pageStyles['stat-card-clickable']}
          onClick={() => setFilter('manual')}
          aria-label={`수동확인 필요 ${stats.manual}건 보기`}
          aria-pressed={filter === 'manual'}
        >
          <div className={`stat-value ${styles['stat-value-amber']}`}>{stats.manual}</div>
          <div className="stat-label">수동확인 필요</div>
        </button>
      </div>

      {/* 필터 */}
      <div className="card">
        <div className={pageStyles['filter-bar']}>
          <label htmlFor="checklist-filter" className={styles['filter-label']}>
            필터
          </label>
          <select id="checklist-filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">전체 (33개)</option>
            <option value="pass">통과 ({stats.pass}개)</option>
            <option value="fail">위반 ({stats.fail}개)</option>
            <option value="manual">수동확인 필요 ({stats.manual}개)</option>
          </select>
        </div>

        {/* 원칙별 체크리스트 */}
        {principles.map(principle => {
          const principleItems = filteredItems.filter(item => item.principle === principle);
          if (principleItems.length === 0) return null;

          return (
            <div key={principle} className={pageStyles['checklist-section']}>
              <h3 className={pageStyles['principle-title']}>{principle}</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th className={styles['col-id']}>항목</th>
                      <th>검사항목명</th>
                      <th className={styles['col-method']}>검사방식</th>
                      <th className={styles['col-result']}>결과</th>
                      <th className={styles['col-count']}>위반 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {principleItems.map(item => {
                      const result = results.find(r => r.id === item.id);
                      const hasViolations = (result?.violationCount || 0) > 0;

                      return (
                        <tr key={item.id} className={result?.status === 'fail' ? pageStyles['fail-row'] : ''}>
                          <td colSpan={5} className={styles['cell-full']}>
                            {hasViolations ? (
                              <details>
                                <summary className={styles['row-grid-summary']}>
                                  <span><strong>{item.id}</strong></span>
                                  <span>{item.name}</span>
                                  <span>{getAutomationBadge(item.automationLevel)}</span>
                                  <span>{getStatusBadge(result?.status || 'na')}</span>
                                  <span className={styles['count-center']}>{result?.violationCount || 0}</span>
                                </summary>
                                <div className={styles['violation-panel']}>
                                  <p className={styles['violation-panel-title']}>
                                    위반 페이지 ({result?.pages.length || 0}개)
                                  </p>
                                  <ul className={styles['violation-list']}>
                                    {result?.violations.map((v, i) => (
                                      <li key={i} className={styles['violation-item']}>
                                        <span className={styles['violation-item-url']}>
                                          {v.pageUrl.length > 60 ? v.pageUrl.slice(0, 60) + '...' : v.pageUrl}
                                        </span>
                                        <span className={styles['violation-item-count']}> - {v.count}건</span>
                                        {v.description && (
                                          <span className={styles['violation-item-desc']}>
                                            {v.description}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </details>
                            ) : (
                              <div className={styles['row-grid']}>
                                <span><strong>{item.id}</strong></span>
                                <span>{item.name}</span>
                                <span>{getAutomationBadge(item.automationLevel)}</span>
                                <span>{getStatusBadge(result?.status || 'na')}</span>
                                <span className={styles['count-center']}>{result?.violationCount || 0}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
