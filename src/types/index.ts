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
  summary: {
    byPrinciple: Record<string, number>;
    byImpact: Record<string, number>;
    byKwcagItem: Record<string, number>;
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
