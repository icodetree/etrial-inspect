'use client';

import { useMemo, useState } from 'react';
import type { AltTextJudgment, AltTextScanResult } from '@/types/alt-text';
import { ReportPagination } from './ReportPagination';

const ITEMS_PER_PAGE = 20;

interface Props {
  scans: AltTextScanResult[];
}

const JUDGMENT_LABEL: Record<AltTextJudgment, string> = {
  pass: '정상',
  missing_alt: 'alt 누락',
  decorative_mismatch: '장식 오분류',
  text_mismatch: '텍스트 불일치',
  review_needed: '수동 검토 필요',
};

const JUDGMENT_COLOR: Record<AltTextJudgment, { bg: string; fg: string; border: string }> = {
  pass: { bg: '#ecfdf5', fg: '#047857', border: '#10b981' },
  missing_alt: { bg: '#fef2f2', fg: '#b91c1c', border: '#ef4444' },
  decorative_mismatch: { bg: '#fff7ed', fg: '#c2410c', border: '#f97316' },
  text_mismatch: { bg: '#fef3c7', fg: '#92400e', border: '#f59e0b' },
  review_needed: { bg: '#eff6ff', fg: '#1d4ed8', border: '#3b82f6' },
};

const IMAGE_TYPE_LABEL = {
  'text-heavy': '텍스트 이미지',
  mixed: '혼합',
  photo: '사진/도표',
};

export default function AltTextScanSection({ scans }: Props) {
  const [filter, setFilter] = useState<'all' | AltTextJudgment>('all');
  const [page, setPage] = useState<'all' | string>('all');
  const [currentPage, setCurrentPage] = useState(1);

  const totals = useMemo(() => {
    const acc: Record<AltTextJudgment, number> = {
      pass: 0,
      missing_alt: 0,
      decorative_mismatch: 0,
      text_mismatch: 0,
      review_needed: 0,
    };
    let totalScanned = 0;
    for (const s of scans) {
      totalScanned += s.totalImagesScanned;
      (Object.keys(acc) as AltTextJudgment[]).forEach((k) => {
        acc[k] += s.countsByJudgment[k] ?? 0;
      });
    }
    return { ...acc, totalScanned };
  }, [scans]);

  const filteredItems = useMemo(() => {
    const rows = scans.flatMap((s) =>
      s.items.map((it) => ({ ...it, pageUrl: s.pageUrl })),
    );
    return rows.filter((r) => {
      if (filter !== 'all' && r.judgment !== filter) return false;
      if (page !== 'all' && r.pageUrl !== page) return false;
      return true;
    });
  }, [scans, filter, page]);

  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const uniquePages = useMemo(
    () => Array.from(new Set(scans.map((s) => s.pageUrl))),
    [scans],
  );

  if (scans.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>이미지 대체텍스트 OCR 검증</h2>
      <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.9rem' }}>
        KWCAG 2.2 §1.1.1 — Tesseract.js OCR로 이미지 내 텍스트를 추출해 alt 속성과 비교합니다.
      </p>

      {/* 요약 통계 — 클릭 시 해당 판정으로 필터링 */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <button
          type="button"
          className="stat-card"
          onClick={() => { setFilter('all'); setCurrentPage(1); }}
          style={{
            cursor: 'pointer',
            outline: filter === 'all' ? '2px solid var(--c-primary, #f97316)' : undefined,
            outlineOffset: '-2px',
          }}
          aria-pressed={filter === 'all'}
          aria-label="전체 이미지 보기"
        >
          <div className="stat-value">{totals.totalScanned}</div>
          <div className="stat-label">검사한 이미지</div>
        </button>
        {(Object.keys(JUDGMENT_LABEL) as AltTextJudgment[]).map((j) => (
          <button
            type="button"
            className="stat-card"
            key={j}
            onClick={() => { setFilter(filter === j ? 'all' : j); setCurrentPage(1); }}
            style={{
              cursor: 'pointer',
              borderLeft: `4px solid ${JUDGMENT_COLOR[j].border}`,
              outline: filter === j ? `2px solid ${JUDGMENT_COLOR[j].border}` : undefined,
              outlineOffset: '-2px',
            }}
            aria-pressed={filter === j}
            aria-label={`${JUDGMENT_LABEL[j]} ${totals[j]}건 필터`}
          >
            <div className="stat-value" style={{ color: JUDGMENT_COLOR[j].fg }}>{totals[j]}</div>
            <div className="stat-label">{JUDGMENT_LABEL[j]}</div>
          </button>
        ))}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <select value={filter} onChange={(e) => { setFilter(e.target.value as 'all' | AltTextJudgment); setCurrentPage(1); }}>
          <option value="all">모든 판정</option>
          {(Object.keys(JUDGMENT_LABEL) as AltTextJudgment[]).map((j) => (
            <option key={j} value={j}>{JUDGMENT_LABEL[j]}</option>
          ))}
        </select>
        <select value={page} onChange={(e) => { setPage(e.target.value); setCurrentPage(1); }}>
          <option value="all">모든 페이지</option>
          {uniquePages.map((url) => (
            <option key={url} value={url}>{url}</option>
          ))}
        </select>
        <span style={{ color: '#94a3b8', alignSelf: 'center', fontSize: '0.9rem' }}>
          {filteredItems.length}건 표시
        </span>
      </div>

      {/* 아이템 목록 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {paginatedItems.map((item, idx) => {
          const color = JUDGMENT_COLOR[item.judgment];
          return (
            <div
              key={`${item.pageUrl}-${item.elementId}-${idx}`}
              style={{
                display: 'flex',
                gap: '1rem',
                padding: '1rem',
                border: `1px solid ${color.border}`,
                borderRadius: '0.5rem',
                background: color.bg,
              }}
            >
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                style={{
                  width: '120px',
                  height: '90px',
                  objectFit: 'contain',
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.25rem',
                  flexShrink: 0,
                }}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '9999px',
                      background: color.border,
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                    }}
                  >
                    {JUDGMENT_LABEL[item.judgment]}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    {IMAGE_TYPE_LABEL[item.imageType]}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    유사도 {(item.similarity * 100).toFixed(0)}%
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                    신뢰도 {(item.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                  <strong>현재 alt:</strong>{' '}
                  {item.currentAlt === null ? (
                    <em style={{ color: '#ef4444' }}>(속성 없음)</em>
                  ) : item.currentAlt === '' ? (
                    <em style={{ color: '#f59e0b' }}>(빈 문자열 — 장식 이미지)</em>
                  ) : (
                    <span>{`"${item.currentAlt}"`}</span>
                  )}
                </div>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.4rem' }}>
                  <strong>OCR 추출:</strong>{' '}
                  {item.extractedText ? (
                    <span>{`"${item.extractedText}"`}</span>
                  ) : (
                    <em style={{ color: '#9ca3af' }}>(추출된 텍스트 없음)</em>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: color.fg, marginTop: '0.4rem' }}>
                  {item.reason}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.3rem', wordBreak: 'break-all' }}>
                  {item.pageUrl} · {item.elementId}
                </div>

                {/* Claude Vision AI 판정 결과 */}
                {item.claudeAnalysis && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.75rem',
                      borderRadius: '0.375rem',
                      background: item.claudeAnalysis.isAdequate ? '#f0fdf4' : '#fef2f2',
                      border: `1px solid ${item.claudeAnalysis.isAdequate ? '#86efac' : '#fca5a5'}`,
                    }}
                    aria-label={`AI 판정: ${item.claudeAnalysis.isAdequate ? '적절' : '부적절'}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          background: item.claudeAnalysis.isAdequate ? '#22c55e' : '#ef4444',
                          color: '#fff',
                        }}
                      >
                        AI 판정
                      </span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          color: item.claudeAnalysis.isAdequate ? '#15803d' : '#b91c1c',
                        }}
                      >
                        {item.claudeAnalysis.isAdequate ? '적절한 대체텍스트' : '부적절한 대체텍스트'}
                      </span>
                    </div>
                    {item.claudeAnalysis.suggestedAlt && (
                      <div style={{ fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                        <strong>추천 alt:</strong>{' '}
                        <span style={{ color: '#374151' }}>{`"${item.claudeAnalysis.suggestedAlt}"`}</span>
                      </div>
                    )}
                    <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                      {item.claudeAnalysis.reason}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ReportPagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
