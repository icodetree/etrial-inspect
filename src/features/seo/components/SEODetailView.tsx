'use client';

import { useState, useRef, useCallback } from 'react';
import {
  FileText,
  List,
  Image,
  Link2,
  Share2,
  AlignLeft,
  Code2,
  Accessibility,
  Database,
  Settings,
} from 'lucide-react';
import type { SEOAnalysisResult, SEOIssue, SEOPassed } from '@/types/seo';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySEOCategory = { name: string; score: number; issues: SEOIssue[]; passed: SEOPassed[]; data: any };
import styles from './SEODetailView.module.css';

interface SEODetailViewProps {
  result: SEOAnalysisResult;
}

/* ── 유틸 ── */

function getScoreColor(score: number): string {
  if (score >= 90) return '#3b82f6';
  if (score >= 70) return '#22c55e';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return '완벽해요!';
  if (score >= 70) return '훌륭해요!';
  if (score >= 50) return '괜찮아요';
  return '많이 개선해야 해요';
}

/* ── 카테고리 정의 ── */

type CategoryKey = 'meta' | 'heading' | 'image' | 'link' | 'social' | 'content' | 'semantic' | 'accessibility' | 'schema' | 'technical';

interface CategoryDef {
  key: CategoryKey;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'meta', label: '메타데이터', icon: FileText },
  { key: 'heading', label: '헤딩구조', icon: List },
  { key: 'image', label: '이미지', icon: Image },
  { key: 'link', label: '링크', icon: Link2 },
  { key: 'social', label: '소셜미디어', icon: Share2 },
  { key: 'content', label: '콘텐츠', icon: AlignLeft },
  { key: 'semantic', label: '시맨틱', icon: Code2 },
  { key: 'accessibility', label: '접근성보조', icon: Accessibility },
  { key: 'schema', label: '구조화데이터', icon: Database },
  { key: 'technical', label: '기술적SEO', icon: Settings },
];

const TAB_ITEMS = ['전체', ...CATEGORIES.map((c) => c.label)];

/* ── SVG 원형 점수 게이지 ── */

function ScoreCircle({ score, size = 80 }: { score: number; size?: number }) {
  const color = getScoreColor(score);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={styles.scoreCircle} style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.scoreText} style={{ color }} aria-label={`종합 점수 ${score}점`}>
        {score}
      </span>
    </div>
  );
}

/* ── 페이지 서머리 ── */

function PageSummary({ result }: { result: SEOAnalysisResult }) {
  const meta = result.categories?.meta?.data;
  const heading = result.categories?.heading?.data;

  if (!meta) return null;

  return (
    <section className={styles.summary} aria-label="페이지 서머리">
      <h3 className={styles.summaryTitle}>페이지 서머리</h3>
      <dl className={styles.summaryGrid}>
        <dt className={styles.summaryLabel}>URL</dt>
        <dd className={styles.summaryValue}>{result.url}</dd>

        <dt className={styles.summaryLabel}>Canonical</dt>
        <dd className={styles.summaryValue}>
          {meta.canonical?.exists ? (
            <span className={`${styles.summaryBadge} ${styles.badgeGood}`}>설정됨</span>
          ) : (
            <span className={`${styles.summaryBadge} ${styles.badgeBad}`}>미설정</span>
          )}
          {meta.canonical?.href ? ` ${meta.canonical.href}` : ''}
        </dd>

        <dt className={styles.summaryLabel}>Title</dt>
        <dd className={styles.summaryValue}>
          {meta.title?.exists ? `"${meta.title.text}" (${meta.title.length}자)` : (
            <span className={`${styles.summaryBadge} ${styles.badgeBad}`}>없음</span>
          )}
        </dd>

        <dt className={styles.summaryLabel}>Description</dt>
        <dd className={styles.summaryValue}>
          {meta.description?.exists
            ? `"${meta.description.content?.slice(0, 80)}${(meta.description.content?.length ?? 0) > 80 ? '...' : ''}" (${meta.description.length}자)`
            : <span className={`${styles.summaryBadge} ${styles.badgeBad}`}>없음</span>
          }
        </dd>

        <dt className={styles.summaryLabel}>H1</dt>
        <dd className={styles.summaryValue}>
          {heading?.h1Text
            ? `"${heading.h1Text}"`
            : <span className={`${styles.summaryBadge} ${styles.badgeBad}`}>없음</span>
          }
        </dd>

        <dt className={styles.summaryLabel}>Robots</dt>
        <dd className={styles.summaryValue}>{meta.robots?.content || meta.robots?.defaultValue || '-'}</dd>

        <dt className={styles.summaryLabel}>Lang</dt>
        <dd className={styles.summaryValue}>
          {meta.language ? (
            <>
              {meta.language}{' '}
              <span className={`${styles.summaryBadge} ${styles.badgeGood}`}>설정됨</span>
            </>
          ) : (
            <span className={`${styles.summaryBadge} ${styles.badgeBad}`}>미설정</span>
          )}
        </dd>

        {meta.author?.exists && (
          <>
            <dt className={styles.summaryLabel}>Author</dt>
            <dd className={styles.summaryValue}>{meta.author.content}</dd>
          </>
        )}
      </dl>
    </section>
  );
}

/* ── 카테고리 카드 ── */

interface CategoryCardProps {
  catDef: CategoryDef;
  category: AnySEOCategory;
  onClick: () => void;
}

function CategoryCard({ catDef, category, onClick }: CategoryCardProps) {
  const score = category.score ?? 0;
  const color = getScoreColor(score);
  const label = getScoreLabel(score);
  const Icon = catDef.icon;

  const criticalCount = category.issues?.filter((i) => i.severity === 'critical').length ?? 0;
  const warningCount = category.issues?.filter((i) => i.severity === 'warning').length ?? 0;
  const passedCount = category.passed?.length ?? 0;

  return (
    <button
      type="button"
      className={styles.categoryCard}
      onClick={onClick}
      aria-label={`${catDef.label} 카테고리, 점수 ${score}점, ${label}`}
    >
      <div className={styles.cardTop}>
        <Icon size={20} className={styles.cardIcon} aria-hidden="true" />
        <span className={styles.cardScore} style={{ color }}>{score}</span>
      </div>
      <div className={styles.cardName}>{catDef.label}</div>
      <div className={styles.cardStatus}>{label}</div>
      <div className={styles.cardDots}>
        {criticalCount > 0 && (
          <span className={styles.dotCritical} aria-label={`심각 ${criticalCount}건`}>
            ● {criticalCount}
          </span>
        )}
        {warningCount > 0 && (
          <span className={styles.dotWarning} aria-label={`경고 ${warningCount}건`}>
            ● {warningCount}
          </span>
        )}
        {passedCount > 0 && (
          <span className={styles.dotGood} aria-label={`통과 ${passedCount}건`}>
            ● {passedCount}
          </span>
        )}
      </div>
    </button>
  );
}

/* ── 카테고리 상세 패널 ── */

interface CategoryDetailProps {
  catDef: CategoryDef;
  category: AnySEOCategory;
  onClose: () => void;
}

function IssueItem({ issue }: { issue: SEOIssue }) {
  const severityStyle =
    issue.severity === 'critical'
      ? styles.issueCritical
      : issue.severity === 'warning'
        ? styles.issueWarning
        : styles.issueInfo;

  const severityColor =
    issue.severity === 'critical'
      ? '#ef4444'
      : issue.severity === 'warning'
        ? '#f59e0b'
        : '#3b82f6';

  return (
    <div className={`${styles.issueItem} ${severityStyle}`} role="listitem">
      <span className={styles.issueSeverity} style={{ color: severityColor }}>
        {issue.severity}
      </span>
      <div className={styles.issueContent}>
        <p className={styles.issueMessage}>{issue.message}</p>
        {issue.suggestion && (
          <p className={styles.issueSuggestion}>{issue.suggestion}</p>
        )}
      </div>
    </div>
  );
}

function PassedSection({ passed }: { passed: SEOPassed[] }) {
  const [open, setOpen] = useState(false);

  if (!passed || passed.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        className={styles.passedToggle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? '▾' : '▸'} 통과 항목 ({passed.length}개)
      </button>
      {open && (
        <div className={styles.passedList} role="list">
          {passed.map((p, idx) => (
            <div key={idx} className={styles.passedItem} role="listitem">
              <span className={styles.passedIcon} aria-hidden="true">&#10003;</span>
              <span>{p.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryDetail({ catDef, category, onClose }: CategoryDetailProps) {
  const issues = category.issues ?? [];
  const passed = category.passed ?? [];
  const score = category.score ?? 0;
  const Icon = catDef.icon;

  return (
    <section
      className={styles.detailPanel}
      aria-label={`${catDef.label} 상세 분석`}
    >
      <div className={styles.detailHeader}>
        <button
          type="button"
          className={styles.detailClose}
          onClick={onClose}
          aria-label="전체 목록으로 돌아가기"
        >
          ← 전체
        </button>
        <h3 className={styles.detailTitle}>{catDef.label} 상세</h3>
      </div>

      {/* 점수 요약 */}
      <div className={styles.detailSummary}>
        <Icon size={24} aria-hidden="true" />
        <span className={styles.detailScoreValue} style={{ color: getScoreColor(score) }}>
          {score}
        </span>
        <span className={styles.detailScoreLabel}>{getScoreLabel(score)}</span>
      </div>

      {issues.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Issues ({issues.length})</p>
          <div role="list">
            {issues.map((issue, idx) => (
              <IssueItem key={idx} issue={issue} />
            ))}
          </div>
        </>
      )}

      <PassedSection passed={passed} />

      {issues.length === 0 && passed.length === 0 && (
        <p className={styles.emptyState}>분석 데이터가 없습니다.</p>
      )}
    </section>
  );
}

/* ── 메인 컴포넌트 ── */

export default function SEODetailView({ result }: SEODetailViewProps) {
  const [activeTab, setActiveTab] = useState('전체');

  const cats = result.categories;
  if (!cats) return null;

  const availableCategories = CATEGORIES.filter(
    (c) => cats[c.key] != null
  );

  const totalCategories = availableCategories.length;

  // 활성 카테고리 (전체가 아닌 경우)
  const activeCatDef = activeTab !== '전체'
    ? CATEGORIES.find((c) => c.label === activeTab) ?? null
    : null;
  const activeCatData: AnySEOCategory | null = activeCatDef ? cats[activeCatDef.key] : null;

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      let nextIndex: number | null = null;

      if (e.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % TAB_ITEMS.length;
      } else if (e.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + TAB_ITEMS.length) % TAB_ITEMS.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = TAB_ITEMS.length - 1;
      }

      if (nextIndex !== null) {
        e.preventDefault();
        setActiveTab(TAB_ITEMS[nextIndex]);
        tabRefs.current[nextIndex]?.focus();
      }
    },
    [],
  );

  const handleCardClick = (catDef: CategoryDef) => {
    setActiveTab(catDef.label);
  };

  return (
    <div className={styles.container}>
      {/* 헤더: 종합 점수 원형 게이지 + 요약 */}
      <div className={styles.header}>
        <ScoreCircle score={result.score} />
        <div className={styles.headerInfo}>
          <h2 className={styles.headerTitle}>SEO 종합 분석</h2>
          <p className={styles.headerMeta}>
            {totalCategories}개 카테고리 분석 완료
            <br />
            URL: {result.url}
          </p>
        </div>
      </div>

      {/* 페이지 서머리 */}
      <PageSummary result={result} />

      {/* 카테고리 탭 */}
      <div role="tablist" aria-label="카테고리 필터" className={styles.tabBar}>
        {TAB_ITEMS.map((tab, index) => (
          <button
            key={tab}
            role="tab"
            type="button"
            id={`seo-tab-${tab}`}
            ref={(el) => { tabRefs.current[index] = el; }}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            aria-selected={activeTab === tab}
            aria-controls={`seo-tabpanel-${activeTab}`}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => {
              setActiveTab(tab);
            }}
            onKeyDown={(e) => handleTabKeyDown(e, index)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* 탭패널: 전체=카드그리드, 개별=상세페이지 */}
      <div
        role="tabpanel"
        id={`seo-tabpanel-${activeTab}`}
        aria-labelledby={`seo-tab-${activeTab}`}
        className={activeTab === '전체' ? styles.categoryGrid : undefined}
      >
        {activeTab === '전체' ? (
          availableCategories.map((catDef) => {
            const category = cats[catDef.key];
            if (!category) return null;
            return (
              <CategoryCard
                key={catDef.key}
                catDef={catDef}
                category={category}
                onClick={() => handleCardClick(catDef)}
              />
            );
          })
        ) : (
          activeCatDef && activeCatData && (
            <CategoryDetail
              catDef={activeCatDef}
              category={activeCatData}
              onClose={() => setActiveTab('전체')}
            />
          )
        )}
      </div>
    </div>
  );
}
