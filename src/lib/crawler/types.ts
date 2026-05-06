/**
 * Crawler 모듈 공용 타입.
 *
 * Phase 3-1 리팩토링: 기존 src/lib/crawler.ts 한 파일에 흩어져 있던 인터페이스를
 * 모듈 내부에서 공유 가능하도록 추출. 외부 노출용 타입(`PageInfo` 등)은 여전히
 * `src/types/index.ts` 의 정의를 그대로 사용한다.
 */

import type { SpaFramework } from '../spa-readiness';
import type { PageInfo } from '@/types';

export interface CrawlerOptions {
  maxDepth?: number;
  maxPages?: number;
  excludePatterns?: RegExp[];
  includePatterns?: RegExp[];
  headless?: boolean;
  /** 기본 true. false 일 때 sitemap.xml 보충 비활성. */
  enableSitemap?: boolean;
  /** 사용자 정의 ready selector — 페이지마다 hydration 후 추가 대기 */
  readySelector?: string;
  /** 크롤링 동시성 (기본: 로컬 3, Vercel 1). 메모리 ≈ 페이지당 ~50MB × concurrency. */
  crawlConcurrency?: number;
}

export interface CrawlSourceCounts {
  fromCrawl: number;
  fromSitemap: number;
}

export interface CrawlResult {
  pages: PageInfo[];
  totalFound: number;
  errors: string[];
  /** 라우트 출처 카운트 — Audit summary 의 spa.routes* 로 사용 */
  sourceCounts: CrawlSourceCounts;
  /** 첫 페이지 로드 시 자동 감지된 프레임워크 (자동 SPA 모드 결정에 사용) */
  detectedFramework: SpaFramework;
}

/** BFS 큐의 단일 항목 — core.ts 내부에서만 사용. */
export interface QueueItem {
  url: string;
  depth: number;
  path: string[];
  linkText?: string;
  source: 'start' | 'sitemap' | 'crawl';
}

/** History API hook 이 호출하는 sink 시그니처 */
export type RouteCaptureSink = (url: string) => void;
