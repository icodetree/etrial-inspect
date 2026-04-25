'use client';

import { useEffect, useState } from 'react';
import type { AltTextHistoryItem } from '@/types/alt-text';

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

  if (isLoading) return <div style={{ padding: '1rem' }}>이미지 진단 이력 불러오는 중...</div>;

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '1rem' }}>이미지 진단 이력</h3>
      </div>

      {items.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>
          저장된 이미지 진단 이력이 없습니다.
        </div>
      ) : (
        <div>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.875rem 1.25rem',
                borderBottom: '1px solid #f3f4f6',
                fontSize: '0.875rem',
              }}
            >
              <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                {item.date ? new Date(item.date).toLocaleDateString('ko-KR') : '-'}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.title}>
                {item.title || '(제목 없음)'}
              </span>
              <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>이미지 {item.totalImages}장</span>
              <span style={{ color: '#b91c1c', whiteSpace: 'nowrap' }}>불일치 {item.mismatches}건</span>
              <a href={`/alttext/${item.id}`} className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem' }}>
                리포트 보기
              </a>
              <button
                onClick={() => handleDelete(item.id)}
                className="btn btn-secondary"
                aria-label="이미지 진단 리포트 삭제"
                style={{ fontSize: '0.8125rem', padding: '0.25rem 0.625rem' }}
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
