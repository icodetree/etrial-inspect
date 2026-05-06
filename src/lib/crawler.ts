/**
 * Crawler facade — Phase 3-1 분리 후 진입점.
 *
 * 본 파일은 외부 호출자(`AuditExecutor`, scripts, tests) 와의 import 호환성을
 * 유지하기 위한 얇은 facade 다. 실제 구현은 `./crawler/` 하위 모듈로 분리됨:
 *
 *   - `./crawler/core.ts`           — WebCrawler 클래스 본체 (BFS, 라이프사이클)
 *   - `./crawler/sitemap.ts`        — sitemap.xml fetch / 파싱
 *   - `./crawler/spa-discovery.ts`  — SPA 메뉴 클릭 폴백
 *   - `./crawler/history-hook.ts`   — window.history API 인스트루먼테이션
 *   - `./crawler/types.ts`          — 모듈 공용 타입
 *
 * 호출처 import 경로(`@/lib/crawler`, `'../lib/crawler'`) 는 변경하지 않아도 된다.
 */

export { WebCrawler } from './crawler/core';
export type {
  CrawlerOptions,
  CrawlSourceCounts,
  CrawlResult,
} from './crawler/types';

import { WebCrawler } from './crawler/core';
export default WebCrawler;
