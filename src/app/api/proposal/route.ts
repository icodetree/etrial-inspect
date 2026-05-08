import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright-core';
import { getBrowserLaunchOptions } from '@/lib/browser-utils';
import { generateProposalHtml } from '@/lib/proposal-generator';
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
    const clientName: string = body.clientName;
    const contactPerson: string | undefined = body.contactPerson;

    if (!result || !result.violations) {
      return NextResponse.json(
        { error: '유효한 감사 결과가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!clientName) {
      return NextResponse.json(
        { error: '고객사명(clientName)이 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`[Proposal PDF] Generating proposal for "${clientName}" — ${result.totalPages} pages, ${result.totalViolations} violations`);

    // HTML 생성
    const html = generateProposalHtml({
      result,
      clientName,
      contactPerson,
    });

    console.log(`[Proposal PDF] HTML generated (${(html.length / 1024).toFixed(0)}KB)`);

    // 대용량 HTML은 setContent() IPC 한계를 초과할 수 있으므로 임시 파일 → file:// 로드
    tmpFile = path.join(os.tmpdir(), `proposal-${Date.now()}.html`);
    fs.writeFileSync(tmpFile, html, 'utf-8');

    const launchOptions = await getBrowserLaunchOptions(true);
    browser = await chromium.launch(launchOptions);
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`file://${tmpFile}`, { waitUntil: 'networkidle', timeout: 120000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%; text-align:center; font-size:8pt; color:#a0aec0; padding: 5mm 0;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>
      `,
    });

    console.log(`[Proposal PDF] PDF generated (${(pdfBuffer.length / 1024).toFixed(0)}KB)`);

    await browser.close();
    browser = null;

    const responseBuffer = new Uint8Array(pdfBuffer);
    const dateStr = new Date().toISOString().split('T')[0];
    const safeClientName = encodeURIComponent(clientName);

    return new NextResponse(responseBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeClientName}-proposal-${dateStr}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('[Proposal PDF] Error:', error);

    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
    }

    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `제안서 PDF 생성 실패: ${message}` },
      { status: 500 }
    );
  } finally {
    if (tmpFile) {
      const file = tmpFile;
      setTimeout(() => {
        try { fs.unlinkSync(file); } catch { /* ignore */ }
      }, 60000);
    }
  }
}
