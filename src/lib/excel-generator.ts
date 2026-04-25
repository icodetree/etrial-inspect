import ExcelJS from 'exceljs';
import { Violation, PageInfo, AuditResult } from '@/types';
import type { SEOAuditResult } from '@/types/seo';
import type { AltTextAuditResult, AltTextMismatch } from '@/types/alt-text';

export interface ExcelGeneratorOptions {
  includeViolations: boolean;
  platform: string;
  inspector: string;
}

export class ExcelGenerator {
  private options: ExcelGeneratorOptions;

  constructor(options: ExcelGeneratorOptions) {
    this.options = options;
  }

  // IA 모드: 기본 엑셀 생성 (1~4뎁스, 페이지명, URL)
  async generateIAReport(pages: PageInfo[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('IA 구조');

    // 헤더 설정
    worksheet.columns = [
      { header: '1뎁스', key: 'depth1', width: 20 },
      { header: '2뎁스', key: 'depth2', width: 20 },
      { header: '3뎁스', key: 'depth3', width: 20 },
      { header: '4뎁스', key: 'depth4', width: 20 },
      { header: '페이지명', key: 'title', width: 40 },
      { header: 'URL', key: 'url', width: 60 },
    ];

    // 헤더 스타일링
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // 데이터 추가
    pages.forEach((page) => {
      worksheet.addRow({
        depth1: page.depth1,
        depth2: page.depth2,
        depth3: page.depth3,
        depth4: page.depth4,
        title: page.title,
        url: page.url,
      });
    });

    // 필터 적용
    worksheet.autoFilter = {
      from: 'A1',
      to: 'F1',
    };

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * 진단 리포트 생성 (접근성 전용 또는 통합)
   */
  async generateAuditReport(result: AuditResult): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // 1. 접근성 진단 결과 시트
    this.addAccessibilitySheet(workbook, result.violations);

    // 2. 요약 시트
    this.addSummarySheet(workbook, result);

    // 3. IA 구조 시트
    this.addIASheet(workbook, result.pages);

    // 4. SEO/AI 결과가 있으면 추가
    if (result.seoResult) {
      this.addSEOAnalysisSheet(workbook, result.seoResult);
      this.addAIOptimizationSheet(workbook, result.seoResult);
      this.addSEOScoreSheet(workbook, result.seoResult);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * 접근성 진단 결과 시트 추가 (private)
   */
  private addAccessibilitySheet(workbook: ExcelJS.Workbook, violations: Violation[]): void {
    const auditSheet = workbook.addWorksheet('접근성 진단 결과');
    auditSheet.columns = [
      { header: '1뎁스', key: 'depth1', width: 15 },
      { header: '2뎁스', key: 'depth2', width: 15 },
      { header: '3뎁스', key: 'depth3', width: 15 },
      { header: '4뎁스', key: 'depth4', width: 15 },
      { header: '페이지명', key: 'pageTitle', width: 30 },
      { header: 'URL', key: 'pageUrl', width: 50 },
      { header: '플랫폼', key: 'platform', width: 10 },
      { header: '점검자', key: 'inspector', width: 15 },
      { header: '점검일', key: 'inspectionDate', width: 15 },
      { header: '번호', key: 'violationNumber', width: 8 },
      { header: '지침명', key: 'kwcagName', width: 25 },
      { header: '영향도', key: 'impactKo', width: 12 },
      { header: '오류내용', key: 'description', width: 50 },
      { header: '영향받는 요소 코드', key: 'affectedCode', width: 60 },
      { header: '해결방안', key: 'help', width: 50 },
    ];

    const headerRow = auditSheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2E7D32' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const kwcagIdMap: Record<string, number> = {
      '1.1.1': 1, '1.2.1': 2, '1.3.2': 3, '1.3.1': 4,
      '1.4.2': 6, '1.4.3': 7, '1.4.1': 8, '1.4.4': 9,
      '2.1.1': 10, '2.1.2': 11, '2.1.3': 12, '2.1.4': 13,
      '2.2.1': 14, '2.2.2': 15, '2.3.1': 16, '2.4.1': 17,
      '2.4.2': 18, '2.4.3': 19, '2.4.4': 20, '2.5.1': 21,
      '2.5.2': 22, '2.5.3': 23, '2.5.4': 24, '3.1.1': 25,
      '3.2.1': 26, '3.4.1': 28, '3.4.2': 29, '3.4.3': 30,
      '3.4.4': 31, '4.1.1': 32, '4.1.2': 33,
    };

    violations.forEach((violation) => {
      const mappedNumber = kwcagIdMap[violation.kwcagId] || '-';
      const impactKo = {
        critical: '치명적',
        serious: '중요',
        moderate: '보통',
        minor: '낮음',
      }[violation.impact] || violation.impact;

      const row = auditSheet.addRow({
        depth1: violation.depth1,
        depth2: violation.depth2,
        depth3: violation.depth3,
        depth4: violation.depth4,
        pageTitle: violation.pageTitle,
        pageUrl: violation.pageUrl,
        platform: violation.platform,
        inspector: violation.inspector,
        inspectionDate: violation.inspectionDate,
        violationNumber: mappedNumber,
        kwcagName: `${violation.kwcagId} ${violation.kwcagName}`,
        impactKo: impactKo,
        description: violation.description,
        affectedCode: violation.affectedCode,
        help: violation.help,
      });

      const impactColors: Record<string, string> = {
        critical: 'FFFF0000',
        serious: 'FFFF6600',
        moderate: 'FFFFCC00',
        minor: 'FF99CC00',
      };

      if (violation.impact && impactColors[violation.impact]) {
        row.getCell('kwcagName').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: impactColors[violation.impact] },
        };
      }
    });

    auditSheet.autoFilter = { from: 'A1', to: 'N1' };
  }

  /**
   * 요약 시트 추가 (private)
   */
  private addSummarySheet(workbook: ExcelJS.Workbook, result: AuditResult): void {
    const summarySheet = workbook.addWorksheet('요약');
    summarySheet.columns = [
      { header: '항목', key: 'item', width: 30 },
      { header: '값', key: 'value', width: 20 },
    ];

    summarySheet.addRow({ item: '진단 시작 시간', value: result.startTime });
    summarySheet.addRow({ item: '진단 종료 시간', value: result.endTime });
    summarySheet.addRow({ item: '총 페이지 수', value: result.totalPages });
    summarySheet.addRow({ item: '총 위반 사항', value: result.totalViolations });
    summarySheet.addRow({ item: '', value: '' });
    summarySheet.addRow({ item: '--- 원칙별 위반 ---', value: '' });

    Object.entries(result.summary?.byPrinciple || {}).forEach(([principle, count]) => {
      summarySheet.addRow({ item: principle, value: count });
    });

    summarySheet.addRow({ item: '', value: '' });
    summarySheet.addRow({ item: '--- 영향도별 위반 ---', value: '' });

    const impactLabels: Record<string, string> = {
      critical: '심각',
      serious: '높음',
      moderate: '보통',
      minor: '낮음',
    };

    Object.entries(result.summary?.byImpact || {}).forEach(([impact, count]) => {
      summarySheet.addRow({ item: impactLabels[impact] || impact, value: count });
    });
  }

  /**
   * IA 구조 시트 추가 (private)
   */
  private addIASheet(workbook: ExcelJS.Workbook, pages: PageInfo[]): void {
    const iaSheet = workbook.addWorksheet('IA 구조');
    iaSheet.columns = [
      { header: '1뎁스', key: 'depth1', width: 20 },
      { header: '2뎁스', key: 'depth2', width: 20 },
      { header: '3뎁스', key: 'depth3', width: 20 },
      { header: '4뎁스', key: 'depth4', width: 20 },
      { header: '페이지명', key: 'title', width: 40 },
      { header: 'URL', key: 'url', width: 60 },
    ];

    pages.forEach((page) => {
      iaSheet.addRow({
        depth1: page.depth1,
        depth2: page.depth2,
        depth3: page.depth3,
        depth4: page.depth4,
        title: page.title,
        url: page.url,
      });
    });
  }

  /**
   * SEO/AI 통합 리포트 생성 (신규)
   * @param seoResult SEO/AI 진단 결과
   * @returns Excel 파일 버퍼
   */
  async generateSEOReport(seoResult: SEOAuditResult): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    // 1. SEO 분석 시트
    this.addSEOAnalysisSheet(workbook, seoResult);

    // 2. AI 최적화 시트
    this.addAIOptimizationSheet(workbook, seoResult);

    // 3. 종합 점수 시트
    this.addSEOScoreSheet(workbook, seoResult);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * SEO 분석 시트 추가 (private) - SOYOYU 구조 기반
   */
  private addSEOAnalysisSheet(workbook: ExcelJS.Workbook, result: SEOAuditResult): void {
    const sheet = workbook.addWorksheet('SEO 분석');

    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'SEO 분석 리포트';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    sheet.getCell('A2').value = '진단 URL:';
    sheet.getCell('B2').value = result.url || '-';
    sheet.getCell('A3').value = '진단 일시:';
    const timestamp = result.timestamp ? new Date(result.timestamp) : new Date();
    sheet.getCell('B3').value = timestamp.toLocaleString('ko-KR');

    // 카테고리별 점수 요약
    const cats = result.categories;
    if (!cats) {
      sheet.getCell('A5').value = 'SEO 분석 데이터 없음';
      return;
    }

    sheet.getCell('A5').value = '1. 메타 태그';
    sheet.getCell('A5').font = { size: 14, bold: true };

    const meta = cats.meta?.data;
    const metaRows = [
      ['항목', '상태', '상세'],
      ['Title', meta?.title?.exists ? 'O' : 'X', meta?.title?.text || '없음'],
      ['Description', meta?.description?.exists ? 'O' : 'X', `${meta?.description?.length || 0}자`],
      ['Canonical', meta?.canonical?.exists ? 'O' : 'X', meta?.canonical?.href || '미설정'],
      ['Viewport', meta?.viewport?.exists ? 'O' : 'X', meta?.viewport?.content || '없음'],
      ['Charset', meta?.charset?.exists ? 'O' : 'X', meta?.charset?.value || '없음'],
      ['점수', '', `${cats.meta?.score ?? 0}/100`],
    ];

    let row = 6;
    metaRows.forEach((data, idx) => {
      sheet.getRow(row).values = data;
      if (idx === 0) {
        sheet.getRow(row).font = { bold: true };
        sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      }
      row++;
    });

    // 2. 헤딩 구조
    row += 1;
    sheet.getCell(`A${row}`).value = '2. 헤딩 구조';
    sheet.getCell(`A${row}`).font = { size: 14, bold: true };
    row++;
    const hd = cats.heading?.data;
    const headingRows = [
      ['태그', '개수', '내용'],
      ['H1', String(hd?.counts?.h1 || 0), hd?.h1Text || '-'],
      ['H2', String(hd?.counts?.h2 || 0), ''],
      ['H3', String(hd?.counts?.h3 || 0), ''],
      ['점수', '', `${cats.heading?.score ?? 0}/100`],
    ];
    headingRows.forEach((data, idx) => {
      sheet.getRow(row).values = data;
      if (idx === 0) { sheet.getRow(row).font = { bold: true }; sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; }
      row++;
    });

    // 3. 이미지
    row += 1;
    sheet.getCell(`A${row}`).value = '3. 이미지';
    sheet.getCell(`A${row}`).font = { size: 14, bold: true };
    row++;
    const imgStats = cats.image?.data?.stats;
    const imgRows = [
      ['항목', '값', ''],
      ['전체', String(cats.image?.data?.total || 0), ''],
      ['alt 누락', String(imgStats?.missingAlt || 0), ''],
      ['크기 미지정', String(imgStats?.missingDimensions || 0), ''],
      ['점수', '', `${cats.image?.score ?? 0}/100`],
    ];
    imgRows.forEach((data, idx) => {
      sheet.getRow(row).values = data;
      if (idx === 0) { sheet.getRow(row).font = { bold: true }; sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; }
      row++;
    });

    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 20;
    sheet.getColumn('C').width = 40;
    sheet.getColumn('D').width = 20;
  }

  /**
   * AI 최적화 시트 추가 (private) - SOYOYU 구조 기반
   */
  private addAIOptimizationSheet(workbook: ExcelJS.Workbook, result: SEOAuditResult): void {
    const sheet = workbook.addWorksheet('AI 최적화');

    sheet.mergeCells('A1:C1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'AI 친화도 분석 (GEO)';
    titleCell.font = { size: 16, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    const geo = result.categories?.geo?.data;
    const llms = geo?.llmsTxt;

    sheet.getCell('A3').value = 'llms.txt 파일 분석';
    sheet.getCell('A3').font = { size: 14, bold: true };

    const llmsRows = [
      ['항목', '상태/값'],
      ['파일 존재', llms?.exists ? 'O 존재' : 'X 없음'],
      ['H1 헤더', llms?.structure?.hasH1 ? 'O' : 'X'],
      ['H2 헤더', llms?.structure?.hasH2 ? 'O' : 'X'],
      ['H3 헤더', llms?.structure?.hasH3 ? 'O' : 'X'],
      ['총 단어 수', (llms?.structure?.wordCount || 0) + '개 (권장: 100~500개)'],
      ['단락 수', (llms?.structure?.paragraphCount || 0) + '개'],
      ['', ''],
      ['품질 평가', ''],
      ['상단 요약', llms?.contentQuality?.hasSummary ? 'O 있음' : 'X 없음'],
      ['키워드 밀도', llms?.contentQuality?.hasKeywords ? 'O 충분' : '! 부족'],
      ['연락처 정보', llms?.contentQuality?.hasContactInfo ? 'O 포함' : 'X 없음'],
      ['URL 선언', llms?.contentQuality?.hasUrlDeclarations ? 'O 포함' : 'X 없음'],
      ['소셜 링크', llms?.contentQuality?.hasSocialLinks ? 'O 포함' : 'X 없음'],
      ['H2 섹션 수', (llms?.contentQuality?.sectionCount || 0) + '개 (권장: 3개 이상)'],
      ['구조 점수', (llms?.contentQuality?.structureScore || 0) + '/60'],
      ['가독성 점수', (llms?.contentQuality?.readabilityScore || 0) + '/10'],
      ['', ''],
      ['AI 크롤러', ''],
      ['GPTBot', geo?.robotsAiCrawlers?.gptBot ? 'O 허용' : 'X 차단'],
      ['ClaudeBot', geo?.robotsAiCrawlers?.claudeBot ? 'O 허용' : 'X 차단'],
      ['GoogleBot', geo?.robotsAiCrawlers?.googleBot ? 'O 허용' : 'X 차단'],
      ['BingBot', geo?.robotsAiCrawlers?.bingBot ? 'O 허용' : 'X 차단'],
      ['', ''],
      ['종합 점수', (geo?.score || 0) + '/100'],
    ];

    let row = 4;
    llmsRows.forEach((data, idx) => {
      sheet.getRow(row).values = data;
      if (idx === 0 || idx === 8 || idx === 14 || idx === 20) {
        sheet.getRow(row).font = { bold: true };
        sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE599' } };
      }
      row++;
    });

    // llms.txt 제안
    if (llms && !llms.exists && llms.suggestedContent) {
      row += 2;
      sheet.getCell(`A${row}`).value = '추천: llms.txt 파일 생성 템플릿';
      sheet.getCell(`A${row}`).font = { size: 13, bold: true, color: { argb: 'FFFF0000' } };
      row++;

      sheet.mergeCells(`A${row}:C${row + 15}`);
      const suggestionCell = sheet.getCell(`A${row}`);
      suggestionCell.value = llms.suggestedContent;
      suggestionCell.alignment = { vertical: 'top', wrapText: true };
      suggestionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFF0' } };
      sheet.getRow(row).height = 300;
    }

    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 40;
    sheet.getColumn('C').width = 20;
  }

  /**
   * 종합 점수 시트 추가 (private) - SOYOYU 구조 기반
   */
  private addSEOScoreSheet(workbook: ExcelJS.Workbook, result: SEOAuditResult): void {
    const sheet = workbook.addWorksheet('종합 점수');

    sheet.mergeCells('A1:D1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'SEO & AI 최적화 종합 점수';
    titleCell.font = { size: 18, bold: true };
    titleCell.alignment = { horizontal: 'center' };

    sheet.getCell('A3').value = '진단 URL:';
    sheet.getCell('B3').value = result.url;

    sheet.getCell('A5').value = '카테고리별 점수';
    sheet.getCell('A5').font = { size: 14, bold: true };

    const cats = result.categories;
    const catEntries = cats ? [
      ['메타 태그', cats.meta?.score ?? 0],
      ['헤딩 구조', cats.heading?.score ?? 0],
      ['이미지', cats.image?.score ?? 0],
      ['링크', cats.link?.score ?? 0],
      ['소셜 미디어', cats.social?.score ?? 0],
      ['콘텐츠', cats.content?.score ?? 0],
      ['시맨틱 구조', cats.semantic?.score ?? 0],
      ['접근성', cats.accessibility?.score ?? 0],
      ['구조화 데이터', cats.schema?.score ?? 0],
      ['기술 분석', cats.technical?.score ?? 0],
      ['AI 최적화 (GEO)', cats.geo?.score ?? 0],
    ] : [];

    const scoreRows: (string | number)[][] = [
      ['카테고리', '점수', '등급', '상태'],
      ...catEntries.map(([name, score]) => [
        name as string,
        `${score}/100`,
        this.getGrade(score as number),
        this.getStatusEmoji(score as number),
      ]),
      ['', '', '', ''],
      ['종합 점수', `${result.score ?? 0}/100`, this.getGrade(result.score ?? 0), this.getStatusEmoji(result.score ?? 0)],
    ];

    let row = 6;
    scoreRows.forEach((data, idx) => {
      sheet.getRow(row).values = data;
      if (idx === 0) {
        sheet.getRow(row).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
      } else if (idx === scoreRows.length - 1) {
        sheet.getRow(row).font = { bold: true, size: 13 };
        sheet.getRow(row).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB3B' } };
      }
      row++;
    });

    sheet.getColumn('A').width = 25;
    sheet.getColumn('B').width = 20;
    sheet.getColumn('C').width = 15;
    sheet.getColumn('D').width = 20;
  }

  /**
   * 점수에 따른 등급 (private)
   */
  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * 점수에 따른 상태 이모지 (private)
   */
  private getStatusEmoji(score: number): string {
    if (score >= 90) return '🟢 우수';
    if (score >= 70) return '🟡 양호';
    if (score >= 50) return '🟠 보통';
    return '🔴 개선 필요';
  }

  // ───────────────────────────────────────────────────────────────────────
  // 이미지 진단(alt-text) 전용
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 이미지 진단 단독 리포트 생성
   * 시트: 요약 / 페이지별 상세(전체) / 불일치만(pass 제외)
   */
  async generateAltTextReport(result: AltTextAuditResult): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    this.addAltTextSummarySheet(workbook, result);
    this.addAltTextDetailSheet(workbook, result, { includePass: true, name: '페이지별 상세' });
    this.addAltTextDetailSheet(workbook, result, { includePass: false, name: '불일치만' });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addAltTextSummarySheet(workbook: ExcelJS.Workbook, result: AltTextAuditResult): void {
    const sheet = workbook.addWorksheet('요약');
    sheet.columns = [
      { header: '항목', key: 'item', width: 30 },
      { header: '값', key: 'value', width: 40 },
    ];
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.addRow({ item: '진단 시작 시간', value: result.startTime });
    sheet.addRow({ item: '진단 종료 시간', value: result.endTime });
    if (result.inspector) sheet.addRow({ item: '점검자', value: result.inspector });
    sheet.addRow({ item: '대상 URL 수', value: result.totalUrls });
    sheet.addRow({ item: 'OCR 실행 이미지 수', value: result.totalImagesScanned });
    sheet.addRow({ item: '불일치 (pass 제외)', value: result.totalMismatches });
    sheet.addRow({ item: '', value: '' });
    sheet.addRow({ item: '--- 판정별 카운트 ---', value: '' });

    const c = result.countsByJudgment;
    sheet.addRow({ item: '정상 (pass)', value: c.pass ?? 0 });
    sheet.addRow({ item: 'alt 누락 (missing_alt)', value: c.missing_alt ?? 0 });
    sheet.addRow({ item: '장식 오분류 (decorative_mismatch)', value: c.decorative_mismatch ?? 0 });
    sheet.addRow({ item: '텍스트 불일치 (text_mismatch)', value: c.text_mismatch ?? 0 });
    sheet.addRow({ item: '수동 검토 필요 (review_needed)', value: c.review_needed ?? 0 });

    sheet.addRow({ item: '', value: '' });
    sheet.addRow({ item: '--- 대상 URL ---', value: '' });
    result.targetUrls.forEach((u, i) => sheet.addRow({ item: `URL ${i + 1}`, value: u }));
  }

  private addAltTextDetailSheet(
    workbook: ExcelJS.Workbook,
    result: AltTextAuditResult,
    options: { includePass: boolean; name: string },
  ): void {
    const sheet = workbook.addWorksheet(options.name);
    sheet.columns = [
      { header: '페이지 URL', key: 'pageUrl', width: 50 },
      { header: '요소', key: 'elementId', width: 30 },
      { header: '이미지 URL', key: 'imageUrl', width: 50 },
      { header: '현재 alt', key: 'currentAlt', width: 30 },
      { header: 'OCR 텍스트', key: 'extractedText', width: 40 },
      { header: '유사도', key: 'similarity', width: 10 },
      { header: 'OCR 신뢰도', key: 'confidenceScore', width: 12 },
      { header: '이미지 유형', key: 'imageType', width: 15 },
      { header: '판정', key: 'judgment', width: 22 },
      { header: '사유', key: 'reason', width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const judgmentColors: Record<AltTextMismatch['judgment'], string> = {
      pass: 'FF99CC00',
      missing_alt: 'FFFF0000',
      decorative_mismatch: 'FFFF6600',
      text_mismatch: 'FFFFCC00',
      review_needed: 'FF3B82F6',
    };
    const judgmentLabels: Record<AltTextMismatch['judgment'], string> = {
      pass: '정상',
      missing_alt: 'alt 누락',
      decorative_mismatch: '장식 오분류',
      text_mismatch: '텍스트 불일치',
      review_needed: '수동 검토 필요',
    };

    for (const scan of result.scans) {
      for (const item of scan.items) {
        if (!options.includePass && item.judgment === 'pass') continue;
        const row = sheet.addRow({
          pageUrl: scan.pageUrl,
          elementId: item.elementId,
          imageUrl: item.imageUrl,
          currentAlt: item.currentAlt ?? '(없음)',
          extractedText: item.extractedText,
          similarity: typeof item.similarity === 'number' ? item.similarity.toFixed(2) : '-',
          confidenceScore: typeof item.confidenceScore === 'number' ? item.confidenceScore.toFixed(2) : '-',
          imageType: item.imageType,
          judgment: judgmentLabels[item.judgment],
          reason: item.reason,
        });
        row.getCell('judgment').fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: judgmentColors[item.judgment] },
        };
      }
    }

    sheet.autoFilter = { from: 'A1', to: 'J1' };
  }
}

export default ExcelGenerator;
