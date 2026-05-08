'use client';

import { AltTextHistoryList } from '@/features/alttext/components/AltTextHistoryList';
import { History } from 'lucide-react';
import styles from './page.module.css';

export default function AltTextHistoryPage() {
  return (
    <div className={styles.page}>
      {/* 페이지 헤더 */}
      <div className={styles['page-header']}>
        <div className={styles['icon-wrap']}>
          <History size={20} color="#6b7280" aria-hidden="true" />
        </div>
        <div>
          <h1 className={styles['page-title']}>
            이미지 진단 이력
          </h1>
          <p className={styles['page-desc']}>
            Notion에 저장된 과거 이미지 진단 결과를 조회합니다.
          </p>
        </div>
      </div>

      <AltTextHistoryList />
    </div>
  );
}
