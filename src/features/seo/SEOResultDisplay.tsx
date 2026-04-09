'use client';

import { SEOAuditResult } from '@/types/seo';
import styles from './SEOResultDisplay.module.css';
import SEODetailView from './components/SEODetailView';
import AIDetailView from './components/AIDetailView';

interface SEOResultDisplayProps {
  result: SEOAuditResult;
}

/**
 * SEO/AI 진단 결과 표시 컴포넌트 (SOYOYU 구조 기반)
 */
export default function SEOResultDisplay({ result }: SEOResultDisplayProps) {
  return (
    <div className={styles.container}>
      <SEODetailView result={result} />
      <AIDetailView result={result} />

      {/* 최종 점수 */}
      <section className={styles['final-score-section']}>
        <h2 className={styles['final-score-title']}>
          최종 통합 점수
        </h2>
        <div className={styles['final-score-value']}>
          {result.score}/100
        </div>
        <div className={styles['final-score-desc']}>
          SEO + AI 친화도 종합 (11개 카테고리 평균)
        </div>
      </section>
    </div>
  );
}
