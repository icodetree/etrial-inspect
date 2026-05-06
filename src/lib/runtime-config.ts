/**
 * 런타임 환경 프로파일 — Vercel/AWS Lambda 등 서버리스 환경과 로컬 환경의
 * 크롤링/진단 설정 기본값을 단일 모듈로 통합한다.
 *
 * Phase 2-1 리팩토링: 기존에 `process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME`
 * 분기를 4곳(`AuditExecutor.ts` 2곳, `crawler.ts`, `browser-utils.ts`)에 중복으로 두고
 * 각자 다른 기본값(`isVercel ? 2 : 10` 등)을 산정하던 것을 여기로 일원화했다.
 *
 * 호출처는 `getRuntimeProfile()` 의 결과 객체에서 필요한 값만 사용하면 되며,
 * 사용자 옵션(예: `config.maxDepth`)을 우선시하기 위해 호출처에서 `??` 로 override 한다.
 */

/**
 * 런타임 환경 분류.
 * - serverless: Vercel / AWS Lambda — 짧은 실행 시간 한도, 메모리 제약
 * - local: 로컬 개발 / GitHub Actions — 풀 트래버설 가능
 */
export type RuntimeKind = 'serverless' | 'local';

export interface RuntimeProfile {
  /** 환경 분류 */
  kind: RuntimeKind;
  /** Vercel/Lambda 여부 (legacy 코드 호환용 boolean) */
  isServerless: boolean;
  /** 크롤러 maxDepth 기본값 */
  maxDepth: number;
  /** 크롤러 maxPages 기본값 */
  maxPages: number;
  /** 크롤러 동시성 — 메모리 ≈ 페이지당 ~50MB × concurrency */
  crawlConcurrency: number;
  /** 페이지 goto 타임아웃 (ms). 첫 페이지 / 후속 페이지 공통 상한치로 사용 */
  gotoTimeoutMs: number;
}

/**
 * 현재 프로세스가 서버리스 환경(Vercel/AWS Lambda)인지 판정.
 * - `process.env.VERCEL === '1'` (Vercel 빌드/런타임)
 * - `process.env.AWS_LAMBDA_FUNCTION_NAME` 존재 (AWS Lambda 런타임)
 *
 * @internal — 외부 모듈은 `getRuntimeProfile().isServerless` 사용을 권장.
 */
export function isServerlessEnvironment(): boolean {
  return process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

/**
 * 현재 환경의 런타임 프로파일을 반환.
 *
 * 서버리스 환경의 기본값은 가장 보수적인 값을 채택했다 (호출처마다 미묘하게 달랐지만
 * Vercel 함수 제한 시간 내에 안정적으로 동작하는 값으로 통일). 호출처는 사용자 옵션을
 * `??` 로 우선 적용하여 override 할 수 있다.
 */
export function getRuntimeProfile(): RuntimeProfile {
  const serverless = isServerlessEnvironment();
  if (serverless) {
    return {
      kind: 'serverless',
      isServerless: true,
      maxDepth: 2,
      maxPages: 5,
      crawlConcurrency: 1,
      gotoTimeoutMs: 30000,
    };
  }
  return {
    kind: 'local',
    isServerless: false,
    maxDepth: 10,
    maxPages: 1000,
    crawlConcurrency: 3,
    gotoTimeoutMs: 60000,
  };
}

/**
 * 사용자 입력 제외 경로 문자열을 RegExp 배열로 변환.
 *
 * 입력 형식:
 * - 줄바꿈으로 구분된 문자열 (`/admin\n/login`) — 각 줄이 path prefix
 * - 문자열 배열 — 각 원소가 path prefix
 * - undefined / 빈 문자열 — 빈 배열 반환
 *
 * 변환 규칙: 정규식 메타문자 escape 후 `(\/|$|\?)` suffix 를 붙여
 * 정확히 path 경계에서만 매칭 (`/admin` 이 `/administration` 을 우연히 매칭하지 않도록).
 *
 * 기존 `runAudit` 와 `runCrawlAltTextAudit` 에 동일하게 ~50줄씩 복붙되어 있던 로직을 통합.
 *
 * @example
 * buildExcludePatterns('/admin\n/login')
 *   → [/\/admin(\/|$|\?)/i, /\/login(\/|$|\?)/i]
 */
export function buildExcludePatterns(
  input: string | string[] | undefined,
): RegExp[] {
  if (!input) return [];
  const lines: string[] = Array.isArray(input)
    ? input
    : input.split('\n');
  return lines
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`${escaped}(\\/|$|\\?)`, 'i');
    });
}
