/**
 * PDF 보고서 CSS 스타일 (WebWatch 접근성 심사 보고서 양식 참고)
 * A4 규격, 인쇄 최적화 타이포그래피
 */
export const PDF_REPORT_STYLES = `
  @page {
    size: A4;
    margin: 15mm 15mm 20mm 15mm;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif;
    font-size: 10pt;
    color: #222;
    line-height: 1.6;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ===== Page Break Utilities ===== */
  .page-break { page-break-before: always; }
  .avoid-break { page-break-inside: avoid; }

  /* ===== Cover Page ===== */
  .cover-page {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    text-align: center;
    padding: 40mm 20mm;
  }
  .cover-page .cover-title {
    font-size: 28pt;
    font-weight: 700;
    color: #1a365d;
    margin-bottom: 12mm;
    line-height: 1.3;
  }
  .cover-page .cover-subtitle {
    font-size: 16pt;
    color: #4a5568;
    margin-bottom: 30mm;
  }
  .cover-page .cover-info {
    font-size: 12pt;
    color: #718096;
    line-height: 2;
  }
  .cover-page .cover-date {
    font-size: 14pt;
    color: #2d3748;
    margin-top: 20mm;
    font-weight: 600;
  }
  .cover-page .cover-org {
    font-size: 11pt;
    color: #a0aec0;
    margin-top: 8mm;
  }

  /* ===== Section Headers ===== */
  .section-header {
    background: #1a365d;
    color: #fff;
    padding: 8mm 10mm;
    font-size: 18pt;
    font-weight: 700;
    margin-bottom: 8mm;
    border-radius: 2px;
  }
  .section-subheader {
    background: #edf2f7;
    color: #1a365d;
    padding: 4mm 8mm;
    font-size: 12pt;
    font-weight: 600;
    margin-bottom: 5mm;
    border-left: 4px solid #1a365d;
  }

  /* ===== Summary Section ===== */
  .summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5mm;
    margin-bottom: 8mm;
  }
  .summary-box {
    border: 1px solid #e2e8f0;
    padding: 5mm;
    border-radius: 3px;
  }
  .summary-box .label { font-size: 9pt; color: #718096; margin-bottom: 2mm; }
  .summary-box .value { font-size: 16pt; font-weight: 700; color: #2d3748; }
  .summary-box.fail .value { color: #e53e3e; }
  .summary-box.pass .value { color: #38a169; }

  .result-badge {
    display: inline-block;
    padding: 2mm 6mm;
    border-radius: 3px;
    font-size: 14pt;
    font-weight: 700;
  }
  .result-badge.pass { background: #c6f6d5; color: #22543d; }
  .result-badge.fail { background: #fed7d7; color: #822727; }

  /* ===== Tables ===== */
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 6mm;
    font-size: 9pt;
  }
  th, td {
    border: 1px solid #cbd5e0;
    padding: 2.5mm 3mm;
    text-align: left;
    vertical-align: middle;
  }
  th {
    background: #2d3748;
    color: #fff;
    font-weight: 600;
    font-size: 8.5pt;
    white-space: nowrap;
  }
  tr:nth-child(even) { background: #f7fafc; }
  tr:hover { background: #edf2f7; }

  .checklist-table th { text-align: center; }
  .checklist-table td { text-align: center; }
  .checklist-table td:first-child,
  .checklist-table th:first-child { text-align: left; }
  .checklist-table td:nth-child(2),
  .checklist-table th:nth-child(2) { text-align: left; }

  /* O/X Matrix */
  .matrix-table { font-size: 7.5pt; }
  .matrix-table th { padding: 1.5mm 2mm; font-size: 7pt; }
  .matrix-table td { padding: 1.5mm 2mm; text-align: center; }
  .matrix-table td:first-child { text-align: left; white-space: nowrap; max-width: 50mm; overflow: hidden; text-overflow: ellipsis; }
  .cell-pass { color: #38a169; font-weight: 700; }
  .cell-fail { color: #e53e3e; font-weight: 700; }
  .cell-na { color: #a0aec0; }

  /* ===== Page Detail Section ===== */
  .page-detail { margin-bottom: 10mm; }
  .page-detail-header {
    background: #1a365d;
    color: #fff;
    padding: 4mm 6mm;
    font-size: 12pt;
    font-weight: 600;
    margin-bottom: 4mm;
    border-radius: 2px;
  }
  .page-detail-url {
    font-size: 8pt;
    color: #a0aec0;
    margin-bottom: 4mm;
    word-break: break-all;
  }

  /* Screenshot */
  .screenshot-container {
    position: relative;
    max-width: 100%;
    margin-bottom: 5mm;
    border: 1px solid #e2e8f0;
    overflow: hidden;
  }
  .screenshot-container img {
    width: 100%;
    height: auto;
    display: block;
  }
  .bbox-overlay {
    position: absolute;
    border: 3px solid #e53e3e;
    background: rgba(229, 62, 62, 0.08);
    pointer-events: none;
  }

  /* ===== Violation Detail ===== */
  .violation-item {
    border: 1px solid #e2e8f0;
    border-radius: 3px;
    padding: 4mm;
    margin-bottom: 4mm;
    page-break-inside: avoid;
  }
  .violation-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2mm;
  }
  .violation-item-title {
    font-size: 10pt;
    font-weight: 600;
    color: #1a365d;
  }
  .impact-badge {
    display: inline-block;
    padding: 1mm 3mm;
    border-radius: 2px;
    font-size: 8pt;
    font-weight: 600;
    color: #fff;
  }
  .impact-critical { background: #e53e3e; }
  .impact-serious { background: #dd6b20; }
  .impact-moderate { background: #d69e2e; }
  .impact-minor { background: #718096; }

  .violation-description {
    font-size: 9pt;
    color: #4a5568;
    margin-bottom: 2mm;
  }
  .violation-code {
    background: #1a202c;
    color: #e2e8f0;
    padding: 3mm;
    border-radius: 2px;
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    font-size: 7.5pt;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 30mm;
    margin-bottom: 2mm;
  }
  .violation-help {
    font-size: 8.5pt;
    color: #38a169;
    padding: 2mm 3mm;
    background: #f0fff4;
    border-left: 3px solid #38a169;
    border-radius: 0 2px 2px 0;
  }

  /* ===== Page Principle Table (per page) ===== */
  .principle-table th { background: #4a5568; }
  .principle-result-pass { color: #38a169; font-weight: 600; }
  .principle-result-fail { color: #e53e3e; font-weight: 600; }

  /* ===== Compliance Rate Bar ===== */
  .compliance-bar-container {
    display: flex;
    align-items: center;
    gap: 3mm;
  }
  .compliance-bar {
    flex: 1;
    height: 6mm;
    background: #edf2f7;
    border-radius: 3mm;
    overflow: hidden;
  }
  .compliance-bar-fill {
    height: 100%;
    border-radius: 3mm;
    transition: width 0.3s;
  }
  .compliance-bar-fill.high { background: #38a169; }
  .compliance-bar-fill.medium { background: #d69e2e; }
  .compliance-bar-fill.low { background: #e53e3e; }
  .compliance-rate-text {
    font-size: 10pt;
    font-weight: 700;
    min-width: 12mm;
    text-align: right;
  }

  /* ===== TOC ===== */
  .toc-list { list-style: none; padding: 0; }
  .toc-item {
    display: flex;
    justify-content: space-between;
    padding: 2mm 0;
    border-bottom: 1px dotted #cbd5e0;
    font-size: 10pt;
  }
  .toc-item .toc-title { color: #2d3748; }
  .toc-item.toc-sub { padding-left: 8mm; font-size: 9pt; }

  /* ===== Footer ===== */
  .page-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 8pt;
    color: #a0aec0;
    padding: 2mm 0;
  }

  /* ===== Landscape for matrix ===== */
  .landscape-section {
    page: landscape;
  }
  @page landscape {
    size: A4 landscape;
  }
`;
