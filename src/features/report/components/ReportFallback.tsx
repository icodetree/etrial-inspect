'use client';

import { useEffect, useState } from 'react';
import { ReportViewer } from './ReportViewer';
import { AuditResult } from '@/types';
import styles from './ReportFallback.module.css';

interface ReportFallbackProps {
  notionPageId: string;
}

/**
 * Notion에서 리포트 JSON 로드 실패 시 localStorage 폴백.
 * 대용량 진단 결과는 Notion에 축소판만 저장되므로,
 * 같은 브라우저에서 진단한 경우 localStorage에 전체 데이터가 있을 수 있다.
 */
export const ReportFallback = ({ notionPageId }: ReportFallbackProps) => {
  const [result, setResult] = useState<AuditResult | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('auditResult');
      if (stored) {
        const parsed = JSON.parse(stored) as AuditResult;
        if (parsed && parsed.violations) {
          setResult(parsed);
        }
      }
    } catch {
      // localStorage 파싱 실패
    }
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className={styles.loading}>
        리포트 데이터를 불러오는 중...
      </div>
    );
  }

  if (result) {
    return (
      <>
        <div role="alert" className={styles['warning-banner']}>
          Notion에 저장된 데이터가 용량 초과로 일부 손실되어, 로컬 저장 데이터를 표시합니다.
        </div>
        <ReportViewer initialResult={result} />
      </>
    );
  }

  return (
    <div className={styles['error-panel']}>
      <h2 className={styles['error-title']}>리포트를 불러올 수 없습니다</h2>
      <p className={styles['error-body']}>
        Notion에 저장된 진단 데이터가 용량 초과로 손상되었고,<br />
        이 브라우저에 로컬 데이터도 없습니다.<br /><br />
        진단을 실행한 브라우저에서 다시 접속하거나,<br />
        <a href="/report" className={styles['error-link']}>최근 리포트</a>를 확인해주세요.
      </p>
    </div>
  );
};
