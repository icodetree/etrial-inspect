// TypeScript 타입 정의
import { SEOAuditResult } from './seo';

export interface AuditConfig {
  targetUrl: string;
  enableLogin: boolean;
  loginUrl?: string;
  loginId?: string;
  loginPassword?: string;
  enableAccessibilityCheck: boolean;
  enableSEOCheck?: boolean;
  enableAICheck?: boolean;
  platform: 'PC' | 'Mobile';
  inspector: string;
  excludePaths?: string;
  maxPages?: number;   // 크롤링 최대 페이지 수 (미입력 시 환경별 기본값)
  maxDepth?: number;   // 크롤링 최대 깊이 (미입력 시 환경별 기본값)
  /** 페이지 진단 시 추가로 대기할 사용자 정의 selector (예: "#app .loaded") */
  readySelector?: string;
}

export interface PageInfo {
  url: string;
  title: string;
  depth1: string;
  depth2: string;
  depth3: string;
  depth4: string;
}

export interface HistoryItem {
  id: string;
  url: string;
  date: string;
  score: number;
  violationCount: number;
  reportLink: string | null;
  artifactName?: string; // GitHub Actions Artifact 이름
  screenshotUrl?: string; // GitHub Pages Screenshot URL
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViolationNode {
  html: string;
  target: string[];
  failureSummary: string;
  boundingBox?: BoundingBox;
}

export interface Violation {
  pageUrl: string;
  pageTitle: string;
  depth1: string;
  depth2: string;
  depth3: string;
  depth4: string;
  platform: string;
  inspector: string;
  inspectionDate: string;
  violationNumber: number;
  kwcagId: string;
  kwcagName: string;
  principle: string;
  axeRuleId: string;
  description: string;
  impact: string;
  affectedCode: string;
  help: string;
  helpUrl: string;
  selector?: string; // CSS Selector or XPath
  occurrenceCount?: number; // Count of duplicate occurrences across pages
  isCommon?: boolean; // Flag for common UI/Template violation
  screenshotPath?: string; // Path to the full-page screenshot
  boundingBox?: BoundingBox; // Coordinates of the violation
}

export type SpaFrameworkLabel =
  | 'react'
  | 'next'
  | 'vue'
  | 'nuxt'
  | 'angular'
  | 'unknown';

export type RenderStrategyLabel = 'CSR' | 'SSR' | 'SSG' | 'unknown';

export interface AuditReliabilitySummary {
  pagesAudited: number;
  pagesFailed: number;
  pagesPartial: number;
  avgDomNodes: number;
  avgHydrationMs: number;
}

export interface AuditSpaSummary {
  detectedFramework: SpaFrameworkLabel;
  renderStrategy: RenderStrategyLabel;
  /** 휴리스틱 — 1) 프레임워크 감지됨 또는 2) 평균 DOM 매우 적음 + 단일 페이지 또는 3) 라우트 0개 */
  suspectedSpa: boolean;
  routesFromCrawl: number;
  routesFromSitemap: number;
}

export interface AuditResult {
  startTime: string;
  endTime: string;
  totalPages: number;
  totalViolations: number;
  pages: PageInfo[];
  violations: Violation[];
  seoResult?: SEOAuditResult;
  artifactName?: string; // GitHub Actions Artifact 이름 (e.g., "screenshots-123456")
  screenshotUrl?: string; // GitHub Pages Screenshot URL
  /** 사용자에게 노출할 경고 메시지 (예: "라우트 0개 — 시드 URL 입력 권장") */
  warnings?: string[];
  /** 위반 목록이 잘린 경우 절단 사유 메시지 */
  _truncated?: string;
  summary: {
    byPrinciple: Record<string, number>;
    byImpact: Record<string, number>;
    byKwcagItem: Record<string, number>;
    /** 진단 신뢰도 메트릭 — SPA 진단 결과의 정상/부분/실패 분포 */
    reliability?: AuditReliabilitySummary;
    /** SPA 감지/라우트 출처 메타데이터 */
    spa?: AuditSpaSummary;
  };
}

export interface CrawlProgress {
  status: 'crawling' | 'auditing' | 'completed' | 'error';
  currentUrl?: string;
  totalFound: number;
  processed: number;
  violations: number;
  message?: string;
}

/**
 * AuditExecutor 가 onProgress 콜백으로 발행하는 이벤트 형식.
 * 호출자(API SSE 라우트, UI, 테스트)는 type 필드 기반 discriminated union 으로
 * 패턴 매칭하여 사용한다.
 */
export type ProgressLogEvent = {
  type: 'log';
  message: string;
};

export type ProgressCrawlEvent = {
  type: 'progress';
  current: number;
  total: number;
  url: string;
};

export type ProgressAltTextEvent = {
  type: 'alt-text-progress';
  current: number;
  total: number;
  url: string;
};

export type ProgressEvent =
  | ProgressLogEvent
  | ProgressCrawlEvent
  | ProgressAltTextEvent;

export type ProgressCallback = (event: ProgressEvent) => void;
