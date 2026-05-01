import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import { getBrowserLaunchOptions } from '@/lib/browser-utils';
import { PDFReportGenerator, PDFReportOptions } from '@/lib/pdf-report-generator';
import { AuditResult } from '@/types';
import fs from 'fs';
import path from 'path';
import os from 'os';

export const maxDuration = 300; // 5분 타임아웃

export async function POST(request: NextRequest) {
  let browser = null;
  let tmpFile: string | null = null;

  try {
    const body = await request.json();
    const result: AuditResult = body.result;
    const options: PDFReportOptions = body.options || {};

    if (!result || !result.violations) {
      return NextResponse.json(
        { error: '유효한 감사 결과가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`[PDF Report] Generating report for ${result.totalPages} pages, ${result.totalViolations} violations`);

    // HTML 생성
    const generator = new PDFReportGenerator(result, options);
    const html = await generator.generateHTML();

    console.log(`[PDF Report] HTML generated (${(html.length / 1024).toFixed(0)}KB)`);

    // 대용량 HTML은 setContent() IPC 한계를 초과하므로 임시 파일 → file:// 로드
    tmpFile = path.join(os.tmpdir(), `pdf-report-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf-8');

    const launchOptions = await getBrowserLaunchOptions(true);
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`file://${tmpFile}`, { waitUntil: 'domcontentloaded', timeout: 120000 });

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

    console.log(`[PDF Report] PDF generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);

    await browser.close();
    browser = null;

    const responseBuffer = new Uint8Array(pdfBuffer);

    return new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="accessibility-report-${new Date().toISOString().split('T')[0]}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('[PDF Report] Error:', error);

    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    // 임시 HTML 파일이 있으면 HTML 폴백 가능
    const canFallback = tmpFile && fs.existsSync(tmpFile);

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      {
        error: `PDF 생성 실패: ${message}`,
        fallbackAvailable: !!canFallback,
      },
      { status: 500 }
    );
  } finally {
    // 임시 파일 정리 — HTML 폴백 요청 시 필요하므로 짧은 지연 후 삭제
    if (tmpFile) {
      const file = tmpFile;
      setTimeout(() => {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }, 60000); // 1분 후 삭제
    }
  }
}

/**
 * HTML 폴백 다운로드 — PDF 생성 실패 시 HTML 파일로 대체 제공
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const result: AuditResult = body.result;
    const options: PDFReportOptions = body.options || {};

    if (!result || !result.violations) {
      return NextResponse.json({ error: '유효한 감사 결과가 필요합니다.' }, { status: 400 });
    }

    const generator = new PDFReportGenerator(result, options);
    const html = await generator.generateHTML();

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="accessibility-report-${new Date().toISOString().split('T')[0]}.html"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `HTML 생성 실패: ${message}` }, { status: 500 });
  }
}
