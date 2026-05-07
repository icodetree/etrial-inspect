'use client';

import { AltTextHistoryList } from '@/features/alttext/components/AltTextHistoryList';
import { History } from 'lucide-react';

export default function AltTextHistoryPage() {
  return (
    <div style={{ padding: '2rem' }}>
      {/* 페이지 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#f3f4f6', borderRadius: '8px', padding: '8px' }}>
          <History size={20} color="#6b7280" aria-hidden="true" />
        </div>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            이미지 진단 이력
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '2px 0 0' }}>
            Notion에 저장된 과거 이미지 진단 결과를 조회합니다.
          </p>
        </div>
      </div>

      <AltTextHistoryList />
    </div>
  );
}
