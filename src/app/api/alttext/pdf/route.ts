import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import { getBrowserLaunchOptions } from '@/lib/browser-utils';
import { generateAltTextHTML, type AltTextPDFOptions } from '@/lib/alttext-pdf-template';
import type { AltTextAuditResult } from '@/types/alt-text';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let browser = null;

  try {
    const body = await request.json();
    const result: AltTextAuditResult = body.result;
    const options: AltTextPDFOptions = body.options || {};

    if (!result || !Array.isArray(result.scans)) {
      return NextResponse.json(
        { error: '유효한 이미지 진단 결과가 필요합니다.' },
        { status: 400 },
      );
    }

    const html = generateAltTextHTML(result, options);

    const launchOptions = await getBrowserLaunchOptions(true);
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.setContent(html, { waitUntil: 'networkidle', timeout: 60000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '20mm', left: '15mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; text-align:center; font-size:8pt; color:#a0aec0; padding: 5mm 0;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
    });

    await browser.close();
    browser = null;

    const responseBuffer = new Uint8Array(pdfBuffer);
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="alttext-report-${today}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('[alttext/pdf] Error:', error);
    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `PDF 생성 실패: ${message}` },
      { status: 500 },
    );
  }
}
