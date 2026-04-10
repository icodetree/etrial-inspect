/**
 * ExcelGenerator 단위 테스트
 *
 * ExcelJS를 실제로 사용하여 in-memory Buffer 생성 후,
 * 다시 읽어서 시트 이름/구조를 검증한다. (파일 I/O 없음)
 */

import ExcelJS from 'exceljs';
import { ExcelGenerator } from '../excel-generator';
import type { AuditResult, Violation, PageInfo } from '@/types';
import type { SEOAuditResult } from '@/types/seo';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePage(url = 'https://example.com/page1'): PageInfo {
  return {
    url,
    title: '테스트 페이지',
    depth1: '메인',
    depth2: '서브',
    depth3: '',
    depth4: '',
  };
}

function makeViolation(overrides: Partial<Violation> = {}): Violation {
  return {
    pageUrl: 'https://example.com',
    pageTitle: '테스트 페이지',
    depth1: '메인',
    depth2: '',
    depth3: '',
    depth4: '',
    platform: 'PC',
    inspector: '테스터',
    inspectionDate: '2026-04-09',
    violationNumber: 1,
    kwcagId: '1.1.1',
    kwcagName: '적절한 대체 텍스트 제공',
    principle: '인식의 용이성',
    axeRuleId: 'image-alt',
    description: '이미지에 alt 속성이 없습니다',
    impact: 'serious',
    affectedCode: '<img src="logo.png">',
    help: 'alt 속성을 추가하세요',
    helpUrl: 'https://example.com/help',
    ...overrides,
  };
}

function makeAuditResult(overrides: Partial<AuditResult> = {}): AuditResult {
  return {
    startTime: '2026-04-09T10:00:00Z',
    endTime: '2026-04-09T10:05:00Z',
    totalPages: 1,
    totalViolations: 1,
    pages: [makePage()],
    violations: [makeViolation()],
    summary: {
      byPrinciple: { '인식의 용이성': 1 },
      byImpact: { serious: 1 },
      byKwcagItem: { '1.1.1': 1 },
    },
    ...overrides,
  };
}

function makeSEOResult(): SEOAuditResult {
  return {
    score: 75,
    url: 'https://example.com',
    title: 'Example',
    timestamp: Date.now(),
    executionTime: 1200,
    categories: {
      meta: { name: '메타 태그', score: 80, issues: [], passed: [], data: {
        title: { exists: true, text: 'Example', length: 7, htmlCode: null },
        description: { exists: true, content: 'desc', length: 4, htmlCode: null },
        keywords: { exists: false, content: '', count: 0, htmlCode: null },
        robots: { exists: false, content: '', defaultValue: 'index, follow', htmlCode: null },
        viewport: { exists: true, content: 'width=device-width', htmlCode: null },
        charset: { exists: true, value: 'utf-8', htmlCode: null },
        canonical: { exists: false, href: '', htmlCode: null },
        author: { exists: false, content: '', htmlCode: null },
        language: 'ko',
      }},
      heading: { name: '헤딩 구조', score: 90, issues: [], passed: [], data: {
        headings: { h1: ['Test'], h2: [], h3: [], h4: [], h5: [], h6: [] },
        counts: { h1: 1, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 },
        structure: ['H1: Test'],
        h1Text: 'Test',
      }},
      image: { name: '이미지', score: 70, issues: [], passed: [], data: {
        total: 3, images: [], stats: {
          missingAlt: 1, emptyAlt: 0, withTitle: 0, lazyLoading: 0,
          missingDimensions: 1, webpFormat: 0, avifFormat: 0,
          largeFiles: 0, veryLargeFiles: 0, totalSize: 0,
        },
      }},
      link: { name: '링크', score: 85, issues: [], passed: [], data: {} as any },
      social: { name: '소셜 미디어', score: 60, issues: [], passed: [], data: {} as any },
      content: { name: '콘텐츠', score: 75, issues: [], passed: [], data: {} as any },
      semantic: { name: '시맨틱 구조', score: 65, issues: [], passed: [], data: {} as any },
      accessibility: { name: '접근성', score: 80, issues: [], passed: [], data: {} as any },
      schema: { name: '구조화 데이터', score: 50, issues: [], passed: [], data: {} as any },
      technical: { name: '기술 분석', score: 85, issues: [], passed: [], data: {} as any },
      geo: { name: 'AI 최적화 (GEO)', score: 70, issues: [], passed: [], data: {
        llmsTxt: { exists: false, content: null, structure: { hasH1: false, hasH2: false, hasH3: false, paragraphCount: 0, wordCount: 0, codeBlockCount: 0 }, contentQuality: { hasSummary: false, hasKeywords: false, hasContactInfo: false, hasUrlDeclarations: false, hasSocialLinks: false, sectionCount: 0, readabilityScore: 0, structureScore: 0 }, brokenLinks: [], suggestedContent: '# Example' },
        robotsAiCrawlers: { gptBot: true, claudeBot: true, googleBot: true, bingBot: true },
        score: 70,
      } as any },
    },
  } as SEOAuditResult;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Buffer를 ExcelJS Workbook으로 파싱한다 */
async function parseExcelBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExcelGenerator', () => {
  let generator: ExcelGenerator;

  beforeEach(() => {
    generator = new ExcelGenerator({
      includeViolations: true,
      platform: 'PC',
      inspector: '테스터',
    });
  });

  // -----------------------------------------------------------------------
  // generateAuditReport — 기본 동작
  // -----------------------------------------------------------------------
  describe('generateAuditReport()', () => {
    test('Buffer를 반환한다', async () => {
      const buf = await generator.generateAuditReport(makeAuditResult());
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(0);
    });

    test('반환된 Buffer는 유효한 XLSX이다 (ExcelJS로 파싱 가능)', async () => {
      const buf = await generator.generateAuditReport(makeAuditResult());
      const wb = await parseExcelBuffer(buf);
      expect(wb.worksheets.length).toBeGreaterThan(0);
    });

    test('SEO 데이터 없이 기본 시트 3개를 생성한다', async () => {
      const result = makeAuditResult(); // seoResult 없음
      const buf = await generator.generateAuditReport(result);
      const wb = await parseExcelBuffer(buf);

      const sheetNames = wb.worksheets.map((ws) => ws.name);
      expect(sheetNames).toContain('접근성 진단 결과');
      expect(sheetNames).toContain('요약');
      expect(sheetNames).toContain('IA 구조');
      expect(sheetNames).toHaveLength(3);
    });

    test('SEO 데이터가 있으면 SEO 관련 시트 3개가 추가된다 (총 6개)', async () => {
      const result = makeAuditResult({ seoResult: makeSEOResult() });
      const buf = await generator.generateAuditReport(result);
      const wb = await parseExcelBuffer(buf);

      const sheetNames = wb.worksheets.map((ws) => ws.name);
      expect(sheetNames).toContain('SEO 분석');
      expect(sheetNames).toContain('AI 최적화');
      expect(sheetNames).toContain('종합 점수');
      expect(sheetNames).toHaveLength(6);
    });
  });

  // -----------------------------------------------------------------------
  // 빈 데이터 처리
  // -----------------------------------------------------------------------
  describe('빈 데이터 처리', () => {
    test('violations 빈 배열로 호출해도 에러 없이 Buffer 반환', async () => {
      const result = makeAuditResult({
        violations: [],
        totalViolations: 0,
        summary: { byPrinciple: {}, byImpact: {}, byKwcagItem: {} },
      });

      const buf = await generator.generateAuditReport(result);
      expect(Buffer.isBuffer(buf)).toBe(true);

      const wb = await parseExcelBuffer(buf);
      const auditSheet = wb.getWorksheet('접근성 진단 결과');
      expect(auditSheet).toBeDefined();
      // 헤더만 존재 (1행)
      expect(auditSheet!.rowCount).toBe(1);
    });

    test('pages 빈 배열로 호출해도 에러 없이 Buffer 반환', async () => {
      const result = makeAuditResult({
        pages: [],
        totalPages: 0,
      });

      const buf = await generator.generateAuditReport(result);
      expect(Buffer.isBuffer(buf)).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // 접근성 진단 결과 시트 — 컬럼 ↔ Violation 타입 필드 매핑
  // -----------------------------------------------------------------------
  describe('접근성 진단 결과 시트 필드 매핑', () => {
    test('헤더 컬럼이 Violation 타입 필드와 일치한다', async () => {
      const buf = await generator.generateAuditReport(makeAuditResult());
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('접근성 진단 결과')!;
      const headerRow = sheet.getRow(1);

      const expectedHeaders = [
        '1뎁스', '2뎁스', '3뎁스', '4뎁스',
        '페이지명', 'URL', '플랫폼', '점검자', '점검일',
        '번호', '지침명', '영향도', '오류내용', '영향받는 요소 코드', '해결방안',
      ];

      const actualHeaders: string[] = [];
      headerRow.eachCell((cell) => {
        actualHeaders.push(String(cell.value));
      });

      expect(actualHeaders).toEqual(expectedHeaders);
    });

    test('violation 데이터 행이 올바르게 매핑된다', async () => {
      const buf = await generator.generateAuditReport(makeAuditResult());
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('접근성 진단 결과')!;

      // 2행 = 첫 번째 데이터 행
      // 컬럼 순서: 1뎁스(1), 2뎁스(2), 3뎁스(3), 4뎁스(4), 페이지명(5), URL(6), 플랫폼(7), 점검자(8), ...
      const row = sheet.getRow(2);
      expect(row.getCell(5).value).toBe('테스트 페이지');  // 페이지명
      expect(row.getCell(6).value).toBe('https://example.com');  // URL
      expect(row.getCell(7).value).toBe('PC');  // 플랫폼
    });

    test('kwcagId → violationNumber 매핑: 1.1.1 → 1', async () => {
      const buf = await generator.generateAuditReport(makeAuditResult());
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('접근성 진단 결과')!;
      const row = sheet.getRow(2);
      // 번호 = 10번째 컬럼
      expect(row.getCell(10).value).toBe(1);
    });

    test('impact 한글 변환: serious → 중요', async () => {
      const buf = await generator.generateAuditReport(makeAuditResult());
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('접근성 진단 결과')!;
      const row = sheet.getRow(2);
      // 영향도 = 12번째 컬럼
      expect(row.getCell(12).value).toBe('중요');
    });
  });

  // -----------------------------------------------------------------------
  // generateIAReport
  // -----------------------------------------------------------------------
  describe('generateIAReport()', () => {
    test('IA 구조 시트가 올바른 컬럼 헤더를 가진다', async () => {
      const buf = await generator.generateIAReport([makePage()]);
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('IA 구조')!;
      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell) => headers.push(String(cell.value)));

      expect(headers).toEqual(['1뎁스', '2뎁스', '3뎁스', '4뎁스', '페이지명', 'URL']);
    });

    test('페이지 데이터가 올바르게 기록된다', async () => {
      const pages = [makePage('https://example.com/a'), makePage('https://example.com/b')];
      const buf = await generator.generateIAReport(pages);
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('IA 구조')!;

      // 헤더 1행 + 데이터 2행 = 3행
      expect(sheet.rowCount).toBe(3);
    });
  });

  // -----------------------------------------------------------------------
  // generateSEOReport
  // -----------------------------------------------------------------------
  describe('generateSEOReport()', () => {
    test('SEO 전용 리포트는 3개 시트를 포함한다', async () => {
      const buf = await generator.generateSEOReport(makeSEOResult());
      const wb = await parseExcelBuffer(buf);
      const sheetNames = wb.worksheets.map((ws) => ws.name);

      expect(sheetNames).toEqual(
        expect.arrayContaining(['SEO 분석', 'AI 최적화', '종합 점수'])
      );
      expect(sheetNames).toHaveLength(3);
    });

    test('종합 점수 시트에 카테고리별 점수가 포함된다', async () => {
      const buf = await generator.generateSEOReport(makeSEOResult());
      const wb = await parseExcelBuffer(buf);
      const sheet = wb.getWorksheet('종합 점수')!;

      // 시트가 데이터 행을 포함하는지 검증 (최소 6행 이상)
      expect(sheet.rowCount).toBeGreaterThanOrEqual(6);
    });
  });
});
