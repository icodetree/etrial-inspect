import { WebCrawler } from '@/lib/crawler';
import { AccessibilityAuditor } from '@/lib/accessibility-auditor';
import { Violation, AuditResult, PageInfo, AuditConfig } from '@/types';
import type { SEOAnalysisResult } from '@/types/seo';
import type {
  AltTextAuditResult,
  AltTextJudgment,
  AltTextScanResult,
} from '@/types/alt-text';
import * as fs from 'fs';
import * as path from 'path';
import { seoAuditService } from './SEOAuditService';
import { getBrowserErrorGuide, getBrowserLaunchOptions } from '@/lib/browser-utils';
import { chromium } from 'playwright-core';
import { scanPageForAltMismatches, shutdownSharedWorkerPool } from '@/lib/alt-text-validator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runAudit(config: AuditConfig, onProgress?: (data: any) => void): Promise<AuditResult> {
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
    throw new Error('진단 옵션을 최소 한 가지 이상 선택해주세요. (웹접근성 / SEO / AI 친화도)');
  }
  const needsCrawl = needsAccessibility;

  // 1. Login Phase
  if (config.enableLogin && config.loginUrl) {
    log('🔐 로그인 프로세스 시작... (브라우저 창을 확인하세요)');
    const loginCrawler = new WebCrawler({
      headless: false
    });

    try {
      await loginCrawler.init();
      const loginSuccess = await loginCrawler.login(config.loginUrl, config.targetUrl);

      if (loginSuccess) {
        log('✅ 로그인 성공 감지');
        await loginCrawler.saveStorageState(authStatePath);
      } else {
        console.warn('⚠️ 로그인 실패 또는 타임아웃, 비로그인 상태로 진행');
      }
    } catch (e) {
      console.error('로그인 중 에러:', e);
    } finally {
      await loginCrawler.close();
    }
  }

  // 2. Crawler Init
  const isVercel = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  // 사용자 입력 제외 경로 → RegExp 변환
  const userExcludePatterns: RegExp[] = (config.excludePaths || '')
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`${escaped}(\\/|$|\\?)`, 'i');
    });

  const crawler = new WebCrawler({
    maxDepth: config.maxDepth ?? (isVercel ? 2 : 10),
    maxPages: config.maxPages ?? (isVercel ? 5 : 1000),
    headless: true,
    // 기본 제외 패턴 + 사용자 제외 경로를 병합 (spread로 덮어쓰기 방지)
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

  const auditor = new AccessibilityAuditor({
    enableDynamicCheck: true,
    screenshotOnViolation: true,
    headless: true,
  });

  try {
    let pages: PageInfo[];
    if (needsCrawl) {
      log('🕷️ 크롤러 초기화 중...');
      try {
        await crawler.init();
      } catch (e) {
        const guide = getBrowserErrorGuide(e);
        throw new Error(`크롤러 초기화 실패: ${guide}`);
      }

      if (config.enableLogin && fs.existsSync(authStatePath)) {
        await crawler.loadStorageState(authStatePath);
      }

      // 3. Crawling
      log(`🔍 페이지 크롤링 시작: ${config.targetUrl}`);
      const crawlResult = await crawler.crawl(config.targetUrl, (progress) => {
        log(`  크롤링: ${progress.current}/${progress.found} - ${progress.url}`);
      });

      log(`✅ 크롤링 완료: ${crawlResult.pages.length}개 페이지 발견`);
      pages = crawlResult.pages;
    } else {
      // SEO/AI만 선택된 경우 — 크롤링 없이 targetUrl 1개만 분석 대상으로
      log('ℹ️ 크롤링이 필요한 옵션이 없어 크롤링을 건너뜁니다 (대상 URL만 분석).');
      pages = [{
        url: config.targetUrl,
        title: '',
        depth1: '',
        depth2: '',
        depth3: '',
        depth4: '',
      }];
    }

    const violations: Violation[] = [];
    let violationNumber = 0;

    // 4. Accessibility Check
    const uniqueViolationMap = new Map<string, Violation>();
    if (needsAccessibility) {
      log('♿ 접근성 검사 시작...');
      try {
        await auditor.init();
      } catch (e) {
        const guide = getBrowserErrorGuide(e);
        throw new Error(`접근성 검사 엔진 초기화 실패: ${guide}`);
      }

      if (config.enableLogin && fs.existsSync(authStatePath)) {
        await auditor.loadStorageState(authStatePath);
      }

      const COMMON_UI_REGEX = /(header|footer|nav|gnb|lnb|sidebar|aside|menu|global)/i;

      // Concurrency Control
      const CONCURRENCY_LIMIT = 5;
      let completedCount = 0;
      let nextPageIndex = 0;

      const auditPageWrapper = async (page: PageInfo, index: number) => {
        log(`  검사 시작 (${index + 1}/${pages.length}): ${page.url}`);

        try {
          const auditResult = await auditor.auditPage(page.url);

          for (const kwcagViolation of auditResult.violations) {
            for (const node of kwcagViolation.nodes) {
              const selector = node.target && node.target.length > 0 ? node.target.join(' > ') : '';
              const signature = `${kwcagViolation.axeRuleId}||${selector}||${node.html}`;
              const isCommonUI = COMMON_UI_REGEX.test(selector);

              if (uniqueViolationMap.has(signature)) {
                const existing = uniqueViolationMap.get(signature)!;
                if (existing.occurrenceCount !== undefined) {
                  existing.occurrenceCount++;
                }
                continue;
              }

              violationNumber++; // Note: strictly speaking this isn't atomic but JS is single threaded event loop so it's fine
              const violation: Violation = {
                pageUrl: page.url,
                pageTitle: page.title,
                depth1: page.depth1,
                depth2: page.depth2,
                depth3: page.depth3,
                depth4: page.depth4,
                platform: config.platform || 'PC',
                inspector: config.inspector || '시스템',
                inspectionDate: new Date().toLocaleDateString('ko-KR'),
                violationNumber,
                kwcagId: kwcagViolation.kwcagId,
                kwcagName: kwcagViolation.kwcagName,
                principle: kwcagViolation.principle,
                axeRuleId: kwcagViolation.axeRuleId,
                description: kwcagViolation.description,
                impact: kwcagViolation.impact,
                affectedCode: node.html,
                help: kwcagViolation.help || node.failureSummary,
                helpUrl: kwcagViolation.helpUrl,
                selector: selector,
                occurrenceCount: 1,
                isCommon: isCommonUI,
                boundingBox: node.boundingBox,
                screenshotPath: auditResult.screenshotPaths?.[0]
              };

              uniqueViolationMap.set(signature, violation);
              violations.push(violation);
            }
          }
        } catch (error) {
          console.error(`  ❌ 검사 오류 (${page.url}):`, error);
          log(`❌ 검사 오류: ${page.url}`);
        } finally {
          completedCount++;
          if (onProgress) {
            onProgress({ type: 'progress', current: completedCount, total: pages.length, url: page.url });
          }
          log(`  검사 완료 (${completedCount}/${pages.length}): ${page.url}`);
        }
      };

      const worker = async () => {
        while (nextPageIndex < pages.length) {
          const currentIndex = nextPageIndex++;
          const page = pages[currentIndex];
          await auditPageWrapper(page, currentIndex);
        }
      };

      // Start workers
      const workers = Array(Math.min(pages.length, CONCURRENCY_LIMIT))
        .fill(null)
        .map(() => worker());

      await Promise.all(workers);

      await auditor.close();
    }

    if (needsAccessibility) {
      log('✅ 접근성 검사 완료');
    }

    if (needsCrawl) {
      await crawler.close();
    }

    // 5. SEO & AI Audit — 각 옵션을 독립적으로 분리 실행
    let seoResult: SEOAnalysisResult | undefined;
    if (needsSEO || needsAI) {
      const label = needsSEO && needsAI ? 'SEO · AI 친화도' : needsSEO ? 'SEO' : 'AI 친화도';
      log(`🌐 ${label} 분석을 시작합니다...`);
      try {
        // 기존 auditor 브라우저 재사용, 없으면 새로 생성
        let browser = auditor.getBrowser();
        let ownBrowser = false;
        if (!browser) {
          const launchOptions = await getBrowserLaunchOptions(true);
          browser = await chromium.launch(launchOptions);
          ownBrowser = true;
        }
        try {
          seoResult = await seoAuditService.runFullAudit(browser, config.targetUrl, {
            includeSEO: needsSEO,
            includeAI: needsAI,
          });
          log(`✅ ${label} 분석 완료 (종합 점수: ${seoResult.score})`);
        } finally {
          if (ownBrowser && browser) {
            await browser.close();
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`❌ ${label} 분석 중 오류 발생: ${errorMsg}`);
        console.error('SEO/AI Audit Error:', error);
      }
    }

    const endTime = new Date().toISOString();

    const summary = {
      byPrinciple: {} as Record<string, number>,
      byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 } as Record<string, number>,
      byKwcagItem: {} as Record<string, number>,
    };

    violations.forEach((v) => {
      summary.byPrinciple[v.principle] = (summary.byPrinciple[v.principle] || 0) + 1;
      summary.byImpact[v.impact] = (summary.byImpact[v.impact] || 0) + 1;
      summary.byKwcagItem[v.kwcagId] = (summary.byKwcagItem[v.kwcagId] || 0) + 1;
    });

    const result: AuditResult = {
      startTime,
      endTime,
      totalPages: pages.length,
      totalViolations: violations.length,
      pages,
      violations,
      seoResult,
      summary,
    };

    log('✅ 진단 완료');
    return result;

  } catch (error) {
    try { await crawler.close(); } catch { }
    try { await auditor.close(); } catch { }
    throw error;
  }
}

/**
 * standalone 모드: 감사 없이 특정 URL들만 OCR 스캔
 * Phase 4에서 추가됨 — /api/alt-text-scan 엔드포인트에서 사용
 */
export async function runStandaloneAltTextScan(
  urls: string[],
  options: { maxImagesPerPage?: number } = {},
): Promise<AltTextScanResult[]> {
  const maxImagesPerPage = options.maxImagesPerPage ?? 20;
  const launchOptions = await getBrowserLaunchOptions(true);
  const browser = await chromium.launch(launchOptions);
  const results: AltTextScanResult[] = [];

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    for (const url of urls) {
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        try {
          await page.waitForLoadState('networkidle', { timeout: 8000 });
        } catch {}
        const scan = await scanPageForAltMismatches(page, { maxImages: maxImagesPerPage });
        results.push(scan);
      } catch (e) {
        console.error(`[Standalone AltText] ${url}:`, e);
      } finally {
        await page.close();
      }
    }
    await ctx.close();
  } finally {
    await browser.close();
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onProgress?: (data: any) => void,
): Promise<AltTextAuditResult> {
  const startTime = new Date().toISOString();

  const log = (message: string) => {
    console.log(message);
    if (onProgress) onProgress({ type: 'log', message });
  };

  const isVercel = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  const userExcludePatterns: RegExp[] = (config.excludePaths || '')
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => {
      const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`${escaped}(\\/|$|\\?)`, 'i');
    });

  const crawler = new WebCrawler({
    maxDepth: config.maxDepth ?? (isVercel ? 2 : 10),
    maxPages: config.maxPages ?? (isVercel ? 5 : 1000),
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

  const launchOptions = await getBrowserLaunchOptions(true);
  const browser = await chromium.launch(launchOptions);
  const scans: AltTextScanResult[] = [];

  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let done = 0;
    for (const page of crawledPages) {
      const ocrPage = await ctx.newPage();
      try {
        await ocrPage.goto(page.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        try {
          await ocrPage.waitForLoadState('networkidle', { timeout: 8000 });
        } catch { /* proceed */ }
        const scan = await scanPageForAltMismatches(ocrPage, { maxImages: maxImagesPerPage });
        scans.push(scan);
        done++;
        log(`  🖼️ OCR 완료 (${done}/${crawledPages.length}): ${page.url} — 이미지 ${scan.totalImagesScanned}장, 불일치 ${scan.mismatchCount}건`);
        if (onProgress) {
          onProgress({ type: 'alt-text-progress', current: done, total: crawledPages.length, url: page.url });
        }
      } catch (e) {
        console.error(`[CrawlAltText] ${page.url}:`, e);
        log(`  ⚠️ OCR 오류 (${page.url}): ${e instanceof Error ? e.message : e}`);
      } finally {
        await ocrPage.close();
      }
    }
    await ctx.close();
  } finally {
    await browser.close();
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
  };
}
