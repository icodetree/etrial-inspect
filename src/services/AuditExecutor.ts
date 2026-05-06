/**
 * AuditExecutor — 진단 오케스트레이터 facade.
 *
 * 본 모듈은 외부에 노출되는 entry point 만 유지하고, 실제 로직은
 * `src/services/audit/phases/` 하위로 분해되어 있다 (Phase 3-2):
 *
 *   - phases/login.ts      — 로그인 + storageState 작성
 *   - phases/crawl.ts      — 사이트맵 + 런타임 라우트 발견
 *   - phases/a11y.ts       — axe-core 진단 + KWCAG 매핑 + 동시성 5 워커
 *   - phases/seo.ts        — SEO / AI 친화도 분석 (브라우저 재사용)
 *   - phases/summarize.ts  — 위반 집계 + reliability/SPA 메트릭 + warnings
 *
 * abort 흐름의 부분 결과 반환 계약은 본 facade 의 try/catch/finally 가 책임진다.
 * (각 phase 도 자체적으로 signal 을 체크하지만, 누적 violations 배열을 facade 가
 * 소유하고 finally 에서 리소스 정리를 보장해 안전망 역할.)
 */
import * as fs from 'fs';
import * as path from 'path';
import type {
  AuditConfig,
  AuditResult,
  PageInfo,
  ProgressCallback,
  Violation,
} from '@/types';
import type { SEOAnalysisResult } from '@/types/seo';
import type {
  AltTextAuditResult,
  AltTextJudgment,
  AltTextScanResult,
} from '@/types/alt-text';
import {
  scanPageForAltMismatches,
  shutdownSharedWorkerPool,
} from '@/lib/alt-text-validator';
import { openBrowserSession } from '@/lib/browser-session';
import { WebCrawler } from '@/lib/crawler';
import { buildExcludePatterns, getRuntimeProfile } from '@/lib/runtime-config';
import { waitForSpaReady } from '@/lib/spa-readiness';
import { getBrowserErrorGuide } from '@/lib/browser-utils';
import { runLoginPhase } from './audit/phases/login';
import { runCrawlPhase } from './audit/phases/crawl';
import { runA11yPhase } from './audit/phases/a11y';
import { runSeoPhase } from './audit/phases/seo';
import { buildAbortPartialSummary, summarize } from './audit/phases/summarize';
import type { PageAuditResult } from '@/lib/accessibility-auditor';

/**
 * 진단을 실행하고 AuditResult 를 반환한다.
 *
 * abort signal 이 트리거되면 그 시점까지 누적된 결과로 부분 보고서를 만든다.
 */
export async function runAudit(
  config: AuditConfig,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<AuditResult> {
  const startTime = new Date().toISOString();
  // TODO: Make this path configurable for Electron (userData)
  const authStatePath = path.resolve(process.cwd(), 'auth_state.json');

  const log = (message: string) => {
    console.log(message);
    if (onProgress) onProgress({ type: 'log', message });
  };

  // 0. 옵션 검증 — 최소 한 가지 진단 옵션은 선택되어야 함
  // 이미지 대체텍스트(OCR) 진단은 별도 페이지(/alttext)로 분리되었음
  const needsAccessibility = config.enableAccessibilityCheck === true;
  const needsSEO = config.enableSEOCheck === true;
  const needsAI = config.enableAICheck === true;
  if (!needsAccessibility && !needsSEO && !needsAI) {
    throw new Error(
      '진단 옵션을 최소 한 가지 이상 선택해주세요. (웹접근성 / SEO / AI 친화도)',
    );
  }
  const needsCrawl = needsAccessibility;

  // catch/finally 블록(특히 abort)에서 부분 결과를 만들 수 있도록 try 바깥에 누적 변수 선언
  let pages: PageInfo[] = [];
  const violations: Violation[] = [];
  let pageAuditResults: PageAuditResult[] = [];
  let routeSourceCounts: { fromCrawl: number; fromSitemap: number } = {
    fromCrawl: 0,
    fromSitemap: 0,
  };

  // facade 가 close 책임을 갖는 리소스
  let crawler: WebCrawler | null = null;
  let auditor: import('@/lib/accessibility-auditor').AccessibilityAuditor | null = null;

  try {
    // 1. 로그인
    await runLoginPhase({ config, authStatePath, log });
    const useStorageState = !!config.enableLogin && fs.existsSync(authStatePath);

    // 2/3. 크롤링
    const crawlPhase = await runCrawlPhase({
      config,
      authStatePath,
      useStorageState,
      signal,
      onProgress,
      log,
      needsCrawl,
    });
    crawler = crawlPhase.crawler;
    pages = crawlPhase.pages;
    routeSourceCounts = crawlPhase.routeSourceCounts;

    // 4. 접근성 검사
    if (needsAccessibility) {
      const a11yPhase = await runA11yPhase({
        config,
        authStatePath,
        useStorageState,
        pages,
        signal,
        onProgress,
        log,
        violations,
      });
      auditor = a11yPhase.auditor;
      pageAuditResults = a11yPhase.pageAuditResults;
    }

    // crawler 는 a11y phase 가 끝났으면 더 사용하지 않음 — 미리 닫아 리소스 절약
    if (crawler) {
      try { await crawler.close(); } catch { /* ignore */ }
      crawler = null;
    }

    // 5. SEO / AI — 가능한 경우 auditor 의 브라우저 재사용
    let seoResult: SEOAnalysisResult | undefined;
    if ((needsSEO || needsAI) && !signal?.aborted) {
      seoResult = await runSeoPhase({
        config,
        needsSEO,
        needsAI,
        reusableBrowser: auditor?.getBrowser() ?? null,
        signal,
        log,
      });
    }

    // 6. 집계
    const { summary, warnings } = summarize({
      config,
      needsCrawl,
      needsAccessibility,
      pages,
      violations,
      pageAuditResults,
      routeSourceCounts,
      signal,
    });

    const result: AuditResult = {
      startTime,
      endTime: new Date().toISOString(),
      totalPages: pages.length,
      totalViolations: violations.length,
      pages,
      violations,
      seoResult,
      warnings: warnings.length > 0 ? warnings : undefined,
      summary,
    };

    log(signal?.aborted ? '🛑 진단 취소됨 (부분 결과)' : '✅ 진단 완료');
    return result;
  } catch (error) {
    // abort 흐름에서 어딘가가 throw 했어도 — 부분 결과를 반환할 수 있는 만큼 모아 반환
    if (signal?.aborted) {
      const { summary, warnings } = buildAbortPartialSummary(
        pages?.length ?? 0,
        violations.length,
      );
      const partial: AuditResult = {
        startTime,
        endTime: new Date().toISOString(),
        totalPages: pages?.length ?? 0,
        totalViolations: violations.length,
        pages: pages ?? [],
        violations,
        warnings,
        summary,
      };
      log('🛑 진단 취소됨 (부분 결과 — 예외 흐름)');
      return partial;
    }
    throw error;
  } finally {
    // 어떤 흐름이든 리소스 정리 보장
    if (crawler) {
      try { await crawler.close(); } catch { /* ignore */ }
    }
    if (auditor) {
      try { await auditor.close(); } catch { /* ignore */ }
    }
  }
}

/**
 * standalone 모드: 감사 없이 특정 URL들만 OCR 스캔.
 * Phase 4에서 추가됨 — /api/alt-text-scan 엔드포인트에서 사용.
 */
export async function runStandaloneAltTextScan(
  urls: string[],
  options: { maxImagesPerPage?: number } = {},
): Promise<AltTextScanResult[]> {
  const maxImagesPerPage = options.maxImagesPerPage ?? 20;
  const session = await openBrowserSession({
    isHeadless: true,
    viewport: { width: 1280, height: 800 },
  });
  const results: AltTextScanResult[] = [];

  try {
    for (const url of urls) {
      const page = await session.context.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const spaReady = await waitForSpaReady(page);
        const scan = await scanPageForAltMismatches(page, {
          maxImages: maxImagesPerPage,
          spaReadyResult: spaReady,
        });
        results.push(scan);
      } catch (e) {
        console.error(`[Standalone AltText] ${url}:`, e);
      } finally {
        await page.close();
      }
    }
  } finally {
    await session.close();
    await shutdownSharedWorkerPool();
  }

  return results;
}

/**
 * 대표 URL을 크롤링하여 발견된 모든 페이지에 OCR을 실행하고
 * 단일 AltTextAuditResult로 합쳐 반환한다 — /api/alttext/crawl-scan에서 사용.
 */
export interface CrawlAltTextAuditConfig {
  targetUrl: string;
  inspector?: string;
  maxPages?: number;
  maxDepth?: number;
  excludePaths?: string;
  maxImagesPerPage?: number;
}

export async function runCrawlAltTextAudit(
  config: CrawlAltTextAuditConfig,
  onProgress?: ProgressCallback,
): Promise<AltTextAuditResult> {
  const startTime = new Date().toISOString();

  const log = (message: string) => {
    console.log(message);
    if (onProgress) onProgress({ type: 'log', message });
  };

  const profile = getRuntimeProfile();
  const userExcludePatterns: RegExp[] = buildExcludePatterns(config.excludePaths);

  const crawler = new WebCrawler({
    maxDepth: config.maxDepth ?? profile.maxDepth,
    maxPages: config.maxPages ?? profile.maxPages,
    headless: true,
    excludePatterns: [
      /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|exe|dmg)$/i,
      /logout/i,
      /delete/i,
      /signout/i,
      /#$/,
      /javascript:/i,
      /mailto:/i,
      /tel:/i,
      ...userExcludePatterns,
    ],
  });

  const maxImagesPerPage = config.maxImagesPerPage ?? 20;

  log('🕷️ 크롤러 초기화 중...');
  try {
    await crawler.init();
  } catch (e) {
    const guide = getBrowserErrorGuide(e);
    throw new Error(`크롤러 초기화 실패: ${guide}`);
  }

  let crawledPages: PageInfo[];
  try {
    log(`🔍 페이지 크롤링 시작: ${config.targetUrl}`);
    const crawlResult = await crawler.crawl(config.targetUrl, (p) => {
      log(`  크롤링: ${p.current}/${p.found} - ${p.url}`);
    });
    crawledPages = crawlResult.pages;
    log(`✅ 크롤링 완료: ${crawledPages.length}개 페이지 발견`);
  } finally {
    try { await crawler.close(); } catch { /* ignore */ }
  }

  const session = await openBrowserSession({
    isHeadless: true,
    viewport: { width: 1280, height: 800 },
  });
  const scans: AltTextScanResult[] = [];
  let firstSpaReady: Awaited<ReturnType<typeof waitForSpaReady>> | null = null;

  try {
    let done = 0;
    for (const page of crawledPages) {
      const ocrPage = await session.context.newPage();
      try {
        await ocrPage.goto(page.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const spaReady = await waitForSpaReady(ocrPage);
        if (!firstSpaReady) firstSpaReady = spaReady;
        const scan = await scanPageForAltMismatches(ocrPage, {
          maxImages: maxImagesPerPage,
          spaReadyResult: spaReady,
        });
        scans.push(scan);
        done++;
        log(
          `  🖼️ OCR 완료 (${done}/${crawledPages.length}): ${page.url} — 이미지 ${scan.totalImagesScanned}장, 불일치 ${scan.mismatchCount}건`,
        );
        if (onProgress) {
          onProgress({
            type: 'alt-text-progress',
            current: done,
            total: crawledPages.length,
            url: page.url,
          });
        }
      } catch (e) {
        console.error(`[CrawlAltText] ${page.url}:`, e);
        log(`  ⚠️ OCR 오류 (${page.url}): ${e instanceof Error ? e.message : e}`);
      } finally {
        await ocrPage.close();
      }
    }
  } finally {
    await session.close();
    await shutdownSharedWorkerPool();
  }

  // 합산 — countsByJudgment, totalImages, totalMismatches
  const counts: Record<AltTextJudgment, number> = {
    pass: 0,
    missing_alt: 0,
    decorative_mismatch: 0,
    text_mismatch: 0,
    review_needed: 0,
  };
  let totalImages = 0;
  let totalMismatches = 0;
  for (const scan of scans) {
    totalImages += scan.totalImagesScanned;
    totalMismatches += scan.mismatchCount;
    for (const k of Object.keys(scan.countsByJudgment) as AltTextJudgment[]) {
      counts[k] += scan.countsByJudgment[k] ?? 0;
    }
  }

  return {
    startTime,
    endTime: new Date().toISOString(),
    targetUrls: [config.targetUrl],
    inspector: config.inspector || undefined,
    totalUrls: crawledPages.length,
    totalImagesScanned: totalImages,
    totalMismatches,
    countsByJudgment: counts,
    scans,
    options: { maxImagesPerPage },
    siteInfo: firstSpaReady
      ? {
          framework: firstSpaReady.framework,
          renderStrategy: firstSpaReady.renderStrategy,
          hydrationMs: firstSpaReady.hydrationMs,
          spaReadyStatus: firstSpaReady.status,
          notes: firstSpaReady.notes,
        }
      : undefined,
  };
}
