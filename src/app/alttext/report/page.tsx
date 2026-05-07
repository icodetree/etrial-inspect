'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AltTextResultViewer } from '@/features/alttext/components/AltTextResultViewer';
import type { AltTextAuditResult } from '@/types/alt-text';
import styles from '@/app/page.module.css';

const STORAGE_KEY = 'altTextAuditResult';

export default function AltTextReportPage() {
  const [result, setResult] = useState<AltTextAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AltTextAuditResult;
        if (parsed && parsed.scans && parsed.totalUrls !== undefined) {
          setResult(parsed);
        }
      }
    } catch {
      // localStorage 파싱 실패 시 무시
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (isLoading) return null;

  if (!result) {
    return (
      <main className="container">
        <section className={`card ${styles['empty-card']}`}>
          <h2>이미지 진단 결과가 없습니다</h2>
          <p className={styles['empty-text']}>
            먼저 이미지 진단 페이지에서 진단을 수행해주세요.
          </p>
          <Link href="/alttext" className={`btn btn-primary ${styles['back-link']}`}>
            ← 이미지 진단으로 이동
          </Link>
        </section>
      </main>
    );
  }

  return <AltTextResultViewer result={result} />;
}
