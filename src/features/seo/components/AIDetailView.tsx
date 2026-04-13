'use client';

import { useState } from 'react';
import { Brain, MessageSquare, Globe, Search, LayoutList, AlertTriangle } from 'lucide-react';
import type { SEOAnalysisResult, SEOIssue, SEOPassed } from '@/types/seo';
import { copyPromptAndOpenAI, AITool, AI_PROMPT_TEMPLATES } from '@/lib/ai-prompt-generator';
import styles from './AIDetailView.module.css';

interface AIDetailViewProps {
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

/* ── SVG 원형 점수 게이지 ── */

function ScoreCircle({ score, size = 80 }: { score: number; size?: number }) {
  const color = getScoreColor(score);
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={styles.scoreCircle} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={6} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={6} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.scoreText} style={{ color }} aria-label={`점수 ${score}점`}>{score}</span>
    </div>
  );
}

/* ── 미니 원형 점수 ── */

function MiniScoreCircle({ score }: { score: number }) {
  const size = 56;
  const color = getScoreColor(score);
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className={styles.miniScoreCircle} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={color} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.miniScoreText} style={{ color }}>{score}%</span>
    </div>
  );
}

/* ── 서브 지표 행 ── */

function SubMetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.subMetricRow}>
      <span className={styles.subMetricLabel}>{label}</span>
      <span className={styles.subMetricValue}>{value}</span>
    </div>
  );
}

/* ── 상태 행 (배지) ── */

function StatusRow({ label, ok, okText = '있음', badText = '없음' }: {
  label: string; ok: boolean; okText?: string; badText?: string;
}) {
  return (
    <div className={styles.statusRow}>
      <span className={styles.statusRowLabel}>{label}</span>
      {ok
        ? <span className={`${styles.badge} ${styles.badgeGood}`}>{okText}</span>
        : <span className={`${styles.badge} ${styles.badgeBad}`}>{badText} ✗</span>
      }
    </div>
  );
}

/* ── 이슈 아이템 ── */

function IssueItem({ issue }: { issue: SEOIssue }) {
  const severityStyle =
    issue.severity === 'critical' ? styles.issueCritical
    : issue.severity === 'warning' ? styles.issueWarning
    : styles.issueInfo;
  const severityColor =
    issue.severity === 'critical' ? '#ef4444'
    : issue.severity === 'warning' ? '#f59e0b'
    : '#3b82f6';

  return (
    <div className={`${styles.issueItem} ${severityStyle}`} role="listitem">
      <span className={styles.issueSeverity} style={{ color: severityColor }}>{issue.severity}</span>
      <div className={styles.issueContent}>
        <p className={styles.issueMessage}>{issue.message}</p>
        {issue.suggestion && <p className={styles.issueSuggestion}>{issue.suggestion}</p>}
      </div>
    </div>
  );
}

/* ── 통과 항목 ── */

function PassedSection({ passed }: { passed: SEOPassed[] }) {
  const [open, setOpen] = useState(false);
  if (!passed || passed.length === 0) return null;
  return (
    <div>
      <button type="button" className={styles.passedToggle} onClick={() => setOpen(!open)} aria-expanded={open}>
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

/* ── E-E-A-T 점수 계산 ── */

function computeEEAT(result: SEOAnalysisResult) {
  const schema = result.categories?.schema?.data;
  const content = result.categories?.content?.data;
  const social = result.categories?.social?.data;
  const meta = result.categories?.meta?.data;
  const semantic = result.categories?.semantic?.data;

  // 전문성: 저자/아티클 스키마 + 콘텐츠 깊이
  let expertise = 0;
  if (schema?.schemaTypes?.article) expertise += 40;
  if (schema?.schemaTypes?.person) expertise += 30;
  if ((content?.stats?.totalWords ?? 0) > 300) expertise += 20;
  if ((content?.stats?.totalWords ?? 0) > 800) expertise += 10;

  // 권위: OG 태그 + 조직/웹사이트 스키마
  let authority = 0;
  if (social?.openGraph?.title) authority += 30;
  if (social?.openGraph?.image) authority += 20;
  if (schema?.schemaTypes?.organization) authority += 30;
  if (schema?.schemaTypes?.website) authority += 20;

  // 관련도: 시맨틱 점수 + 키워드 밀도
  let relevance = 0;
  const semScore = semantic?.semanticScore ?? 0;
  relevance += Math.min(60, semScore);
  const topKw = content?.topKeywords?.[0];
  if (topKw && topKw.density > 0.5) relevance += 20;
  if (topKw && topKw.density > 1.5) relevance += 20;

  // 신뢰도: canonical + breadcrumb + organization
  let trust = 0;
  if (meta?.canonical?.exists) trust += 30;
  if (schema?.schemaTypes?.breadcrumb) trust += 30;
  if (schema?.schemaTypes?.organization) trust += 25;
  if (meta?.robots?.exists && !(meta.robots.content ?? '').includes('noindex')) trust += 15;

  return {
    expertise: Math.min(100, expertise),
    authority: Math.min(100, authority),
    relevance: Math.min(100, relevance),
    trust: Math.min(100, trust),
    total: Math.min(100, Math.round((expertise + authority + relevance + trust) / 4)),
  };
}

/* ── 대화형 최적화 계산 ── */

function computeConversational(result: SEOAnalysisResult) {
  const schema = result.categories?.schema?.data;
  const heading = result.categories?.heading?.data;

  const allHeadings = [
    ...(heading?.headings?.h2 ?? []),
    ...(heading?.headings?.h3 ?? []),
  ];
  const questionCount = allHeadings.filter(h => h.includes('?')).length;
  const hasFaq = !!(schema?.schemaTypes?.faq);
  const hasVoice = !!(schema?.jsonld?.some(
    (j) => typeof j === 'object' && j !== null && String((j as Record<string, unknown>)['@type'] ?? '').includes('Speakable')
  ));

  const total = Math.min(100, questionCount * 15 + (hasFaq ? 40 : 0) + (hasVoice ? 20 : 0));

  return { questionCount, conversationalUse: hasFaq ? 1 : 0, hasVoice, total };
}

/* ── 지식 그래프 계산 ── */

function computeKnowledgeGraph(result: SEOAnalysisResult) {
  const schema = result.categories?.schema?.data;
  const semantic = result.categories?.semantic?.data;
  const meta = result.categories?.meta?.data;

  const structuredDataScore = Math.min(100, (schema?.jsonld?.length ?? 0) * 25);
  const semanticHtmlScore = Math.min(100, semantic?.semanticScore ?? 0);

  const robotsContent = meta?.robots?.content ?? '';
  const isPublic = !robotsContent.includes('noindex') && !!(meta?.canonical?.exists);
  const contentPublicScore = isPublic ? 100 : (meta?.canonical?.exists ? 50 : 0);

  const total = Math.min(100, Math.round((structuredDataScore + semanticHtmlScore + contentPublicScore) / 3));

  return { structuredDataScore, semanticHtmlScore, contentPublicScore, total };
}

/* ── 엔티티 & 비교 계산 ── */

function computeEntity(result: SEOAnalysisResult) {
  const schema = result.categories?.schema?.data;
  const semantic = result.categories?.semantic?.data;
  const content = result.categories?.content?.data;

  const entityCount = Object.values(schema?.schemaTypes ?? {}).filter(Boolean).length;
  const tableCount = semantic?.tables?.total ?? 0;
  const hasQuantitative = (content?.stats?.totalWords ?? 0) > 100;

  return { entityCount, tableCount, hasQuantitative };
}

/* ── 메인 컴포넌트 ── */

export default function AIDetailView({ result }: AIDetailViewProps) {
  const [promptCopied, setPromptCopied] = useState(false);

  const geoCategory = result.categories?.geo;
  const geo = geoCategory?.data;
  const llms = geo?.llmsTxt;
  const geoScore = geoCategory?.score ?? geo?.score ?? 0;
  const geoIssues = geoCategory?.issues ?? [];
  const geoPassed = geoCategory?.passed ?? [];

  const eeat = computeEEAT(result);
  const conv = computeConversational(result);
  const kg = computeKnowledgeGraph(result);
  const entity = computeEntity(result);

  const schemaData = result.categories?.schema?.data;
  const hasFaq = !!(schemaData?.schemaTypes?.faq);
  const hasHowTo = !!(schemaData?.schemaTypes?.howto ?? false);
  const hasSummaryBox = !!(schemaData?.schemaTypes?.article);

  const handleAIPromptCopy = async (tool: AITool) => {
    const meta = result.categories?.meta?.data;
    const promptData = {
      siteName: new URL(result.url).hostname,
      url: result.url,
      llmsTxtContent: llms?.exists
        ? `(파일 존재, 점수: ${geoScore}/100)`
        : llms?.suggestedContent || '파일 없음',
      ruleBasedScore: geoScore,
      suggestedImprovements: [
        !llms?.exists && 'llms.txt 파일 생성 필요',
        !meta?.title?.exists && 'Title 태그 추가 필요',
        !meta?.description?.exists && 'Meta Description 추가 필요',
      ].filter(Boolean) as string[],
    };
    const success = await copyPromptAndOpenAI(tool, promptData);
    if (success) {
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 3000);
    }
  };

  const errorIssues = geoIssues.filter(i => i.message.startsWith('분석 중 오류'));
  const normalIssues = geoIssues.filter(i => !i.message.startsWith('분석 중 오류'));

  return (
    <div className={styles.container}>
      {/* 헤더 */}
      <div className={styles.header}>
        <ScoreCircle score={geoScore} />
        <div className={styles.headerInfo}>
          <h2 className={styles.headerTitle}>AI 최적화</h2>
          <p className={styles.headerMeta}>{getScoreLabel(geoScore)}</p>
        </div>
      </div>

      {/* 3컬럼 메트릭 카드 그리드 */}
      <div className={styles.metricGrid}>

        {/* E-E-A-T 신호 */}
        <section className={styles.metricCard} aria-label="E-E-A-T 신호">
          <div className={styles.metricCardHeader}>
            <Brain size={16} className={styles.metricIcon} aria-hidden="true" />
            <span className={styles.metricCardTitle}>E-E-A-T 신호</span>
          </div>
          <MiniScoreCircle score={eeat.total} />
          <div className={styles.subMetrics}>
            <SubMetricRow label="전문성" value={`${eeat.expertise}%`} />
            <SubMetricRow label="권위" value={`${eeat.authority}%`} />
            <SubMetricRow label="관련도" value={`${eeat.relevance}%`} />
            <SubMetricRow label="신뢰도" value={`${eeat.trust}%`} />
          </div>
        </section>

        {/* 대화형 최적화 */}
        <section className={styles.metricCard} aria-label="대화형 최적화">
          <div className={styles.metricCardHeader}>
            <MessageSquare size={16} className={styles.metricIcon} aria-hidden="true" />
            <span className={styles.metricCardTitle}>대화형 최적화</span>
          </div>
          <MiniScoreCircle score={conv.total} />
          <div className={styles.subMetrics}>
            <SubMetricRow label="자연어 질문" value={`${conv.questionCount}개`} />
            <SubMetricRow label="대화형 사용" value={`${conv.conversationalUse}회`} />
            <div className={styles.subMetricRow}>
              <span className={styles.subMetricLabel}>음성</span>
              {conv.hasVoice
                ? <span className={`${styles.badge} ${styles.badgeGood}`}>지원</span>
                : <span className={`${styles.badge} ${styles.badgeBad}`}>없음 ✗</span>
              }
            </div>
          </div>
        </section>

        {/* 지식 그래프 */}
        <section className={styles.metricCard} aria-label="지식 그래프">
          <div className={styles.metricCardHeader}>
            <Globe size={16} className={styles.metricIcon} aria-hidden="true" />
            <span className={styles.metricCardTitle}>지식 그래프</span>
          </div>
          <MiniScoreCircle score={kg.total} />
          <div className={styles.subMetrics}>
            <SubMetricRow label="구조화 데이터" value={`${kg.structuredDataScore}%`} />
            <SubMetricRow label="시맨틱 HTML" value={`${kg.semanticHtmlScore}%`} />
            <SubMetricRow label="콘텐츠 공개" value={`${kg.contentPublicScore}%`} />
          </div>
        </section>
      </div>

      {/* 엔티티 & 비교 */}
      <section className={styles.card} aria-label="엔티티 & 비교">
        <div className={styles.entityCardHeader}>
          <div className={styles.entityLeft}>
            <Search size={16} className={styles.cardIcon} aria-hidden="true" />
            <h3 className={styles.cardTitle}>엔티티 &amp; 비교</h3>
          </div>
          <span className={styles.entityBigNumber}>{entity.entityCount}</span>
        </div>
        <div className={styles.entityMetrics}>
          <div className={styles.entityMetricItem}>
            <span className={styles.entityMetricLabel}>엔티티</span>
            <span className={styles.entityMetricValue}>{entity.entityCount}개</span>
          </div>
          <div className={styles.entityDivider} aria-hidden="true" />
          <div className={styles.entityMetricItem}>
            <span className={styles.entityMetricLabel}>비교 테이블</span>
            <span className={styles.entityMetricValue}>{entity.tableCount}개</span>
          </div>
          <div className={styles.entityDivider} aria-hidden="true" />
          <div className={styles.entityMetricItem}>
            <span className={styles.entityMetricLabel}>정량적</span>
            {entity.hasQuantitative
              ? <span className={`${styles.badge} ${styles.badgeGood}`}>있음</span>
              : <span className={`${styles.badge} ${styles.badgeBad}`}>없음 ✗</span>
            }
          </div>
        </div>
      </section>

      {/* 구조화 데이터 현황 */}
      <section className={styles.card} aria-label="구조화 데이터 현황">
        <h3 className={styles.cardTitle}>
          <LayoutList size={16} className={styles.cardIcon} aria-hidden="true" />
          구조화 데이터 현황
        </h3>
        <div className={styles.statusList}>
          <StatusRow label="FAQ 스키마" ok={hasFaq} okText="있음" badText="없음" />
          <StatusRow label="HowTo 스키마" ok={hasHowTo} okText="있음" badText="없음" />
          <StatusRow label="요약 박스" ok={hasSummaryBox} okText="있음" badText="없음" />
        </div>
      </section>

      {/* 체크 항목 */}
      {(normalIssues.length > 0 || geoPassed.length > 0 || errorIssues.length > 0) && (
        <section className={styles.card} aria-label="체크 항목">
          <h3 className={styles.cardTitle}>
            <AlertTriangle size={16} className={styles.cardIcon} aria-hidden="true" />
            체크 항목
          </h3>

          {normalIssues.length > 0 && (
            <div role="list">
              {normalIssues.map((issue, idx) => (
                <IssueItem key={idx} issue={issue} />
              ))}
            </div>
          )}

          {geoPassed.length > 0 && <PassedSection passed={geoPassed} />}

          {errorIssues.map((issue, idx) => (
            <div key={idx} className={styles.errorBox} role="alert">
              ✖ {issue.message}
            </div>
          ))}
        </section>
      )}

      {/* AI 전문가 검증 */}
      <section className={styles.aiToolSection} aria-label="AI 전문가 검증">
        <h3 className={styles.toolTitle}>AI 전문가에게 추가 검증 요청</h3>
        <p className={styles.toolDesc}>
          규칙 기반 평가를 넘어, AI 전문가의 심층 분석을 받아보세요.
          아래 버튼을 클릭하면 전문가 프롬프트가 복사되고 AI 도구가 열립니다.
        </p>
        <div className={styles.buttonGroup}>
          {Object.entries(AI_PROMPT_TEMPLATES).map(([key, config]) => (
            <button
              key={key}
              type="button"
              onClick={() => handleAIPromptCopy(key as AITool)}
              className={styles.aiButton}
            >
              {config.icon} {config.name}에게 물어보기
            </button>
          ))}
        </div>
        {promptCopied && (
          <div className={styles.copySuccess} role="status" aria-live="polite">
            프롬프트가 복사되었습니다! AI 도구에 붙여넣으세요 (Ctrl/Cmd + V)
          </div>
        )}
      </section>
    </div>
  );
}
