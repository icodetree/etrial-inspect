'use client';

import { useState } from 'react';
import { FileCode2, Bot, Shield, AlertTriangle } from 'lucide-react';
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
      <span className={styles.scoreText} style={{ color }} aria-label={`AI 최적화 점수 ${score}점`}>
        {score}
      </span>
    </div>
  );
}

/* ── 이슈 아이템 ── */

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

/* ── 통과 항목 ── */

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

/* ── 메인 컴포넌트 ── */

export default function AIDetailView({ result }: AIDetailViewProps) {
  const [promptCopied, setPromptCopied] = useState(false);

  const geoCategory = result.categories?.geo;
  const geo = geoCategory?.data;
  const llms = geo?.llmsTxt;
  const geoScore = geoCategory?.score ?? geo?.score ?? 0;
  const geoIssues = geoCategory?.issues ?? [];
  const geoPassed = geoCategory?.passed ?? [];

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

  return (
    <div className={styles.container}>
      {/* 헤더: AI 최적화 점수 */}
      <div className={styles.header}>
        <ScoreCircle score={geoScore} />
        <div className={styles.headerInfo}>
          <h2 className={styles.headerTitle}>AI 최적화</h2>
          <p className={styles.headerMeta}>
            {getScoreLabel(geoScore)}
          </p>
        </div>
      </div>

      {/* 카드 1: llms.txt 분석 */}
      <section className={styles.card} aria-label="llms.txt 분석">
        <h3 className={styles.cardTitle}>
          <FileCode2 size={18} className={styles.cardIcon} aria-hidden="true" />
          llms.txt 분석
        </h3>

        <dl className={styles.statusGrid}>
          <dt className={styles.statusLabel}>파일 존재</dt>
          <dd className={styles.statusValue}>
            {llms?.exists ? (
              <span className={`${styles.badge} ${styles.badgeGood}`}>존재</span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeBad}`}>없음</span>
            )}
          </dd>

          {llms?.exists && (
            <>
              <dt className={styles.statusLabel}>H1 제목</dt>
              <dd className={styles.statusValue}>
                {llms.structure.hasH1 ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>있음</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeBad}`}>없음</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>H2 소제목</dt>
              <dd className={styles.statusValue}>
                {llms.structure.hasH2 ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>있음</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeBad}`}>없음</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>단어 수</dt>
              <dd className={styles.statusValue}>{llms.structure.wordCount}개</dd>

              <dt className={styles.statusLabel}>코드 블록</dt>
              <dd className={styles.statusValue}>{llms.structure.codeBlockCount}개</dd>

              <dt className={styles.statusLabel}>요약 존재</dt>
              <dd className={styles.statusValue}>
                {llms.contentQuality.hasSummary ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>있음</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeBad}`}>없음</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>키워드</dt>
              <dd className={styles.statusValue}>
                {llms.contentQuality.hasKeywords ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>포함</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeWarning}`}>미포함</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>연락처 정보</dt>
              <dd className={styles.statusValue}>
                {llms.contentQuality.hasContactInfo ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>포함</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeBad}`}>없음</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>URL 선언</dt>
              <dd className={styles.statusValue}>
                {llms.contentQuality.hasUrlDeclarations ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>포함</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeWarning}`}>없음</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>소셜 링크</dt>
              <dd className={styles.statusValue}>
                {llms.contentQuality.hasSocialLinks ? (
                  <span className={`${styles.badge} ${styles.badgeGood}`}>포함</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeWarning}`}>없음</span>
                )}
              </dd>

              <dt className={styles.statusLabel}>H2 섹션 수</dt>
              <dd className={styles.statusValue}>{llms.contentQuality.sectionCount ?? 0}개</dd>

              <dt className={styles.statusLabel}>가독성 점수</dt>
              <dd className={styles.statusValue}>{llms.contentQuality.readabilityScore}/10</dd>

              <dt className={styles.statusLabel}>구조 점수</dt>
              <dd className={styles.statusValue}>{llms.contentQuality.structureScore}/60</dd>
            </>
          )}
        </dl>

        {llms && !llms.exists && llms.suggestedContent && (
          <div className={styles.suggestionBox}>
            <p className={styles.suggestionTitle}>
              llms.txt 자동 생성 제안
            </p>
            <pre className={styles.suggestionPre}>
              {llms.suggestedContent}
            </pre>
          </div>
        )}
      </section>

      {/* 카드 2: AI 크롤러 접근성 */}
      <section className={styles.card} aria-label="AI 크롤러 접근성">
        <h3 className={styles.cardTitle}>
          <Shield size={18} className={styles.cardIcon} aria-hidden="true" />
          AI 크롤러 접근성
        </h3>

        <div className={styles.crawlerGrid}>
          {[
            { name: 'GPTBot', allowed: geo?.robotsAiCrawlers?.gptBot },
            { name: 'ClaudeBot', allowed: geo?.robotsAiCrawlers?.claudeBot },
            { name: 'Google-Extended', allowed: geo?.robotsAiCrawlers?.googleBot },
            { name: 'BingBot', allowed: geo?.robotsAiCrawlers?.bingBot },
          ].map((crawler) => (
            <div key={crawler.name} className={styles.crawlerItem}>
              <span className={styles.crawlerName}>{crawler.name}</span>
              {crawler.allowed ? (
                <span className={styles.crawlerAllowed}>허용</span>
              ) : (
                <span className={styles.crawlerBlocked}>
                  <AlertTriangle size={14} aria-hidden="true" /> 차단
                </span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 카드 3: Issues 목록 */}
      {geoIssues.length > 0 && (
        <section className={styles.card} aria-label="AI 최적화 이슈">
          <h3 className={styles.cardTitle}>
            <AlertTriangle size={18} className={styles.cardIcon} aria-hidden="true" />
            Issues ({geoIssues.length})
          </h3>
          <div role="list">
            {geoIssues.map((issue, idx) => (
              <IssueItem key={idx} issue={issue} />
            ))}
          </div>
        </section>
      )}

      {/* 통과 항목 */}
      {geoPassed.length > 0 && (
        <section className={styles.card} aria-label="AI 최적화 통과 항목">
          <PassedSection passed={geoPassed} />
        </section>
      )}

      {/* AI 전문가 검증 버튼 그룹 */}
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
