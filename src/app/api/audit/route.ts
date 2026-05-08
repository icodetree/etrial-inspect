import { NextRequest, NextResponse } from 'next/server';
import { AuditConfig } from '@/types';
import { createSSEResponse } from '@/lib/sse-stream';

// Set max duration for Vercel Serverless Function (Start with 60s, max 300s for Pro)
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let config: AuditConfig;
  try {
    config = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  console.log('🚀 Starting audit execution (SSE stream)...');

  return createSSEResponse(
    async (onProgress) => {
      // Dynamic import to avoid bundling excessive dependencies on cold start
      const { runAudit } = await import('@/services/AuditExecutor');
      return runAudit(config, onProgress, request.signal);
    },
    {
      signal: request.signal,
      abortLogMessage: 'Audit aborted by client.',
      errorLogPrefix: 'Audit execution error:',
    },
  );
}
