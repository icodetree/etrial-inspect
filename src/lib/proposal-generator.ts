/**
 * PDF 제안서 HTML 생성기
 * AuditResult → 6페이지 A4 영업용 제안서 HTML
 */

import { AuditResult, Violation } from '@/types';

export interface ProposalInput {
  result: AuditResult;
  clientName: string;
  contactPerson?: string;
  proposalDate?: string;
}

/** Task spec alias */
export type ProposalOptions = ProposalInput;

const IMPACT_ORDER: Record<string, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

const IMPACT_LABEL: Record<string, string> = {
  critical: '심각',
  serious: '중요',
  moderate: '보통',
  minor: '경미',
};

const IMPACT_COLOR: Record<string, string> = {
  critical: '#ef4444',
  serious: '#f97316',
  moderate: '#eab308',
  minor: '#6b7280',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  } catch {
    return dateStr;
  }
}

/**
 * 준수율 계산: 위반 0개인 페이지 / totalPages * 100
 */
function calcComplianceRate(result: AuditResult): number {
  const violatedUrls = new Set(result.violations.map((v) => v.pageUrl));
  const cleanPages = result.totalPages - violatedUrls.size;
  if (result.totalPages === 0) return 0;
  return Math.round((cleanPages / result.totalPages) * 1000) / 10;
}

/**
 * 위반을 impact 순으로 정렬 후 고유 KWCAG 항목 기준 상위 N건 추출
 */
function getTopViolations(violations: Violation[], count: number) {
  // kwcagId + axeRuleId 기준으로 그룹핑
  const grouped = new Map<
    string,
    {
      kwcagId: string;
      kwcagName: string;
      impact: string;
      help: string;
      pageUrls: Set<string>;
    }
  >();

  for (const v of violations) {
    const key = `${v.kwcagId}::${v.axeRuleId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        kwcagId: v.kwcagId,
        kwcagName: v.kwcagName,
        impact: v.impact,
        help: v.help,
        pageUrls: new Set(),
      });
    }
    grouped.get(key)!.pageUrls.add(v.pageUrl);
  }

  const sorted = Array.from(grouped.values()).sort((a, b) => {
    const ia = IMPACT_ORDER[a.impact] ?? 4;
    const ib = IMPACT_ORDER[b.impact] ?? 4;
    if (ia !== ib) return ia - ib;
    return b.pageUrls.size - a.pageUrls.size;
  });

  return sorted.slice(0, count);
}

function buildStyles(): string {
  return `
    <style>
      @page {
        size: A4;
        margin: 20mm;
      }

      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }

      body {
        font-family: 'Pretendard', 'Noto Sans KR', -apple-system, BlinkMacSystemFont, sans-serif;
        color: #111827;
        font-size: 11pt;
        line-height: 1.6;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page {
        page-break-after: always;
        min-height: 247mm;
        position: relative;
        padding: 0;
      }

      .page:last-child {
        page-break-after: auto;
      }

      /* ── 표지 ── */
      .cover {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        text-align: center;
        min-height: 247mm;
      }

      .cover-logo {
        font-size: 14pt;
        font-weight: 700;
        color: #f97316;
        letter-spacing: 2px;
        margin-bottom: 60px;
      }

      .cover-title {
        font-size: 26pt;
        font-weight: 800;
        color: #111827;
        margin-bottom: 8px;
        line-height: 1.3;
      }

      .cover-subtitle {
        font-size: 13pt;
        color: #6b7280;
        margin-bottom: 60px;
      }

      .cover-meta {
        border-top: 2px solid #e5e7eb;
        padding-top: 30px;
        width: 320px;
      }

      .cover-meta-row {
        display: flex;
        justify-content: space-between;
        padding: 6px 0;
        font-size: 10.5pt;
      }

      .cover-meta-label {
        color: #6b7280;
        font-weight: 500;
      }

      .cover-meta-value {
        color: #111827;
        font-weight: 600;
      }

      /* ── 공통 ── */
      .page-title {
        font-size: 18pt;
        font-weight: 700;
        color: #111827;
        border-bottom: 3px solid #f97316;
        padding-bottom: 8px;
        margin-bottom: 24px;
      }

      .section-title {
        font-size: 13pt;
        font-weight: 700;
        color: #374151;
        margin: 20px 0 10px;
      }

      /* ── 통계 카드 ── */
      .stat-row {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
      }

      .stat-card {
        flex: 1;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 16px;
        text-align: center;
      }

      .stat-value {
        font-size: 28pt;
        font-weight: 800;
        line-height: 1.2;
      }

      .stat-label {
        font-size: 9pt;
        color: #6b7280;
        margin-top: 4px;
      }

      /* ── 바 차트 ── */
      .bar-chart {
        margin: 12px 0;
      }

      .bar-row {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }

      .bar-label {
        width: 80px;
        font-size: 9.5pt;
        font-weight: 600;
        text-align: right;
        padding-right: 10px;
        flex-shrink: 0;
      }

      .bar-track {
        flex: 1;
        height: 22px;
        background: #f3f4f6;
        border-radius: 4px;
        overflow: hidden;
        position: relative;
      }

      .bar-fill {
        height: 100%;
        border-radius: 4px;
        min-width: 2px;
      }

      .bar-count {
        width: 50px;
        font-size: 9.5pt;
        font-weight: 600;
        text-align: right;
        flex-shrink: 0;
        padding-left: 8px;
      }

      /* ── 테이블 ── */
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 9.5pt;
        margin-bottom: 16px;
      }

      th {
        background: #f3f4f6;
        font-weight: 700;
        padding: 8px 10px;
        text-align: left;
        border-bottom: 2px solid #d1d5db;
      }

      td {
        padding: 7px 10px;
        border-bottom: 1px solid #e5e7eb;
        vertical-align: top;
      }

      tr:nth-child(even) td {
        background: #fafafa;
      }

      .impact-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 8.5pt;
        font-weight: 700;
        color: #fff;
      }

      /* ── 타임라인 ── */
      .timeline {
        position: relative;
        margin: 16px 0 16px 20px;
        padding-left: 24px;
        border-left: 3px solid #e5e7eb;
      }

      .timeline-item {
        position: relative;
        margin-bottom: 28px;
      }

      .timeline-dot {
        position: absolute;
        left: -33px;
        top: 2px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 3px solid #fff;
      }

      .timeline-month {
        font-size: 12pt;
        font-weight: 700;
        margin-bottom: 4px;
      }

      .timeline-desc {
        font-size: 10pt;
        color: #4b5563;
        line-height: 1.5;
      }

      .timeline-tag {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 8.5pt;
        font-weight: 600;
        margin-right: 4px;
      }

      /* ── Page 6 ── */
      .ref-list {
        list-style: none;
        padding: 0;
      }

      .ref-list li {
        padding: 6px 0;
        border-bottom: 1px solid #f3f4f6;
        font-size: 10pt;
      }

      .ref-list li::before {
        content: '\\2713';
        color: #22c55e;
        font-weight: 700;
        margin-right: 8px;
      }

      .contact-box {
        margin-top: 32px;
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 20px 24px;
      }

      .contact-box p {
        margin: 4px 0;
        font-size: 10pt;
      }

      /* ── 비교 ── */
      .compare-bar-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
      }

      .compare-label {
        width: 120px;
        font-size: 9.5pt;
        font-weight: 600;
        text-align: right;
        flex-shrink: 0;
      }

      .compare-track {
        flex: 1;
        height: 26px;
        background: #f3f4f6;
        border-radius: 4px;
        overflow: hidden;
      }

      .compare-fill {
        height: 100%;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 8px;
        font-size: 9pt;
        font-weight: 700;
        color: #fff;
      }

      .benefit-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 16px;
      }

      .benefit-card {
        background: #f0fdf4;
        border: 1px solid #bbf7d0;
        border-radius: 8px;
        padding: 14px;
      }

      .benefit-card h4 {
        font-size: 10pt;
        font-weight: 700;
        color: #166534;
        margin-bottom: 4px;
      }

      .benefit-card p {
        font-size: 9pt;
        color: #4b5563;
        line-height: 1.4;
      }
    </style>
  `;
}

function buildPage1(input: ProposalInput): string {
  const { result, clientName, contactPerson, proposalDate } = input;
  const dateStr = proposalDate || formatDate(result.startTime);
  const url = result.pages?.[0]?.url || '';

  return `
    <div class="page cover">
      <div class="cover-logo">E-TRIBE</div>
      <h1 class="cover-title">웹 접근성 진단 보고<br>및 개선 제안서</h1>
      <p class="cover-subtitle">KWCAG 2.2 기준 자동화 진단 결과</p>
      <div class="cover-meta">
        <div class="cover-meta-row">
          <span class="cover-meta-label">대상 기관</span>
          <span class="cover-meta-value">${escapeHtml(clientName)}</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-label">대상 URL</span>
          <span class="cover-meta-value" style="font-size:9pt;word-break:break-all;">${escapeHtml(url)}</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-label">진단일</span>
          <span class="cover-meta-value">${escapeHtml(dateStr)}</span>
        </div>
        <div class="cover-meta-row">
          <span class="cover-meta-label">제출</span>
          <span class="cover-meta-value">이트라이브</span>
        </div>
        ${contactPerson ? `
        <div class="cover-meta-row">
          <span class="cover-meta-label">담당</span>
          <span class="cover-meta-value">${escapeHtml(contactPerson)}</span>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

function buildPage2(result: AuditResult): string {
  const complianceRate = calcComplianceRate(result);
  const byImpact = result.summary?.byImpact || {};
  const byPrinciple = result.summary?.byPrinciple || {};

  const impactKeys = ['critical', 'serious', 'moderate', 'minor'];
  const maxImpact = Math.max(...impactKeys.map((k) => byImpact[k] || 0), 1);

  const principleKeys = ['인식의 용이성', '운용의 용이성', '이해의 용이성', '견고성'];
  const maxPrinciple = Math.max(...principleKeys.map((k) => byPrinciple[k] || 0), 1);

  const complianceColor = complianceRate >= 70 ? '#22c55e' : complianceRate >= 40 ? '#eab308' : '#ef4444';

  return `
    <div class="page">
      <h2 class="page-title">1. 진단 결과 요약</h2>

      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-value" style="color:#374151;">${result.totalPages}</div>
          <div class="stat-label">진단 페이지 수</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:#ef4444;">${result.totalViolations}</div>
          <div class="stat-label">총 위반 건수</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${complianceColor};">${complianceRate}%</div>
          <div class="stat-label">페이지 준수율</div>
        </div>
      </div>

      <h3 class="section-title">심각도별 위반 분포</h3>
      <div class="bar-chart">
        ${impactKeys
          .map((key) => {
            const count = byImpact[key] || 0;
            const pct = Math.round((count / maxImpact) * 100);
            return `
              <div class="bar-row">
                <span class="bar-label">${IMPACT_LABEL[key] || key}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${pct}%;background:${IMPACT_COLOR[key] || '#6b7280'};"></div>
                </div>
                <span class="bar-count">${count}건</span>
              </div>
            `;
          })
          .join('')}
      </div>

      <h3 class="section-title">4대 원칙별 위반 분포</h3>
      <div class="bar-chart">
        ${principleKeys
          .map((key) => {
            const count = byPrinciple[key] || 0;
            const pct = Math.round((count / maxPrinciple) * 100);
            return `
              <div class="bar-row">
                <span class="bar-label" style="width:100px;">${key}</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${pct}%;background:#f97316;"></div>
                </div>
                <span class="bar-count">${count}건</span>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;
}

function buildPage3(violations: Violation[]): string {
  const topItems = getTopViolations(violations, 10);

  return `
    <div class="page">
      <h2 class="page-title">2. 주요 위반 항목 TOP ${topItems.length}</h2>
      <table>
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th style="width:60px;">KWCAG</th>
            <th>항목명</th>
            <th style="width:60px;">심각도</th>
            <th style="width:55px;">페이지</th>
            <th style="width:38%;">개선 포인트</th>
          </tr>
        </thead>
        <tbody>
          ${topItems
            .map((item, i) => {
              const bgColor = IMPACT_COLOR[item.impact] || '#6b7280';
              return `
                <tr>
                  <td style="text-align:center;font-weight:700;">${i + 1}</td>
                  <td style="font-weight:600;">${escapeHtml(item.kwcagId)}</td>
                  <td>${escapeHtml(item.kwcagName)}</td>
                  <td><span class="impact-badge" style="background:${bgColor};">${IMPACT_LABEL[item.impact] || item.impact}</span></td>
                  <td style="text-align:center;">${item.pageUrls.size}개</td>
                  <td style="font-size:8.5pt;color:#4b5563;">${escapeHtml(item.help)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
      ${topItems.length === 0 ? '<p style="text-align:center;color:#22c55e;font-weight:600;margin-top:40px;">위반 항목이 발견되지 않았습니다.</p>' : ''}
    </div>
  `;
}

function buildPage4(complianceRate: number): string {
  // 고정 템플릿 데이터
  const benchmarks = [
    { name: '귀사', rate: complianceRate, color: '#f97316' },
    { name: '동종업계 평균', rate: 52.3, color: '#94a3b8' },
    { name: '공공기관 평균', rate: 78.5, color: '#64748b' },
    { name: '우수 인증 기업', rate: 95.0, color: '#22c55e' },
  ];

  return `
    <div class="page">
      <h2 class="page-title">3. 경쟁사 접근성 현황 비교</h2>

      <h3 class="section-title">접근성 준수율 비교</h3>
      <div style="margin:16px 0 28px;">
        ${benchmarks
          .map((b) => {
            return `
              <div class="compare-bar-wrap">
                <span class="compare-label">${escapeHtml(b.name)}</span>
                <div class="compare-track">
                  <div class="compare-fill" style="width:${b.rate}%;background:${b.color};">${b.rate}%</div>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>

      <p style="font-size:10pt;color:#4b5563;line-height:1.6;margin-bottom:20px;">
        * 동종업계 평균 데이터는 2024년 한국웹접근성인증평가원 발표 기준 국내 민간 웹사이트 접근성 실태조사 결과를 참고한 수치입니다.
        실제 수치와 차이가 있을 수 있습니다.
      </p>

      <h3 class="section-title">웹 접근성 인증 취득 시 기대 효과</h3>
      <div class="benefit-grid">
        <div class="benefit-card">
          <h4>법적 리스크 해소</h4>
          <p>장애인차별금지법 대응, 정보통신접근성 품질인증마크 획득으로 법적 분쟁 사전 예방</p>
        </div>
        <div class="benefit-card">
          <h4>사용자 확대</h4>
          <p>고령자/장애인 포함 전체 사용자 접근성 향상으로 잠재 고객층 15~20% 확대</p>
        </div>
        <div class="benefit-card">
          <h4>공공 사업 입찰 우대</h4>
          <p>웹 접근성 인증마크 보유 기업은 공공기관 조달/입찰 시 가산점 확보 가능</p>
        </div>
        <div class="benefit-card">
          <h4>브랜드 신뢰도 상승</h4>
          <p>ESG 경영의 사회(S) 영역 실천으로 기업 이미지 및 사회적 가치 제고</p>
        </div>
      </div>
    </div>
  `;
}

function buildPage5(result: AuditResult): string {
  const byImpact = result.summary?.byImpact || {};
  const criticalSerious = (byImpact['critical'] || 0) + (byImpact['serious'] || 0);
  const moderate = byImpact['moderate'] || 0;
  const minor = byImpact['minor'] || 0;

  return `
    <div class="page">
      <h2 class="page-title">4. 3개월 개선 로드맵</h2>

      <div class="timeline">
        <div class="timeline-item">
          <div class="timeline-dot" style="background:#ef4444;"></div>
          <div class="timeline-month">1개월차 — 긴급 수정</div>
          <div class="timeline-desc">
            <span class="timeline-tag" style="background:#fee2e2;color:#991b1b;">Critical ${byImpact['critical'] || 0}건</span>
            <span class="timeline-tag" style="background:#ffedd5;color:#9a3412;">Serious ${byImpact['serious'] || 0}건</span>
            <br style="margin-bottom:6px;">
            <p style="margin-top:8px;">심각도 높은 위반 항목 ${criticalSerious}건 우선 수정. 대체 텍스트, 키보드 접근성, 명도 대비 등 핵심 항목 집중 개선.</p>
            <p style="margin-top:4px;font-size:9pt;color:#6b7280;">납품물: 1차 개선 보고서, 수정 코드 적용</p>
          </div>
        </div>

        <div class="timeline-item">
          <div class="timeline-dot" style="background:#eab308;"></div>
          <div class="timeline-month">2개월차 — 중간 우선순위 개선</div>
          <div class="timeline-desc">
            <span class="timeline-tag" style="background:#fef9c3;color:#854d0e;">Moderate ${moderate}건</span>
            <span class="timeline-tag" style="background:#f3f4f6;color:#374151;">Minor ${minor}건</span>
            <br style="margin-bottom:6px;">
            <p style="margin-top:8px;">중/저 심각도 항목 ${moderate + minor}건 개선. ARIA 속성 보완, 표 구조 개선, 링크 텍스트 명확화 등 세부 항목 수정.</p>
            <p style="margin-top:4px;font-size:9pt;color:#6b7280;">납품물: 2차 개선 보고서, 중간 점검 결과</p>
          </div>
        </div>

        <div class="timeline-item">
          <div class="timeline-dot" style="background:#22c55e;"></div>
          <div class="timeline-month">3개월차 — 최종 점검 및 인증 신청</div>
          <div class="timeline-desc">
            <p>전수 재검사 실시, 잔여 위반 항목 보완. 한국웹접근성인증평가원(WA 인증마크) 또는 과학기술정보통신부 인증 신청 지원.</p>
            <p style="margin-top:4px;font-size:9pt;color:#6b7280;">납품물: 최종 진단 보고서, 인증 신청서 작성 지원</p>
          </div>
        </div>
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-top:12px;">
        <h4 style="font-size:10.5pt;font-weight:700;color:#1e40af;margin-bottom:6px;">참고 사항</h4>
        <p style="font-size:9.5pt;color:#1e3a5f;line-height:1.5;">
          위 로드맵은 자동화 진단 결과 기준이며, 실제 수동 전수검사 시 추가 항목이 발견될 수 있습니다.
          프로젝트 착수 후 상세 일정은 협의하여 조정합니다.
        </p>
      </div>
    </div>
  `;
}

function buildPage6(): string {
  return `
    <div class="page">
      <h2 class="page-title">5. 이트라이브 소개</h2>

      <h3 class="section-title">웹 접근성 전문 기업</h3>
      <p style="font-size:10.5pt;color:#374151;line-height:1.7;margin-bottom:20px;">
        이트라이브는 웹 접근성 전문 기업으로, KWCAG 2.1/2.2 기반의 체계적인 접근성 진단과 개선 서비스를 제공합니다.
        자동화 진단 도구와 전문 컨설턴트의 수동 검수를 결합한 하이브리드 진단 방식으로 정확도 높은 진단 결과를 보장합니다.
      </p>

      <h3 class="section-title">핵심 역량</h3>
      <ul class="ref-list" style="margin-bottom:24px;">
        <li>KWCAG 2.1/2.2 전 항목 자동화 진단 시스템 자체 개발/운영</li>
        <li>AI 기반 대체 텍스트 자동 생성 및 검증 기술 보유</li>
        <li>공공기관/민간 웹사이트 접근성 인증 취득 다수 지원</li>
        <li>Playwright + axe-core 기반 정밀 크롤링 진단 엔진</li>
        <li>Notion/Excel/PDF 자동 보고서 생성 시스템</li>
      </ul>

      <h3 class="section-title">주요 수행 실적</h3>
      <ul class="ref-list" style="margin-bottom:24px;">
        <li>공공기관 웹 접근성 품질인증 컨설팅 다수 수행</li>
        <li>대기업 그룹사 웹 접근성 진단 및 개선 프로젝트</li>
        <li>금융권 모바일 앱 접근성 인증 취득 지원</li>
        <li>교육기관 LMS 플랫폼 접근성 개선 컨설팅</li>
        <li>의료/헬스케어 웹서비스 접근성 인증 지원</li>
      </ul>

      <div class="contact-box">
        <h3 style="font-size:12pt;font-weight:700;color:#f97316;margin-bottom:10px;">문의 안내</h3>
        <p><strong>이트라이브(E-Tribe)</strong></p>
        <p>웹 접근성 진단 및 인증 컨설팅</p>
        <p style="margin-top:8px;">담당자에게 연락주시면 상세한 견적과 일정을 안내해 드리겠습니다.</p>
      </div>
    </div>
  `;
}

/**
 * AuditResult를 6페이지 제안서 HTML로 변환
 */
export function generateProposalHtml(input: ProposalInput): string {
  const complianceRate = calcComplianceRate(input.result);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>웹 접근성 진단 보고 및 개선 제안서 - ${escapeHtml(input.clientName)}</title>
  ${buildStyles()}
</head>
<body>
  ${buildPage1(input)}
  ${buildPage2(input.result)}
  ${buildPage3(input.result.violations)}
  ${buildPage4(complianceRate)}
  ${buildPage5(input.result)}
  ${buildPage6()}
</body>
</html>`;
}
