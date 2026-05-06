/**
 * Next.js App Router API 라우트용 공용 헬퍼.
 *
 * Phase 2-3 리팩토링: API 라우트마다 중복되던 `baseOrigin` 계산(~13줄 × n)을 단일 함수로 통합하고,
 * 에러 응답 shape 의 일관성을 강화한다.
 *
 * ## 에러 응답 shape 결정
 * 기존 라우트의 응답을 grep 으로 분석한 결과 UI(`features/`, `app/page.tsx`, `ReportViewer.tsx`)는
 * 모두 `errBody.error` 를 string 으로 소비하고 있었다. 일부 라우트는 `details` 를 추가로 첨부하기도 하지만
 * UI 는 무시한다. 따라서 호환성을 위해 **flat shape** `{ error: string, code?: string, details?: unknown }`
 * 을 채택한다 — 새 구조 `{ error: { code, message } }` 로 바꾸면 기존 UI 가 일제히 깨지므로 보류.
 *
 * ## 마이그레이션 정책
 * 본 PR 에서는 `baseOrigin` 헬퍼만 핵심 라우트(`history/save`, `alttext/save`) 2곳에 적용한다.
 * 에러 응답 표준화는 `apiError` 함수만 도입해두고 기존 라우트는 그대로 두어 추후 PR 에서 점진 적용한다.
 */

import { NextResponse } from 'next/server';

/**
 * Request 객체에서 base origin 을 가장 신뢰할 수 있는 출처로부터 결정한다.
 *
 * 우선순위:
 * 1. `process.env.VERCEL_URL` (Vercel 배포 환경 — 가장 확실)
 * 2. `host` 헤더 + `x-forwarded-proto` (리버스 프록시 뒤의 일반적인 케이스)
 *    단, host 가 `localhost` 를 포함하면 신뢰하지 않음
 * 3. `origin` 헤더 (브라우저가 보내는 실제 origin)
 * 4. `http://localhost:3000` (최종 fallback)
 *
 * 기존 `history/save/route.ts`, `alttext/save/route.ts` 에 ~13줄씩 복붙되어 있던 로직을 통합.
 *
 * @param request - Next.js App Router 의 Request 또는 NextRequest
 * @returns 절대 URL prefix (끝에 `/` 없음). 예: `https://example.vercel.app`
 */
export function resolveBaseOrigin(request: Request): string {
  // 1. Vercel URL — 가장 확실한 production 케이스
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // 2. host + x-forwarded-proto — 리버스 프록시 뒤
  const host = request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  if (host && !host.includes('localhost')) {
    return `${proto}://${host}`;
  }

  // 3. origin 헤더
  const origin = request.headers.get('origin');
  if (origin) return origin;

  // 4. fallback
  return 'http://localhost:3000';
}

/**
 * 통일된 에러 응답 생성. 기존 UI 호환을 위해 flat shape 채택:
 * `{ error: string, code?: string, details?: unknown }`
 *
 * @example
 * return apiError(500, 'Failed to save to Notion', { code: 'notion_perm', details: e });
 */
export function apiError(
  status: number,
  message: string,
  extra?: { code?: string; details?: unknown },
): Response {
  const body: { error: string; code?: string; details?: unknown } = { error: message };
  if (extra?.code !== undefined) body.code = extra.code;
  if (extra?.details !== undefined) body.details = extra.details;
  return NextResponse.json(body, { status });
}

/**
 * 통일된 성공 응답 생성. 본 PR 에서는 도입만 하고 적극 마이그레이션은 보류 —
 * 기존 라우트의 응답 shape 다양성(`{ success, message, reportUrl }`,
 * `{ success, pageId, reportUrl }`, `{ ... raw entity }`)이 커서
 * 일괄 표준화는 회귀 위험이 있다. 새 라우트 작성 시 본 함수 사용을 권장.
 */
export function apiSuccess<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json(data, init);
}
