'use client';

import { useMemo, useState } from 'react';
import type { AltTextJudgment, AltTextScanResult } from '@/types/alt-text';
import { ReportPagination } from './ReportPagination';
import styles from './AltTextScanSection.module.css';

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
    <div className={`card ${styles['section-card']}`}>
      <h2 className={styles['section-title']}>이미지 대체텍스트 OCR 검증</h2>
      <p className={styles['section-desc']}>
        KWCAG 2.2 &sect;1.1.1 — Tesseract.js OCR로 이미지 내 텍스트를 추출해 alt 속성과 비교합니다.
      </p>

      {/* 요약 통계 — 클릭 시 해당 판정으로 필터링 */}
      <div className={`stats-grid ${styles['stats-wrap']}`}>
        <button
          type="button"
          className={`stat-card ${filter === 'all' ? styles['stat-card-pressed'] : ''}`}
          onClick={() => { setFilter('all'); setCurrentPage(1); }}
          style={filter === 'all' ? { outline: '2px solid var(--c-primary, #f97316)', outlineOffset: '-2px' } : undefined}
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
              borderLeft: `4px solid ${JUDGMENT_COLOR[j].border}`,
              outline: filter === j ? `2px solid ${JUDGMENT_COLOR[j].border}` : undefined,
              outlineOffset: filter === j ? '-2px' : undefined,
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
      <div className={styles['filter-bar']}>
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
        <span className={styles['filter-count']}>
          {filteredItems.length}건 표시
        </span>
      </div>

      {/* 아이템 목록 */}
      <div className={styles['item-list']}>
        {paginatedItems.map((item, idx) => {
          const color = JUDGMENT_COLOR[item.judgment];
          return (
            <div
              key={`${item.pageUrl}-${item.elementId}-${idx}`}
              className={styles['item-card']}
              style={{
                border: `1px solid ${color.border}`,
                background: color.bg,
              }}
            >
              <img
                src={item.imageUrl}
                alt=""
                loading="lazy"
                className={styles['item-thumb']}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                }}
              />
              <div className={styles['item-body']}>
                <div className={styles['item-meta']}>
                  <span
                    className={styles['judgment-badge']}
                    style={{ background: color.border }}
                  >
                    {JUDGMENT_LABEL[item.judgment]}
                  </span>
                  <span className={styles['meta-text']}>
                    {IMAGE_TYPE_LABEL[item.imageType]}
                  </span>
                  <span className={styles['meta-text']}>
                    유사도 {(item.similarity * 100).toFixed(0)}%
                  </span>
                  <span className={styles['meta-text']}>
                    신뢰도 {(item.confidenceScore * 100).toFixed(0)}%
                  </span>
                </div>
                <div className={styles['alt-line']}>
                  <strong>현재 alt:</strong>{' '}
                  {item.currentAlt === null ? (
                    <em className={styles['alt-missing']}>(속성 없음)</em>
                  ) : item.currentAlt === '' ? (
                    <em className={styles['alt-empty']}>(빈 문자열 — 장식 이미지)</em>
                  ) : (
                    <span>{`"${item.currentAlt}"`}</span>
                  )}
                </div>
                <div className={styles['alt-line']}>
                  <strong>OCR 추출:</strong>{' '}
                  {item.extractedText ? (
                    <span>{`"${item.extractedText}"`}</span>
                  ) : (
                    <em className={styles['ocr-missing']}>(추출된 텍스트 없음)</em>
                  )}
                </div>
                <div className={styles['reason-text']} style={{ color: color.fg }}>
                  {item.reason}
                </div>
                <div className={styles['element-info']}>
                  {item.pageUrl} &middot; {item.elementId}
                </div>

                {/* Claude Vision AI 판정 결과 */}
                {item.claudeAnalysis && (
                  <div
                    className={`${styles['ai-panel']} ${item.claudeAnalysis.isAdequate ? styles['ai-panel-adequate'] : styles['ai-panel-inadequate']}`}
                    aria-label={`AI 판정: ${item.claudeAnalysis.isAdequate ? '적절' : '부적절'}`}
                  >
                    <div className={styles['ai-header']}>
                      <span
                        className={`${styles['ai-badge']} ${item.claudeAnalysis.isAdequate ? styles['ai-badge-adequate'] : styles['ai-badge-inadequate']}`}
                      >
                        AI 판정
                      </span>
                      <span
                        className={`${styles['ai-verdict']} ${item.claudeAnalysis.isAdequate ? styles['ai-verdict-adequate'] : styles['ai-verdict-inadequate']}`}
                      >
                        {item.claudeAnalysis.isAdequate ? '적절한 대체텍스트' : '부적절한 대체텍스트'}
                      </span>
                    </div>
                    {item.claudeAnalysis.suggestedAlt && (
                      <div className={styles['ai-suggested']}>
                        <strong>추천 alt:</strong>{' '}
                        <span className={styles['ai-suggested-text']}>{`"${item.claudeAnalysis.suggestedAlt}"`}</span>
                      </div>
                    )}
                    <div className={styles['ai-reason']}>
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
