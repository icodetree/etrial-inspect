/**
 * URL 정규화/검증 유틸 — Phase 3-1 분리 모듈.
 *
 * `WebCrawler` 의 `normalizeUrl` / `isValidUrl` 동작을 그대로 옮겨 모듈화한다.
 * `baseUrl` / `baseDomain` / `excludePatterns` 가 호출 시점마다 달라질 수 있어
 * 메소드 형태가 아니라 인자로 받는 순수 함수로 노출한다.
 */

/**
 * URL 정규화: baseUrl 기준 절대화 + 일반 앵커(`#foo`) 제거 + 후행 슬래시 제거.
 *
 * `#/route` 또는 `#!path` 같은 SPA 해시 라우팅은 보존한다.
 */
export function normalizeUrl(url: string, baseUrl: string): string {
  try {
    const urlObj = new URL(url, baseUrl);
    if (urlObj.hash && !/^#[!/]/.test(urlObj.hash)) {
      urlObj.hash = '';
    }
    let normalized = urlObj.href;
    if (normalized.endsWith('/') && normalized.length > 1) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

export interface IsValidUrlOptions {
  baseUrl: string;
  /** 같은 도메인만 허용 (예: example.com) */
  baseDomain: string;
  excludePatterns?: RegExp[];
}

/**
 * URL 이 같은 도메인이고 제외 패턴에 매치하지 않는지 확인한다.
 * 잘못된 URL 은 false 로 처리한다.
 */
export function isValidUrl(url: string, options: IsValidUrlOptions): boolean {
  try {
    const urlObj = new URL(url, options.baseUrl);
    if (urlObj.hostname !== options.baseDomain) return false;
    for (const pattern of options.excludePatterns || []) {
      if (pattern.test(url)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * BFS path 누적과 4 단계 depth 컬럼(`depth1` ~ `depth4`) 을 산출한다.
 */
export function calculateDepthPath(
  parentPath: string[],
  currentTitle: string,
): [string, string, string, string] {
  const fullPath = [...parentPath.slice(0, 3), currentTitle];
  return [
    fullPath[0] || '',
    fullPath[1] || '',
    fullPath[2] || '',
    fullPath[3] || '',
  ];
}
