'use client';

import React, { useEffect, useState } from 'react';
import { HistoryItem } from '@/types';
import styles from './HistoryList.module.scss';

interface HistoryListProps {
  refreshTrigger?: number;
}

export function HistoryList({ refreshTrigger }: HistoryListProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/history/list', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (error) {
      console.error('Failed to fetch history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [refreshTrigger]);

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? (Notion에서 숨김 처리됩니다)')) return;

    // Optimistic Update
    setHistory(prev => prev.filter(item => item.id !== id));

    try {
      const res = await fetch('/api/history/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: id }),
      });

      if (!res.ok) {
        alert('삭제 실패했습니다.');
        fetchHistory(); // Revert
      }
    } catch (error) {
      console.error('Delete failed:', error);
      fetchHistory(); // Revert
    }
  };

  if (isLoading) return <div className={styles.loading}>히스토리 불러오는 중...</div>;

  const notionDbUrl = process.env.NEXT_PUBLIC_NOTION_URL || null;

  if (history.length === 0) {
    return (
      <div className={styles.historyWrap}>
        <div className={styles.historyHeader}>
          <h3 className={styles.historyTitle}>진단 이력</h3>
          {notionDbUrl && (
            <a href={notionDbUrl} target="_blank" rel="noopener noreferrer" className={styles.btnNotion}>
              Notion DB 보기 →
            </a>
          )}
        </div>
        <div className={styles.emptyState}>저장된 이력이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className={styles.historyWrap}>
      <div className={styles.historyHeader}>
        <h3 className={styles.historyTitle}>진단 이력</h3>
        {notionDbUrl && (
          <a href={notionDbUrl} target="_blank" rel="noopener noreferrer" className={styles.btnNotion}>
            Notion DB 보기 →
          </a>
        )}
      </div>
      <div className={styles.historyList}>
        {history.map(item => (
          <div key={item.id} className={styles.historyItem}>
            <div className={styles.itemInfo}>
              <span className={styles.date}>{new Date(item.date).toLocaleDateString()}</span>
              <span className={styles.url}>{item.url}</span>
              <span className={styles.score}>SEO {item.score}점</span>
              <span className={styles.violations}>위반 {item.violationCount}건</span>
            </div>
            <div className={styles.itemActions}>
              <a href={`/report/${item.id}`} className={styles.btnLink}>
                리포트 보기
              </a>
              <button
                onClick={() => handleDelete(item.id)}
                className={styles.btnDelete}
                aria-label="리포트 삭제"
              >
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
