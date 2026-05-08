/**
 * 접근성 개선 주간 비교 보고서 PDF 생성기
 *
 * ComparisonResult + 양쪽 AuditResult 를 받아
 * 클라이언트 제출용 진행 보고서 HTML 을 생성한다.
 * Playwright 로 PDF 변환하는 것은 API Route 에서 처리한다.
 */

import type { AuditResult } from '@/types';
import type { ComparisonResult, CompactViolation } from './comparison/types';
import {
  imageToBase64,
  getPngDimensions,
  renderCroppedScreenshot,
  escapeHtml,
  formatDateKR,
} from './pdf-utils';

export interface ComparisonPDFOptions {
  clientName?: string;
  projectName?: string;
  reportPeriod?: string;
  weekNumber?: number;
}

const IMPACT_LABELS: Record<string, string> = {
  critical: '심각',
  serious: '높음',
  moderate: '보통',
  minor: '낮음',
};

const IMPACT_COLORS: Record<string, string> = {
  critical: '#ef4444',
  serious: '#f97316',
  moderate: '#f59e0b',
  minor: '#6b7280',
};

const IMPACT_ORDER = ['critical', 'serious', 'moderate', 'minor'];

/** 최대 상세 표시 건수 — 초과분은 "외 N건" 요약 */
const MAX_DETAIL_ITEMS = 20;

export class ComparisonPDFGenerator {
  private comparison: ComparisonResult;
  private baseResult: AuditResult;
  private currentResult: AuditResult;
  private options: ComparisonPDFOptions;
  private imageCache: Map<string, string> = new Map();

  constructor(
    comparison: ComparisonResult,
    baseResult: AuditResult,
    currentResult: AuditResult,
    options: ComparisonPDFOptions = {},
  ) {
    this.comparison = comparison;
    this.baseResult = baseResult;
    this.currentResult = currentResult;
    this.options = options;
  }

  async generateHTML(): Promise<string> {
    await this.preloadImages();

    const sections = [
      this.renderCover(),
      this.renderSummary(),
      this.renderResolvedSection(),
      this.renderNewSection(),
      this.renderPersistentSection(),
    ];

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>접근성 개선 주간 보고서</title>
  <style>${COMPARISON_PDF_STYLES}</style>
</head>
<body>
  ${sections.join('\n')}
</body>
</html>`;
  }

  // ─── 1. 표지 ─────────────────────────────────────────────────────

  private renderCover(): string {
    const { clientName, reportPeriod, weekNumber } = this.options;
    const baseDate = formatDateKR(this.comparison.baseDate);
    const currentDate = formatDateKR(this.comparison.currentDate);

    return `
    <div class="cover">
      <div class="cover-badge">KWCAG 2.2</div>
      <h1 class="cover-title">접근성 개선<br>주간 보고서</h1>
      ${clientName ? `<p class="cover-client">${escapeHtml(clientName)}</p>` : ''}
      ${weekNumber ? `<p class="cover-week">제${weekNumber}주차</p>` : ''}
      ${reportPeriod ? `<p class="cover-period">${escapeHtml(reportPeriod)}</p>` : `<p class="cover-period">${baseDate} ~ ${currentDate}</p>`}
      <p class="cover-org">e-able a11y</p>
    </div>`;
  }

  // ─── 2. 요약 ─────────────────────────────────────────────────────

  private renderSummary(): string {
    const c = this.comparison;
    const violDelta = c.violationCountDelta;
    const scoreDelta = c.scoreDelta;
    const pageDelta = c.pageCountDelta;

    // 개선율: 해결 건수 / 이전 위반 수
    const improvementRate = violDelta.before > 0
      ? ((c.resolvedViolations.length / violDelta.before) * 100)
      : 0;

    // Impact 테이블
    const impactRows = IMPACT_ORDER.map(impact => {
      const entry = c.byImpactDelta[impact];
      if (!entry) return '';
      const deltaClass = entry.delta < 0 ? 'delta-good' : entry.delta > 0 ? 'delta-bad' : 'delta-neutral';
      const sign = entry.delta > 0 ? '+' : '';
      return `
        <tr>
          <td><span class="impact-badge" style="background:${IMPACT_COLORS[impact]};">${IMPACT_LABELS[impact] || impact}</span></td>
          <td>${entry.before}</td>
          <td>${entry.after}</td>
          <td class="${deltaClass}">${sign}${entry.delta}</td>
        </tr>`;
    }).join('');

    return `
    <div class="page-break">
      <h2 class="section-title">요약</h2>

      <div class="summary-cards">
        ${this.renderDeltaCard('위반 수', violDelta, true)}
        ${this.renderDeltaCard('SEO 점수', scoreDelta, false)}
        ${this.renderDeltaCard('페이지 수', pageDelta, false)}
      </div>

      <!-- 개선율 프로그레스 바 -->
      <div class="progress-section">
        <p class="progress-label">개선율</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${Math.min(improvementRate, 100).toFixed(1)}%;"></div>
        </div>
        <p class="progress-value">${improvementRate.toFixed(1)}%</p>
        <p class="progress-detail">해결 ${c.resolvedViolations.length}건 / 이전 전체 ${violDelta.before}건</p>
      </div>

      <!-- Impact별 비교 테이블 -->
      <h3 class="subsection-title">영향도별 변화</h3>
      <table class="impact-table">
        <thead>
          <tr>
            <th>영향도</th>
            <th>기준</th>
            <th>현재</th>
            <th>변화</th>
          </tr>
        </thead>
        <tbody>${impactRows}</tbody>
      </table>
    </div>`;
  }

  private renderDeltaCard(
    label: string,
    entry: { before: number; after: number; delta: number },
    invertSign: boolean,
  ): string {
    const effective = invertSign ? -entry.delta : entry.delta;
    const colorClass = effective > 0 ? 'delta-good' : effective < 0 ? 'delta-bad' : 'delta-neutral';
    const sign = entry.delta > 0 ? '+' : '';

    return `
      <div class="summary-card">
        <p class="card-label">${escapeHtml(label)}</p>
        <p class="card-delta ${colorClass}">${sign}${entry.delta}</p>
        <p class="card-detail">${entry.before} &rarr; ${entry.after}</p>
      </div>`;
  }

  // ─── 3. 해결 위반 상세 ───────────────────────────────────────────

  private renderResolvedSection(): string {
    const resolved = this.comparison.resolvedViolations;
    if (resolved.length === 0) {
      return `
      <div class="page-break">
        <h2 class="section-title">해결된 위반</h2>
        <p class="empty-message">이번 주 해결된 위반이 없습니다.</p>
      </div>`;
    }

    const shown = resolved.slice(0, MAX_DETAIL_ITEMS);
    const remaining = resolved.length - shown.length;

    const items = shown.map(v => this.renderViolationDetail(v, 'resolved')).join('');
    const extra = remaining > 0
      ? `<p class="extra-count">외 ${remaining}건 해결됨</p>`
      : '';

    return `
    <div class="page-break">
      <h2 class="section-title">해결된 위반 (${resolved.length}건)</h2>
      ${items}
      ${extra}
    </div>`;
  }

  // ─── 4. 신규 발견 위반 ───────────────────────────────────────────

  private renderNewSection(): string {
    const newV = this.comparison.newViolations;
    if (newV.length === 0) return '';

    const shown = newV.slice(0, MAX_DETAIL_ITEMS);
    const remaining = newV.length - shown.length;

    const items = shown.map(v => this.renderViolationDetail(v, 'new')).join('');
    const extra = remaining > 0
      ? `<p class="extra-count">외 ${remaining}건 신규 발견</p>`
      : '';

    return `
    <div class="page-break">
      <h2 class="section-title">신규 발견 위반 (${newV.length}건)</h2>
      ${items}
      ${extra}
    </div>`;
  }

  // ─── 5. 잔여 위반 요약 ───────────────────────────────────────────

  private renderPersistentSection(): string {
    return `
    <div class="page-break">
      <h2 class="section-title">잔여 위반 요약</h2>
      <div class="persistent-box">
        <p class="persistent-count">${this.comparison.persistentCount}건</p>
        <p class="persistent-label">지속 위반</p>
        <p class="persistent-note">다음 주 개선 예정</p>
      </div>
    </div>`;
  }

  // ─── 위반 상세 카드 ──────────────────────────────────────────────

  private renderViolationDetail(
    v: CompactViolation,
    type: 'resolved' | 'new',
  ): string {
    const impactColor = IMPACT_COLORS[v.impact] || '#6b7280';
    const impactLabel = IMPACT_LABELS[v.impact] || v.impact;
    const badgeClass = type === 'resolved' ? 'badge-resolved' : 'badge-new';
    const badgeText = type === 'resolved' ? '해결됨' : '신규';

    // 크롭 스크린샷
    let screenshotHtml = '';
    if (v.screenshotPath && v.boundingBox) {
      const base64 = this.imageCache.get(v.screenshotPath);
      if (base64) {
        const dims = getPngDimensions(base64);
        if (dims) {
          const label = type === 'resolved' ? '이전 상태' : '현재 상태';
          screenshotHtml = `
          <div class="screenshot-block">
            <p class="screenshot-label">${label}</p>
            ${renderCroppedScreenshot(base64, v.boundingBox, dims)}
          </div>`;
        }
      }
    }

    // 코드 스니펫
    const codeHtml = v.affectedCode
      ? `<pre class="code-snippet">${escapeHtml(v.affectedCode)}</pre>`
      : '';

    return `
    <div class="violation-card avoid-break">
      <div class="violation-header">
        <span class="kwcag-id">${escapeHtml(v.kwcagId)}</span>
        <span class="kwcag-name">${escapeHtml(v.kwcagName)}</span>
        <span class="impact-badge" style="background:${impactColor};">${escapeHtml(impactLabel)}</span>
        <span class="${badgeClass}">${badgeText}</span>
      </div>
      ${screenshotHtml}
      ${codeHtml}
      <p class="violation-desc">${escapeHtml(v.description)}</p>
      <p class="violation-page">${escapeHtml(v.pageUrl)}</p>
    </div>`;
  }

  // ─── 이미지 사전 로드 ────────────────────────────────────────────

  private async preloadImages(): Promise<void> {
    const paths = new Set<string>();
    const allViolations = [
      ...this.comparison.resolvedViolations,
      ...this.comparison.newViolations,
    ];

    for (const v of allViolations) {
      if (v.screenshotPath) paths.add(v.screenshotPath);
    }

    // resolvedViolations 은 base 스크린샷, newViolations 은 current 스크린샷
    for (const sp of paths) {
      try {
        // base 스크린샷 URL 먼저, 실패 시 current
        let base64 = await imageToBase64(sp, this.comparison.baseScreenshotUrl);
        if (!base64) {
          base64 = await imageToBase64(sp, this.comparison.currentScreenshotUrl);
        }
        if (base64) {
          this.imageCache.set(sp, base64);
        }
      } catch {
        // 스크린샷 로드 실패는 무시
      }
    }
  }
}

// ─── 스타일 ──────────────────────────────────────────────────────

const COMPARISON_PDF_STYLES = `
  @page {
    size: A4;
    margin: 15mm;
  }

  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  body {
    font-family: 'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
    font-size: 10pt;
    color: #1a202c;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page-break {
    page-break-before: always;
    padding-top: 10mm;
  }

  .avoid-break {
    page-break-inside: avoid;
  }

  /* ── 표지 ── */
  .cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 250mm;
    text-align: center;
  }

  .cover-badge {
    display: inline-block;
    background: #3b82f6;
    color: #fff;
    font-size: 9pt;
    font-weight: 700;
    padding: 4px 16px;
    border-radius: 20px;
    margin-bottom: 24px;
    letter-spacing: 0.05em;
  }

  .cover-title {
    font-size: 28pt;
    font-weight: 800;
    color: #111827;
    line-height: 1.3;
    margin-bottom: 20px;
  }

  .cover-client {
    font-size: 16pt;
    font-weight: 600;
    color: #374151;
    margin-bottom: 8px;
  }

  .cover-week {
    font-size: 14pt;
    font-weight: 600;
    color: #3b82f6;
    margin-bottom: 8px;
  }

  .cover-period {
    font-size: 11pt;
    color: #6b7280;
    margin-bottom: 40px;
  }

  .cover-org {
    font-size: 10pt;
    color: #9ca3af;
    margin-top: auto;
  }

  /* ── 섹션 제목 ── */
  .section-title {
    font-size: 16pt;
    font-weight: 700;
    color: #111827;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid #e5e7eb;
  }

  .subsection-title {
    font-size: 11pt;
    font-weight: 600;
    color: #374151;
    margin: 16px 0 8px;
  }

  /* ── 요약 카드 ── */
  .summary-cards {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
  }

  .summary-card {
    flex: 1;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
    background: #fff;
  }

  .card-label {
    font-size: 9pt;
    color: #6b7280;
    margin-bottom: 6px;
  }

  .card-delta {
    font-size: 20pt;
    font-weight: 700;
    line-height: 1.2;
  }

  .card-detail {
    font-size: 9pt;
    color: #9ca3af;
    margin-top: 4px;
  }

  .delta-good { color: #059669; }
  .delta-bad { color: #dc2626; }
  .delta-neutral { color: #6b7280; }

  /* ── 개선율 프로그레스 ── */
  .progress-section {
    margin-bottom: 20px;
  }

  .progress-label {
    font-size: 9pt;
    color: #6b7280;
    margin-bottom: 4px;
  }

  .progress-bar {
    height: 12px;
    background: #e5e7eb;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 4px;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #059669);
    border-radius: 6px;
    transition: width 0.3s;
  }

  .progress-value {
    font-size: 14pt;
    font-weight: 700;
    color: #059669;
  }

  .progress-detail {
    font-size: 9pt;
    color: #9ca3af;
    margin-top: 2px;
  }

  /* ── Impact 테이블 ── */
  .impact-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    margin-bottom: 16px;
  }

  .impact-table th,
  .impact-table td {
    padding: 8px 12px;
    text-align: center;
    border-bottom: 1px solid #f3f4f6;
    font-size: 9pt;
  }

  .impact-table th {
    background: #f9fafb;
    font-weight: 600;
    color: #374151;
  }

  .impact-table td:first-child {
    text-align: left;
  }

  /* ── Impact 배지 ── */
  .impact-badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 4px;
    font-size: 8pt;
    font-weight: 700;
    color: #fff;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* ── 해결/신규 배지 ── */
  .badge-resolved {
    display: inline-block;
    background: #059669;
    color: #fff;
    font-size: 9pt;
    font-weight: 700;
    padding: 3px 14px;
    border-radius: 4px;
    margin-left: 8px;
  }

  .badge-new {
    display: inline-block;
    background: #dc2626;
    color: #fff;
    font-size: 9pt;
    font-weight: 700;
    padding: 3px 14px;
    border-radius: 4px;
    margin-left: 8px;
  }

  /* ── 위반 카드 ── */
  .violation-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    background: #fff;
  }

  .violation-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .kwcag-id {
    font-weight: 700;
    color: #1e40af;
    font-size: 10pt;
  }

  .kwcag-name {
    font-weight: 600;
    color: #374151;
    font-size: 10pt;
  }

  .violation-desc {
    font-size: 9pt;
    color: #4b5563;
    margin-top: 8px;
    line-height: 1.5;
  }

  .violation-page {
    font-size: 8pt;
    color: #9ca3af;
    margin-top: 4px;
    word-break: break-all;
  }

  /* ── 스크린샷 ── */
  .screenshot-block {
    margin: 8px 0;
  }

  .screenshot-label {
    font-size: 8pt;
    color: #6b7280;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .violation-screenshot {
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    max-height: 200px;
  }

  .violation-screenshot-container {
    position: relative;
    overflow: hidden;
    width: 100%;
  }

  .violation-screenshot img {
    display: block;
  }

  .bbox-overlay {
    position: absolute;
    border: 3px solid #ef4444;
    background: rgba(239, 68, 68, 0.12);
    pointer-events: none;
    border-radius: 2px;
  }

  /* ── 코드 스니펫 ── */
  .code-snippet {
    background: #1e293b;
    color: #e2e8f0;
    font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
    font-size: 8pt;
    padding: 10px 14px;
    border-radius: 6px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
    margin: 8px 0;
  }

  /* ── 잔여 위반 박스 ── */
  .persistent-box {
    text-align: center;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 40px 20px;
    background: #f9fafb;
  }

  .persistent-count {
    font-size: 32pt;
    font-weight: 800;
    color: #f59e0b;
    margin-bottom: 4px;
  }

  .persistent-label {
    font-size: 11pt;
    font-weight: 600;
    color: #374151;
    margin-bottom: 12px;
  }

  .persistent-note {
    font-size: 10pt;
    color: #6b7280;
  }

  /* ── 기타 ── */
  .empty-message {
    text-align: center;
    color: #9ca3af;
    padding: 30px;
    font-size: 10pt;
  }

  .extra-count {
    text-align: center;
    font-size: 9pt;
    color: #6b7280;
    padding: 10px;
    border-top: 1px dashed #e5e7eb;
    margin-top: 8px;
  }
`;
