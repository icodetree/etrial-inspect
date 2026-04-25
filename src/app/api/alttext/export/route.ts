import { NextRequest, NextResponse } from 'next/server';
import { ExcelGenerator } from '@/lib/excel-generator';
import type { AltTextAuditResult } from '@/types/alt-text';

export async function POST(request: NextRequest) {
  try {
    const result: AltTextAuditResult = await request.json();

    const generator = new ExcelGenerator({
      includeViolations: true,
      platform: 'PC',
      inspector: result.inspector || 'System',
    });

    const buffer = await generator.generateAltTextReport(result);
    const today = new Date().toISOString().split('T')[0];

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=alttext-audit-${today}.xlsx`,
      },
    });
  } catch (error) {
    console.error('[alttext/export] error:', error);
    return NextResponse.json(
      { error: '이미지 진단 엑셀 생성 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
