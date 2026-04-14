import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import { getBrowserLaunchOptions } from '@/lib/browser-utils';
import { PDFReportGenerator, PDFReportOptions } from '@/lib/pdf-report-generator';
import { AuditResult } from '@/types';

export const maxDuration = 300; // 5분 타임아웃

export async function POST(request: NextRequest) {
  let browser = null;

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

    // Playwright로 PDF 생성
    const launchOptions = await getBrowserLaunchOptions(true);
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });

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

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `PDF 생성 실패: ${message}` },
      { status: 500 }
    );
  }
}
