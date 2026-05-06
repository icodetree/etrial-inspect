/**
 * AuditExecutor phase 모듈 간 공유 타입.
 *
 * Phase 3-2 분해 시점에서 phase 별 입출력 인터페이스를 한 곳에 모아
 * 순환 의존을 피하면서 각 phase 모듈이 동일한 데이터 모양을 합의한다.
 */
import type { PageAuditResult } from '@/lib/accessibility-auditor';
import type {
  AuditConfig,
  PageInfo,
  ProgressCallback,
  Violation,
} from '@/types';

export interface CrawlPhaseInput {
  config: AuditConfig;
  /** 로그인 단계가 작성한 storageState 파일 경로. fs.existsSync 로 사용 여부 결정. */
  authStatePath: string;
  /** 로그인 storageState 사용 여부 (config.enableLogin && fs.existsSync(authStatePath)). */
  useStorageState: boolean;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  log: (message: string) => void;
}

export interface CrawlPhaseResult {
  pages: PageInfo[];
  /** routesFromCrawl / routesFromSitemap — summarize phase 의 SPA 메트릭에서 사용. */
  routeSourceCounts: { fromCrawl: number; fromSitemap: number };
}

export interface A11yPhaseInput {
  config: AuditConfig;
  authStatePath: string;
  useStorageState: boolean;
  pages: PageInfo[];
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
  log: (message: string) => void;
  /** 누적 violations 배열 — abort 시 부분 결과로 노출되어야 하므로 호출자가 소유. */
  violations: Violation[];
}

export interface A11yPhaseResult {
  /** 페이지별 진단 결과 — summarize phase 의 reliability/SPA 메트릭에서 사용. */
  pageAuditResults: PageAuditResult[];
}

export interface SeoPhaseInput {
  config: AuditConfig;
  needsSEO: boolean;
  needsAI: boolean;
  /** 재사용 가능한 브라우저 인스턴스. 없으면 phase 가 자체 브라우저를 생성. */
  reusableBrowser: import('playwright-core').Browser | null;
  signal?: AbortSignal;
  log: (message: string) => void;
}

export interface SummarizePhaseInput {
  config: AuditConfig;
  needsCrawl: boolean;
  needsAccessibility: boolean;
  pages: PageInfo[];
  violations: Violation[];
  pageAuditResults: PageAuditResult[];
  routeSourceCounts: { fromCrawl: number; fromSitemap: number };
  signal?: AbortSignal;
}
