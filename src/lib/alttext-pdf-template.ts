/**
 * 이미지 진단(alt-text) 보고서 PDF용 HTML 생성기
 * Playwright가 networkidle까지 대기하므로 <img>는 외부 URL 그대로 둔다.
 */
import type {
  AltTextAuditResult,
  AltTextJudgment,
  AltTextScanResult,
} from '@/types/alt-text';

export interface AltTextPDFOptions {
  title?: string;
  organization?: string;
  /** pass 항목도 본문에 포함할지 (기본 false — 불일치만) */
  includePass?: boolean;
}

const JUDGMENT_LABEL: Record<AltTextJudgment, string> = {
  pass: '정상',
  missing_alt: 'alt 누락',
  decorative_mismatch: '장식 오분류',
  text_mismatch: '텍스트 불일치',
  review_needed: '수동 검토 필요',
};

const JUDGMENT_BG: Record<AltTextJudgment, string> = {
  pass: '#ecfdf5',
  missing_alt: '#fef2f2',
  decorative_mismatch: '#fff7ed',
  text_mismatch: '#fef3c7',
  review_needed: '#eff6ff',
};

const JUDGMENT_FG: Record<AltTextJudgment, string> = {
  pass: '#047857',
  missing_alt: '#b91c1c',
  decorative_mismatch: '#c2410c',
  text_mismatch: '#92400e',
  review_needed: '#1d4ed8',
};

const STYLES = `
* { box-sizing: border-box; }
body {
  font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
  margin: 0;
  padding: 0;
  color: #1f2937;
  font-size: 10pt;
  line-height: 1.5;
}
.cover {
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  page-break-after: always;
}
.cover h1 { font-size: 28pt; margin: 0 0 8mm; color: #111827; }
.cover .subtitle { font-size: 14pt; color: #4b5563; margin-bottom: 12mm; }
.cover .meta { font-size: 11pt; color: #374151; line-height: 2; }
.section { padding: 10mm 0; page-break-inside: avoid; }
.section h2 { font-size: 16pt; margin: 0 0 4mm; color: #111827; border-bottom: 2px solid #2563eb; padding-bottom: 2mm; }
.section h3 { font-size: 13pt; margin: 6mm 0 3mm; color: #1f2937; }
table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
th, td { border: 1px solid #e5e7eb; padding: 2mm 3mm; text-align: left; vertical-align: top; }
th { background: #f3f4f6; font-weight: 600; }
.summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 4mm; }
.summary-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4mm; padding: 4mm; }
.summary-card .label { font-size: 9pt; color: #6b7280; }
.summary-card .value { font-size: 18pt; font-weight: 700; color: #111827; }
.judgment-counts { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2mm; margin-top: 3mm; }
.judgment-counts .chip { padding: 2mm; border-radius: 2mm; text-align: center; font-size: 9pt; }
.judgment-counts .chip .num { display: block; font-size: 14pt; font-weight: 700; }
.page-section { page-break-inside: avoid; margin-top: 6mm; padding: 4mm; border-left: 4px solid #2563eb; background: #f9fafb; }
.page-section .url { font-family: monospace; font-size: 9pt; color: #2563eb; word-break: break-all; }
.page-section .stat { font-size: 9pt; color: #6b7280; margin-top: 1mm; }
.image-card {
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 2mm;
  padding: 3mm;
  margin-top: 3mm;
  display: grid;
  grid-template-columns: 24mm 1fr;
  gap: 3mm;
  page-break-inside: avoid;
}
.image-card .thumb { width: 24mm; height: 24mm; object-fit: contain; background: #f3f4f6; border-radius: 1mm; }
.image-card .body { font-size: 9pt; }
.image-card .body .row { margin-bottom: 1mm; }
.image-card .body .label { color: #6b7280; display: inline-block; min-width: 18mm; }
.judgment-badge {
  display: inline-block;
  padding: 0.5mm 2mm;
  border-radius: 1mm;
  font-size: 8.5pt;
  font-weight: 600;
}
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCover(result: AltTextAuditResult, options: AltTextPDFOptions): string {
  const startDate = new Date(result.startTime).toLocaleString('ko-KR');
  const endDate = new Date(result.endTime).toLocaleString('ko-KR');
  return `
  <div class="cover">
    <h1>${escapeHtml(options.title || '이미지 대체텍스트 진단 보고서')}</h1>
    <div class="subtitle">${escapeHtml(options.organization || 'e-able a11y')}</div>
    <div class="meta">
      <div>대상 URL: ${result.totalUrls}개</div>
      ${result.inspector ? `<div>점검자: ${escapeHtml(result.inspector)}</div>` : ''}
      <div>심사 시작: ${escapeHtml(startDate)}</div>
      <div>심사 종료: ${escapeHtml(endDate)}</div>
      <div>심사 기준: KWCAG 2.2 § 1.1.1 적절한 대체 텍스트 제공</div>
    </div>
  </div>`;
}

function renderSummary(result: AltTextAuditResult): string {
  const c = result.countsByJudgment;
  const judgmentChip = (j: AltTextJudgment) => `
    <div class="chip" style="background:${JUDGMENT_BG[j]}; color:${JUDGMENT_FG[j]};">
      <span class="num">${c[j] ?? 0}</span>
      <span>${JUDGMENT_LABEL[j]}</span>
    </div>`;

  return `
  <div class="section">
    <h2>요약</h2>
    <div class="summary-grid">
      <div class="summary-card"><div class="label">대상 URL</div><div class="value">${result.totalUrls}</div></div>
      <div class="summary-card"><div class="label">OCR 실행 이미지</div><div class="value">${result.totalImagesScanned}</div></div>
      <div class="summary-card"><div class="label">불일치 (pass 제외)</div><div class="value">${result.totalMismatches}</div></div>
    </div>
    <h3>판정별 카운트</h3>
    <div class="judgment-counts">
      ${(['pass', 'missing_alt', 'decorative_mismatch', 'text_mismatch', 'review_needed'] as AltTextJudgment[])
        .map(judgmentChip)
        .join('')}
    </div>
    <h3>대상 URL 목록</h3>
    <table>
      <thead><tr><th style="width: 8mm;">#</th><th>URL</th></tr></thead>
      <tbody>
        ${result.targetUrls
          .map((u, i) => `<tr><td>${i + 1}</td><td style="font-family: monospace; word-break: break-all;">${escapeHtml(u)}</td></tr>`)
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function renderPageSection(scan: AltTextScanResult, includePass: boolean): string {
  const items = scan.items.filter(i => includePass || i.judgment !== 'pass');
  return `
  <div class="page-section">
    <div class="url">${escapeHtml(scan.pageUrl)}</div>
    <div class="stat">이미지 ${scan.totalImagesScanned}장 · 불일치 ${scan.mismatchCount}건</div>
    ${
      items.length === 0
        ? '<div style="margin-top: 3mm; color: #6b7280; font-size: 9pt;">표시할 항목이 없습니다.</div>'
        : items
            .map(item => {
              const altDisplay = item.currentAlt === null ? '(속성 없음)' : item.currentAlt === '' ? '(빈 alt)' : item.currentAlt;
              const sim = typeof item.similarity === 'number' ? item.similarity.toFixed(2) : '-';
              const conf = typeof item.confidenceScore === 'number' ? item.confidenceScore.toFixed(2) : '-';
              return `
              <div class="image-card">
                <img class="thumb" src="${escapeHtml(item.imageUrl)}" alt="" />
                <div class="body">
                  <div class="row">
                    <span class="judgment-badge" style="background:${JUDGMENT_BG[item.judgment]}; color:${JUDGMENT_FG[item.judgment]};">
                      ${JUDGMENT_LABEL[item.judgment]}
                    </span>
                    <span style="color: #6b7280; margin-left: 2mm; font-size: 8.5pt;">${escapeHtml(item.elementId)}</span>
                  </div>
                  <div class="row"><span class="label">현재 alt:</span> ${escapeHtml(altDisplay)}</div>
                  <div class="row"><span class="label">OCR 텍스트:</span> ${escapeHtml(item.extractedText || '(추출 없음)')}</div>
                  <div class="row"><span class="label">유사도:</span> ${sim} · <span class="label">OCR 신뢰도:</span> ${conf} · <span class="label">유형:</span> ${escapeHtml(item.imageType)}</div>
                  <div class="row"><span class="label">사유:</span> ${escapeHtml(item.reason)}</div>
                </div>
              </div>`;
            })
            .join('')
    }
  </div>`;
}

export function generateAltTextHTML(result: AltTextAuditResult, options: AltTextPDFOptions = {}): string {
  const includePass = options.includePass ?? false;
  const sections = [
    renderCover(result, options),
    renderSummary(result),
    `<div class="section"><h2>페이지별 상세 ${includePass ? '(전체)' : '(불일치만)'}</h2>${result.scans.map(s => renderPageSection(s, includePass)).join('')}</div>`,
  ];

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(options.title || '이미지 대체텍스트 진단 보고서')}</title>
  <style>${STYLES}</style>
</head>
<body>
  ${sections.join('\n')}
</body>
</html>`;
}
