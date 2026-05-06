/**
 * Phase: 크롤링 (사이트맵 + 런타임 라우트 발견).
 *
 * `runAudit` 의 약 73~158 LOC 에서 추출:
 *   1) WebCrawler 인스턴스 init
 *   2) (옵션) storageState 로드
 *   3) crawl() 호출 + signal 통과
 *   4) `needsCrawl=false` 면 targetUrl 1개를 가짜 PageInfo 로 반환 (SEO/AI 단독 흐름)
 *
 * 호출자는 반환된 `crawler` 인스턴스를 audit 종료 시 close 해야 한다.
 * 본 phase 는 crawler 를 close 하지 않는다 — finally 블록에서 일괄 정리되는
 * 기존 흐름을 보존하기 위해.
 */
import { WebCrawler } from '@/lib/crawler';
import { getBrowserErrorGuide } from '@/lib/browser-utils';
import { buildExcludePatterns, getRuntimeProfile } from '@/lib/runtime-config';
import * as fs from 'fs';
import type { PageInfo } from '@/types';
import type { CrawlPhaseInput, CrawlPhaseResult } from '../types';

/** 기본 제외 패턴 — 이미지/문서/소셜 액션/JS 가짜링크 등. */
const DEFAULT_EXCLUDE_PATTERNS: RegExp[] = [
  /\.(jpg|jpeg|png|gif|svg|webp|ico|pdf|zip|exe|dmg)$/i,
  /logout/i,
  /delete/i,
  /signout/i,
  /#$/,
  /javascript:/i,
  /mailto:/i,
  /tel:/i,
];

export interface RunCrawlPhaseResult extends CrawlPhaseResult {
  /** 호출자가 finally 에서 close 해야 하는 crawler 인스턴스. */
  crawler: WebCrawler;
}

/**
 * 크롤링 phase 를 실행한다.
 *
 * `needsCrawl=true` 인 경우(접근성 검사 활성)만 실제 크롤링을 수행하고, 그렇지 않으면
 * targetUrl 1개를 가진 더미 PageInfo 배열을 반환한다 (SEO/AI 단독 흐름).
 *
 * 어느 경우든 `crawler` 는 init 까지 마친 상태로 반환되어 호출자가 close 책임을 갖는다.
 */
export async function runCrawlPhase(
  input: CrawlPhaseInput & { needsCrawl: boolean },
): Promise<RunCrawlPhaseResult> {
  const { config, authStatePath, useStorageState, signal, onProgress, log, needsCrawl } = input;

  const profile = getRuntimeProfile();
  const userExcludePatterns: RegExp[] = buildExcludePatterns(config.excludePaths);

  const crawler = new WebCrawler({
    maxDepth: config.maxDepth ?? profile.maxDepth,
    maxPages: config.maxPages ?? profile.maxPages,
    headless: true,
    readySelector: config.readySelector,
    excludePatterns: [...DEFAULT_EXCLUDE_PATTERNS, ...userExcludePatterns],
  });

  if (!needsCrawl) {
    // SEO/AI 만 선택된 경우 — 크롤링 없이 targetUrl 1개만 분석 대상으로
    log('ℹ️ 크롤링이 필요한 옵션이 없어 크롤링을 건너뜁니다 (대상 URL만 분석).');
    const pages: PageInfo[] = [
      {
        url: config.targetUrl,
        title: '',
        depth1: '',
        depth2: '',
        depth3: '',
        depth4: '',
      },
    ];
    return {
      crawler,
      pages,
      routeSourceCounts: { fromCrawl: 0, fromSitemap: 0 },
    };
  }

  log('🕷️ 크롤러 초기화 중...');
  try {
    await crawler.init();
  } catch (e) {
    const guide = getBrowserErrorGuide(e);
    throw new Error(`크롤러 초기화 실패: ${guide}`);
  }

  if (useStorageState && fs.existsSync(authStatePath)) {
    await crawler.loadStorageState(authStatePath);
  }

  log(`🔍 페이지 크롤링 시작: ${config.targetUrl}`);
  const crawlResult = await crawler.crawl(
    config.targetUrl,
    (progress) => {
      log(`  크롤링: ${progress.current}/${progress.found} - ${progress.url}`);
      if (onProgress) {
        onProgress({
          type: 'progress',
          current: progress.current,
          total: progress.found,
          url: progress.url,
        });
      }
    },
    signal,
  );

  log(`✅ 크롤링 완료: ${crawlResult.pages.length}개 페이지 발견`);
  if (crawlResult.detectedFramework !== 'unknown') {
    log(`🔎 SPA 감지: ${crawlResult.detectedFramework} — 자동 발견 활성`);
  }

  return {
    crawler,
    pages: crawlResult.pages,
    routeSourceCounts: crawlResult.sourceCounts,
  };
}
