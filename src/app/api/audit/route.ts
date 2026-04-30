import { NextRequest, NextResponse } from 'next/server';
import { AuditConfig } from '@/types';

// Set max duration for Vercel Serverless Function (Start with 60s, max 300s for Pro)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const config: AuditConfig = await request.json();

    console.log('🚀 Starting audit execution...');

    // Dynamic import to avoid bundling excessive dependencies on cold start
    let runAudit;
    try {
      const module = await import('@/services/AuditExecutor');
      runAudit = module.runAudit;
    } catch (e) {
      console.error('Failed to import AuditExecutor:', e);
      throw new Error('Audit Engine module failed to load.');
    }

    // 클라이언트가 fetch 를 abort 하면 (새로고침 / 탭 닫기 / 정지 버튼) request.signal 이 abort 된다.
    // runAudit 안에서 이 signal 을 검사해 작업을 중단한다.
    const result = await runAudit(config, undefined, request.signal);

    return NextResponse.json(result);

  } catch (error: any) {
    // 클라이언트 abort 로 인한 종료는 정상 흐름 — 에러 응답 대신 짧은 로그
    if (error?.name === 'AbortError' || request.signal.aborted) {
      console.log('🛑 Audit aborted by client.');
      return NextResponse.json({ aborted: true }, { status: 499 });
    }
    console.error('Audit execution error:', error);
    return NextResponse.json(
      {
        error: `진단 실행 중 오류가 발생했습니다.`,
        details: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
