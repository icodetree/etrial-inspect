import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import { getBrowserLaunchOptions } from '@/lib/browser-utils';
import { NotionService } from '@/services/notion/NotionService';
import { diffAuditResults } from '@/lib/comparison/diff';
import {
  ComparisonPDFGenerator,
  ComparisonPDFOptions,
} from '@/lib/comparison-pdf-generator';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const maxDuration = 300; // 5분 타임아웃

/**
 * POST — 비교 보고서 PDF 생성
 * Body: { baseId: string, currentId: string, options?: ComparisonPDFOptions }
 */
export async function POST(request: NextRequest) {
  let browser = null;
  let tmpFile: string | null = null;

  try {
    const body = await request.json();
    const { baseId, currentId, options } = body as {
      baseId?: string;
      currentId?: string;
      options?: ComparisonPDFOptions;
    };

    if (!baseId || !currentId) {
      return NextResponse.json(
        { error: 'baseId 와 currentId 가 필요합니다.' },
        { status: 400 },
      );
    }

    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !databaseId) {
      return NextResponse.json(
        { error: 'Notion API Key 또는 Database ID 가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    const notionService = new NotionService(apiKey, databaseId);

    console.log(`[Comparison PDF] Fetching audit results: base=${baseId}, current=${currentId}`);

    const [base, current] = await Promise.all([
      notionService.getAuditResult(baseId),
      notionService.getAuditResult(currentId),
    ]);

    if (!base) {
      return NextResponse.json(
        { error: `기준 감사 결과를 찾을 수 없습니다: ${baseId}` },
        { status: 404 },
      );
    }

    if (!current) {
      return NextResponse.json(
        { error: `현재 감사 결과를 찾을 수 없습니다: ${currentId}` },
        { status: 404 },
      );
    }

    const comparison = diffAuditResults(base, current, baseId, currentId);

    console.log(
      `[Comparison PDF] Diff complete — resolved=${comparison.resolvedViolations.length}, new=${comparison.newViolations.length}, persistent=${comparison.persistentCount}`,
    );

    // HTML 생성
    const generator = new ComparisonPDFGenerator(
      comparison,
      base,
      current,
      options || {},
    );
    const html = await generator.generateHTML();

    console.log(`[Comparison PDF] HTML generated (${(html.length / 1024).toFixed(0)}KB)`);

    // 대용량 HTML 은 임시 파일 → file:// 로드
    tmpFile = path.join(os.tmpdir(), `comparison-pdf-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf-8');

    const launchOptions = await getBrowserLaunchOptions(true);
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`file://${tmpFile}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '15mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; text-align:center; font-size:8pt; color:#a0aec0; padding: 5mm 0;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
    });

    console.log(`[Comparison PDF] PDF generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);

    await browser.close();
    browser = null;

    const dateStr = new Date().toISOString().split('T')[0];
    const responseBuffer = new Uint8Array(pdfBuffer);

    return new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="comparison-report-${dateStr}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('[Comparison PDF] Error:', error);

    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `비교 PDF 생성 실패: ${message}` },
      { status: 500 },
    );
  } finally {
    if (tmpFile) {
      const file = tmpFile;
      setTimeout(() => {
        try {
          fs.unlinkSync(file);
        } catch {
          /* ignore */
        }
      }, 60000);
    }
  }
}

/**
 * PUT — HTML 폴백 (PDF 생성 실패 시 HTML 다운로드)
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { baseId, currentId, options } = body as {
      baseId?: string;
      currentId?: string;
      options?: ComparisonPDFOptions;
    };

    if (!baseId || !currentId) {
      return NextResponse.json(
        { error: 'baseId 와 currentId 가 필요합니다.' },
        { status: 400 },
      );
    }

    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !databaseId) {
      return NextResponse.json(
        { error: 'Notion API Key 또는 Database ID 가 설정되지 않았습니다.' },
        { status: 500 },
      );
    }

    const notionService = new NotionService(apiKey, databaseId);

    const [base, current] = await Promise.all([
      notionService.getAuditResult(baseId),
      notionService.getAuditResult(currentId),
    ]);

    if (!base) {
      return NextResponse.json(
        { error: `기준 감사 결과를 찾을 수 없습니다: ${baseId}` },
        { status: 404 },
      );
    }

    if (!current) {
      return NextResponse.json(
        { error: `현재 감사 결과를 찾을 수 없습니다: ${currentId}` },
        { status: 404 },
      );
    }

    const comparison = diffAuditResults(base, current, baseId, currentId);
    const generator = new ComparisonPDFGenerator(
      comparison,
      base,
      current,
      options || {},
    );
    const html = await generator.generateHTML();

    const dateStr = new Date().toISOString().split('T')[0];

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="comparison-report-${dateStr}.html"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `HTML 생성 실패: ${message}` },
      { status: 500 },
    );
  }
}
