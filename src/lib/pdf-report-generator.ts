/**
 * PDF 보고서 생성기 - WebWatch 접근성 심사 보고서 양식 참고
 * AuditResult를 HTML로 변환하여 Playwright로 PDF 렌더링
 */
import { AuditResult, Violation } from '@/types';
import { KWCAG_MAPPING, KWCAGItem } from './kwcag-mapping';
import { PDF_REPORT_STYLES } from './pdf-report-styles';
import {
  imageToBase64 as imageToBase64Util,
  getPngDimensions as getPngDimensionsUtil,
  renderCroppedScreenshot,
  escapeHtml as escapeHtmlUtil,
  truncate as truncateUtil,
  formatDateKR,
} from './pdf-utils';

export interface PDFReportOptions {
  title?: string;
  organization?: string;
  targetName?: string;
  includeScreenshots?: boolean;
  includeMatrix?: boolean;
}

interface PageCompliance {
  url: string;
  title: string;
  depth1: string;
  depth2: string;
  depth3: string;
  depth4: string;
  results: Map<string, 'O' | 'X' | '-'>;
  overallPass: boolean;
}

const IMPACT_LABELS: Record<string, string> = {
  critical: '심각',
  serious: '높음',
  moderate: '보통',
  minor: '낮음',
};

const PRINCIPLE_ORDER = ['인식의 용이성', '운용의 용이성', '이해의 용이성', '견고성'];

export class PDFReportGenerator {
  private result: AuditResult;
  private options: PDFReportOptions;
  private checkableItems: KWCAGItem[];
  private imageCache: Map<string, string> = new Map();

  constructor(result: AuditResult, options: PDFReportOptions = {}) {
    this.result = result;
    this.options = {
      title: '웹 접근성 진단 보고서',
      organization: 'e-able a11y',
      includeScreenshots: true,
      includeMatrix: true,
      ...options,
    };
    // 자동화 가능한 항목만 (axeRules가 있는 항목)
    this.checkableItems = KWCAG_MAPPING.filter(item => item.axeRules.length > 0);
  }

  async generateHTML(): Promise<string> {
    // 스크린샷 사전 로드
    if (this.options.includeScreenshots) {
      await this.preloadImages();
    }

    const sections = [
      this.renderCoverPage(),
      this.renderTableOfContents(),
      this.renderSummaryPage(),
      this.renderChecklistTable(),
      this.renderPageTypeList(),
    ];

    if (this.options.includeMatrix) {
      sections.push(this.renderComplianceMatrix());
    }

    sections.push(this.renderPageDetailSections());

    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(this.options.title || '')}</title>
  <style>${PDF_REPORT_STYLES}</style>
</head>
<body>
  ${sections.join('\n')}
</body>
</html>`;
  }

  // ===== 1. 표지 =====
  private renderCoverPage(): string {
    const domain = this.getDomain();
    const startDate = this.formatDate(this.result.startTime);
    const endDate = this.formatDate(this.result.endTime);

    return `
    <div class="cover-page">
      <div class="cover-title">${this.escapeHtml(this.options.title || '웹 접근성 진단 보고서')}</div>
      <div class="cover-subtitle">${this.escapeHtml(this.options.targetName || domain)}</div>
      <div class="cover-info">
        <div>심사 대상: ${this.escapeHtml(domain)}</div>
        <div>심사 기간: ${startDate} ~ ${endDate}</div>
        <div>심사 기준: KWCAG 2.2 (한국형 웹 콘텐츠 접근성 지침 2.2)</div>
        <div>총 검사 페이지: ${this.result.totalPages}개</div>
      </div>
      <div class="cover-date">${endDate}</div>
      <div class="cover-org">${this.escapeHtml(this.options.organization || '')}</div>
    </div>`;
  }

  // ===== 2. 목차 =====
  private renderTableOfContents(): string {
    const pages = this.getUniquePages();
    return `
    <div class="page-break">
      <div class="section-header">목 차</div>
      <ul class="toc-list">
        <li class="toc-item"><span class="toc-title">1. 종합 평가결과 및 분석</span></li>
        <li class="toc-item toc-sub"><span class="toc-title">검사 항목별 평가 결과</span></li>
        <li class="toc-item"><span class="toc-title">2. 평가 유형</span></li>
        ${this.options.includeMatrix ? '<li class="toc-item toc-sub"><span class="toc-title">유형별 평가 결과 (O/X 매트릭스)</span></li>' : ''}
        <li class="toc-item"><span class="toc-title">3. 페이지별 심사결과</span></li>
        ${pages.map((p, i) => `<li class="toc-item toc-sub"><span class="toc-title">${i} ${this.escapeHtml(p.title || p.url)}</span></li>`).join('\n')}
      </ul>
    </div>`;
  }

  // ===== 3. 종합 평가결과 =====
  private renderSummaryPage(): string {
    const compliance = this.getOverallCompliance();
    const passCount = compliance.passItems;
    const totalItems = compliance.totalItems;
    const rate = compliance.rate;
    const rateClass = rate >= 90 ? 'high' : rate >= 70 ? 'medium' : 'low';

    return `
    <div class="page-break">
      <div class="section-header">1. 종합 평가결과 및 분석</div>

      <div class="section-subheader">심사 대상 정보</div>
      <table>
        <tr><th style="width:30%">심사 대상</th><td>${this.escapeHtml(this.getDomain())}</td></tr>
        <tr><th>심사 기간</th><td>${this.formatDate(this.result.startTime)} ~ ${this.formatDate(this.result.endTime)}</td></tr>
        <tr><th>심사 기준</th><td>KWCAG 2.2 (한국형 웹 콘텐츠 접근성 지침 2.2)</td></tr>
      </table>

      <div class="section-subheader">심사 결과</div>
      <div class="summary-grid">
        <div class="summary-box">
          <div class="label">총 페이지 수</div>
          <div class="value">${this.result.totalPages}</div>
        </div>
        <div class="summary-box fail">
          <div class="label">총 오류 수</div>
          <div class="value">${this.result.totalViolations}</div>
        </div>
        <div class="summary-box">
          <div class="label">준수 항목 수</div>
          <div class="value">${passCount} / ${totalItems}</div>
        </div>
        <div class="summary-box ${rate >= 90 ? 'pass' : 'fail'}">
          <div class="label">준수율</div>
          <div class="value">${rate.toFixed(1)}%</div>
        </div>
      </div>

      <div class="compliance-bar-container" style="margin-bottom: 8mm;">
        <span style="font-size: 9pt; color: #718096;">준수율</span>
        <div class="compliance-bar">
          <div class="compliance-bar-fill ${rateClass}" style="width: ${rate}%;"></div>
        </div>
        <span class="compliance-rate-text">${rate.toFixed(1)}%</span>
      </div>

      ${this.renderChecklistTable()}
    </div>`;
  }

  // ===== 4. 검사항목별 평가 결과 =====
  private renderChecklistTable(): string {
    const itemResults = this.getChecklistResults();

    let rows = '';
    let currentPrinciple = '';

    for (const item of itemResults) {
      if (item.principle !== currentPrinciple) {
        currentPrinciple = item.principle;
        rows += `<tr><td colspan="5" style="background:#edf2f7; font-weight:600; color:#1a365d;">${this.escapeHtml(currentPrinciple)}</td></tr>`;
      }

      const passPages = item.passPages;
      const totalPages = item.totalPages;
      const rate = totalPages > 0 ? (passPages / totalPages * 100) : 100;
      const resultText = item.violationCount === 0 ? '준수' : '미준수';
      const resultClass = item.violationCount === 0 ? 'principle-result-pass' : 'principle-result-fail';

      rows += `
        <tr class="avoid-break">
          <td>${this.escapeHtml(item.id)}</td>
          <td>${this.escapeHtml(item.name)}</td>
          <td style="text-align:center">${passPages} / ${totalPages}</td>
          <td style="text-align:center">${rate.toFixed(0)}%</td>
          <td style="text-align:center" class="${resultClass}">${resultText}</td>
        </tr>`;
    }

    return `
      <div class="section-subheader">검사 항목별 평가 결과</div>
      <table class="checklist-table">
        <thead>
          <tr>
            <th style="width:12%">항목 ID</th>
            <th style="width:35%">검사 항목</th>
            <th style="width:18%">준수 페이지</th>
            <th style="width:15%">준수율</th>
            <th style="width:20%">결과</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  // ===== 5. 평가 유형 (페이지 목록) =====
  private renderPageTypeList(): string {
    const pages = this.getUniquePages();

    const rows = pages.map((p, i) => `
      <tr>
        <td>${i}</td>
        <td>${this.escapeHtml(p.title || '(제목 없음)')}</td>
        <td style="font-size:8pt; word-break:break-all;">${this.escapeHtml(this.getPagePath(p.url))}</td>
      </tr>
    `).join('');

    return `
    <div class="page-break">
      <div class="section-header">2. 평가 유형</div>
      <table>
        <thead>
          <tr>
            <th style="width:8%">N</th>
            <th style="width:35%">유 형</th>
            <th style="width:57%">경 로</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  // ===== 6. O/X 매트릭스 =====
  private renderComplianceMatrix(): string {
    const pageCompliances = this.getPageCompliances();
    const items = this.checkableItems;

    // 헤더: 항목 번호
    const headerCells = items.map((item, i) => `<th>${i + 1}</th>`).join('');

    // 행: 각 페이지
    const rows = pageCompliances.map((pc, idx) => {
      const cells = items.map(item => {
        const r = pc.results.get(item.id) || '-';
        const cls = r === 'O' ? 'cell-pass' : r === 'X' ? 'cell-fail' : 'cell-na';
        return `<td class="${cls}">${r}</td>`;
      }).join('');

      const overallCls = pc.overallPass ? 'cell-pass' : 'cell-fail';
      const overallText = pc.overallPass ? 'O' : 'X';

      return `<tr><td>${idx}. ${this.escapeHtml(this.truncate(pc.title || pc.url, 25))}</td>${cells}<td class="${overallCls}">${overallText}</td></tr>`;
    }).join('');

    // 항목 범례
    const legend = items.map((item, i) => `<tr><td>${i + 1}</td><td>${this.escapeHtml(item.id)}</td><td>${this.escapeHtml(item.checkItem)}</td></tr>`).join('');

    return `
    <div class="page-break">
      <div class="section-subheader">유형별 평가 결과</div>
      <table class="matrix-table">
        <thead>
          <tr><th>유형 \\ 항목</th>${headerCells}<th>결과</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="margin-top: 5mm;">
        <div style="font-size: 8pt; color: #718096; margin-bottom: 2mm;">※ 항목 번호 범례:</div>
        <table style="font-size: 7.5pt;">
          <thead><tr><th>번호</th><th>ID</th><th>검사 항목</th></tr></thead>
          <tbody>${legend}</tbody>
        </table>
      </div>
    </div>`;
  }

  // ===== 7. 페이지별 심사결과 (불합격 페이지만) =====
  private renderPageDetailSections(): string {
    const pages = this.getUniquePages();
    const violationsByPage = this.getViolationsByPage();

    // 불합격 페이지만 필터
    const failedPages = pages.filter(page => (violationsByPage.get(page.url) || []).length > 0);

    const sections = failedPages.map((page, idx) => {
      const pageViolations = violationsByPage.get(page.url) || [];

      // 원칙별 결과 테이블
      const principleRows = this.renderPrincipleResults(pageViolations);

      // 위반 상세 (각 violation에 크롭 스크린샷 포함)
      const violationDetails = pageViolations.map(v => this.renderViolationItem(v)).join('');

      return `
      <div class="page-break page-detail">
        <div class="page-detail-header">${idx + 1}. '${this.escapeHtml(page.title || '(제목 없음)')}' 페이지 심사 결과</div>
        <div class="page-detail-url">${this.escapeHtml(page.url)}</div>

        <div style="margin-bottom: 4mm;">
          <strong>심사 결과: </strong><span class="result-badge fail">불합격</span>
          <span style="font-size:9pt; color:#718096; margin-left:3mm;">오류 ${pageViolations.length}건</span>
        </div>

        <div class="section-subheader">미준수 항목</div>
        <table class="principle-table">
          <thead>
            <tr><th style="width:12%">항목 ID</th><th style="width:55%">검사 항목</th><th style="width:33%">결과</th></tr>
          </thead>
          <tbody>${principleRows}</tbody>
        </table>

        <div class="section-subheader">항목별 주요 오류</div>
        ${violationDetails}
      </div>`;
    });

    return `<div class="page-break"><div class="section-header">3. 페이지별 심사결과</div></div>${sections.join('')}`;
  }

  // ===== Helper: 원칙별 결과 행 (미준수 항목만 표시) =====
  private renderPrincipleResults(pageViolations: Violation[]): string {
    const violatedKwcagIds = new Set(pageViolations.map(v => v.kwcagId));
    let rows = '';
    let currentPrinciple = '';

    for (const item of this.checkableItems) {
      const isFail = violatedKwcagIds.has(item.id);
      if (!isFail) continue; // 합격 항목은 건너뜀

      if (item.principle !== currentPrinciple) {
        currentPrinciple = item.principle;
        rows += `<tr><td colspan="3" style="background:#edf2f7; font-weight:600; color:#1a365d;">${this.escapeHtml(currentPrinciple)}</td></tr>`;
      }

      rows += `<tr><td>${this.escapeHtml(item.id)}</td><td>${this.escapeHtml(item.checkItem)}</td><td class="principle-result-fail">X (불합격)</td></tr>`;
    }
    return rows;
  }

  // ===== Helper: 위반 항목 렌더링 (크롭 스크린샷 포함) =====
  private renderViolationItem(v: Violation): string {
    const impactClass = `impact-${v.impact}`;
    const impactLabel = IMPACT_LABELS[v.impact] || v.impact;
    const codeSnippet = this.truncate(v.affectedCode, 500);

    // 크롭 스크린샷 렌더링
    const screenshotHtml = this.renderViolationScreenshot(v);

    return `
    <div class="violation-item">
      <div class="violation-item-header">
        <span class="violation-item-title">${this.escapeHtml(v.kwcagId)} ${this.escapeHtml(v.kwcagName)}</span>
        <span class="impact-badge ${impactClass}">${this.escapeHtml(impactLabel)}</span>
      </div>
      ${screenshotHtml}
      <div class="violation-description">${this.escapeHtml(v.description)}</div>
      <div class="violation-code">${this.escapeHtml(codeSnippet)}</div>
      <div class="violation-help">💡 <strong>해결방안:</strong> ${this.escapeHtml(v.help)}</div>
    </div>`;
  }

  // ===== Helper: 위반 항목별 크롭 스크린샷 =====
  private renderViolationScreenshot(v: Violation): string {
    if (!this.options.includeScreenshots || !v.screenshotPath || !v.boundingBox) return '';

    const base64 = this.imageCache.get(v.screenshotPath);
    if (!base64) return '';

    const dims = this.getPngDimensions(base64);
    if (!dims) return '';

    return renderCroppedScreenshot(base64, v.boundingBox, dims);
  }

  // ===== Helper: 스크린샷 렌더링 =====
  private renderPageScreenshot(pageUrl: string, violations: Violation[]): string {
    if (!this.options.includeScreenshots) return '';

    // 해당 페이지의 첫 스크린샷 경로 찾기
    const screenshotViolation = violations.find(v => v.screenshotPath);
    if (!screenshotViolation?.screenshotPath) return '';

    const base64 = this.imageCache.get(screenshotViolation.screenshotPath);
    if (!base64) return '';

    // PNG 원본 크기 추출 (IHDR 청크: offset 16~23)
    const imgDimensions = this.getPngDimensions(base64);
    if (!imgDimensions) return '';

    const { width: naturalWidth, height: naturalHeight } = imgDimensions;

    // bounding box 오버레이 — 퍼센트 기반 위치 (JS 불필요, PDF 렌더링에서도 정확)
    const bboxOverlays = violations
      .filter(v => v.boundingBox)
      .map(v => {
        const bb = v.boundingBox!;
        const leftPct = (bb.x / naturalWidth * 100).toFixed(4);
        const topPct = (bb.y / naturalHeight * 100).toFixed(4);
        const widthPct = (bb.width / naturalWidth * 100).toFixed(4);
        const heightPct = (bb.height / naturalHeight * 100).toFixed(4);
        return `<div class="bbox-overlay" style="left:${leftPct}%; top:${topPct}%; width:${widthPct}%; height:${heightPct}%;" title="${this.escapeHtml(v.kwcagId)}"></div>`;
      })
      .slice(0, 10) // 너무 많으면 10개까지만
      .join('');

    // 스크린샷 높이를 A4 한 페이지에 맞게 제한 (헤더 영역 ~40mm 감안)
    return `
    <div class="screenshot-section">
      <div class="screenshot-container">
        <img src="data:image/png;base64,${base64}" alt="페이지 스크린샷" />
        ${bboxOverlays}
      </div>
    </div>`;
  }

  /** PNG 바이너리에서 이미지 크기 추출 (IHDR 청크) */
  private getPngDimensions(base64Data: string): { width: number; height: number } | null {
    return getPngDimensionsUtil(base64Data);
  }

  // ===== 데이터 처리 헬퍼 =====

  private getUniquePages(): { url: string; title: string; depth1: string; depth2: string; depth3: string; depth4: string }[] {
    if (this.result.pages && this.result.pages.length > 0) {
      return this.result.pages.map(p => ({
        url: p.url,
        title: p.title,
        depth1: p.depth1,
        depth2: p.depth2,
        depth3: p.depth3,
        depth4: p.depth4,
      }));
    }
    // pages가 없으면 violations에서 추출
    const seen = new Set<string>();
    const pages: { url: string; title: string; depth1: string; depth2: string; depth3: string; depth4: string }[] = [];
    for (const v of this.result.violations) {
      if (!seen.has(v.pageUrl)) {
        seen.add(v.pageUrl);
        pages.push({
          url: v.pageUrl,
          title: v.pageTitle,
          depth1: v.depth1,
          depth2: v.depth2,
          depth3: v.depth3,
          depth4: v.depth4,
        });
      }
    }
    return pages;
  }

  private getViolationsByPage(): Map<string, Violation[]> {
    const map = new Map<string, Violation[]>();
    for (const v of this.result.violations) {
      const list = map.get(v.pageUrl) || [];
      list.push(v);
      map.set(v.pageUrl, list);
    }
    return map;
  }

  private getChecklistResults(): Array<{
    id: string;
    name: string;
    principle: string;
    violationCount: number;
    passPages: number;
    totalPages: number;
  }> {
    const totalPages = this.result.totalPages || this.getUniquePages().length;
    const violationsByItem = new Map<string, Set<string>>();

    for (const v of this.result.violations) {
      const pages = violationsByItem.get(v.kwcagId) || new Set();
      pages.add(v.pageUrl);
      violationsByItem.set(v.kwcagId, pages);
    }

    return this.checkableItems.map(item => {
      const violatedPages = violationsByItem.get(item.id);
      const violationPageCount = violatedPages ? violatedPages.size : 0;

      return {
        id: item.id,
        name: item.checkItem,
        principle: item.principle,
        violationCount: violationPageCount,
        passPages: totalPages - violationPageCount,
        totalPages: totalPages,
      };
    });
  }

  private getOverallCompliance(): { passItems: number; totalItems: number; rate: number } {
    const results = this.getChecklistResults();
    const passItems = results.filter(r => r.violationCount === 0).length;
    const totalItems = results.length;
    const rate = totalItems > 0 ? (passItems / totalItems) * 100 : 100;
    return { passItems, totalItems, rate };
  }

  private getPageCompliances(): PageCompliance[] {
    const pages = this.getUniquePages();
    const violationsByPage = this.getViolationsByPage();

    return pages.map(page => {
      const pageViolations = violationsByPage.get(page.url) || [];
      const violatedKwcagIds = new Set(pageViolations.map(v => v.kwcagId));

      const results = new Map<string, 'O' | 'X' | '-'>();
      for (const item of this.checkableItems) {
        results.set(item.id, violatedKwcagIds.has(item.id) ? 'X' : 'O');
      }

      const overallPass = pageViolations.length === 0;

      return {
        url: page.url,
        title: page.title,
        depth1: page.depth1,
        depth2: page.depth2,
        depth3: page.depth3,
        depth4: page.depth4,
        results,
        overallPass,
      };
    });
  }

  private getPageComplianceDetail(pageUrl: string): { pass: number; total: number } {
    const pageViolations = this.result.violations.filter(v => v.pageUrl === pageUrl);
    const violatedKwcagIds = new Set(pageViolations.map(v => v.kwcagId));
    const total = this.checkableItems.length;
    const fail = this.checkableItems.filter(item => violatedKwcagIds.has(item.id)).length;
    return { pass: total - fail, total };
  }

  // ===== 이미지 처리 =====

  private async preloadImages(): Promise<void> {
    const screenshotPaths = new Set<string>();

    for (const v of this.result.violations) {
      if (v.screenshotPath) {
        screenshotPaths.add(v.screenshotPath);
      }
    }

    for (const sp of screenshotPaths) {
      try {
        const base64 = await this.imageToBase64(sp);
        if (base64) {
          this.imageCache.set(sp, base64);
        }
      } catch {
        // 스크린샷 로드 실패는 무시
      }
    }
  }

  private async imageToBase64(screenshotPath: string): Promise<string | null> {
    return imageToBase64Util(screenshotPath, this.result.screenshotUrl);
  }

  // ===== 유틸리티 =====

  private getDomain(): string {
    try {
      const firstPage = this.result.pages?.[0]?.url || this.result.violations?.[0]?.pageUrl;
      if (firstPage) {
        return new URL(firstPage).hostname;
      }
    } catch { /* ignore */ }
    return '(알 수 없음)';
  }

  private getPagePath(url: string): string {
    try {
      const u = new URL(url);
      return u.pathname + u.search;
    } catch {
      return url;
    }
  }

  private formatDate(dateStr: string): string {
    return formatDateKR(dateStr);
  }

  private escapeHtml(str: string | undefined | null): string {
    return escapeHtmlUtil(str);
  }

  private truncate(str: string | undefined | null, maxLen: number): string {
    return truncateUtil(str, maxLen);
  }
}
