'use client';

import { useEffect, useState } from 'react';
import type { AltTextHistoryItem } from '@/types/alt-text';
import styles from './AltTextHistoryList.module.css';

interface Props {
  refreshTrigger?: number;
}

/**
 * 이미지 진단 이력 리스트 — /api/alttext/list 호출
 */
export function AltTextHistoryList({ refreshTrigger }: Props) {
  const [items, setItems] = useState<AltTextHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchList = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/alttext/list', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (e) {
      console.error('alttext history fetch failed:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, [refreshTrigger]);

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? (Notion에서 숨김 처리됩니다)')) return;
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      const res = await fetch(`/api/alttext/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        alert('삭제 실패했습니다.');
        fetchList();
      }
    } catch (e) {
      console.error('alttext delete failed:', e);
      fetchList();
    }
  };

  if (isLoading) return <div className={styles.loading}>이미지 진단 이력 불러오는 중...</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles['header-title']}>이미지 진단 이력</h3>
      </div>

      {items.length === 0 ? (
        <div className={styles['empty-state']}>
          저장된 이미지 진단 이력이 없습니다.
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <div key={item.id} className={styles['item-row']}>
              <span className={styles['item-date']}>
                {item.date ? new Date(item.date).toLocaleDateString('ko-KR') : '-'}
              </span>
              <span className={styles['item-title']} title={item.title}>
                {item.title || '(제목 없음)'}
              </span>
              <span className={styles['item-images']}>이미지 {item.totalImages}장</span>
              <span className={styles['item-mismatches']}>불일치 {item.mismatches}건</span>
              <a href={`/alttext/${item.id}`} className={`btn btn-secondary ${styles['item-btn']}`}>
                리포트 보기
              </a>
              <button
                onClick={() => handleDelete(item.id)}
                className={`btn btn-secondary ${styles['item-btn']}`}
                aria-label="이미지 진단 리포트 삭제"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AltTextHistoryList;
