/**
 * Phase: SEO / AI 친화도 분석.
 *
 * `runAudit` 의 약 278~308 LOC 에서 추출:
 *   1) (선택) 기존 a11y phase 의 브라우저 인스턴스 재사용 — 비용 절감
 *   2) 없으면 자체 chromium.launch 로 임시 브라우저 생성 후 종료 시 close
 *   3) seoAuditService.runFullAudit 호출
 *   4) 실패 시 throw 하지 않고 로그만 남기고 undefined 반환 — 감사 블로킹 금지
 */
import { chromium } from 'playwright-core';
import { getBrowserLaunchOptions } from '@/lib/browser-utils';
import { seoAuditService } from '@/services/SEOAuditService';
import type { SEOAnalysisResult } from '@/types/seo';
import type { SeoPhaseInput } from '../types';

/**
 * SEO/AI 친화도 phase 를 실행한다.
 *
 * abort 후에는 호출되지 않는 것이 호출자의 책임이지만, 안전하게 한 번 더 체크.
 * 실패 시 throw 하지 않고 undefined 를 반환해 다른 phase 의 결과는 보존되도록 한다.
 */
export async function runSeoPhase(input: SeoPhaseInput): Promise<SEOAnalysisResult | undefined> {
  const { config, needsSEO, needsAI, reusableBrowser, signal, log } = input;

  if (!needsSEO && !needsAI) return undefined;
  if (signal?.aborted) return undefined;

  const label = needsSEO && needsAI ? 'SEO · AI 친화도' : needsSEO ? 'SEO' : 'AI 친화도';
  log(`🌐 ${label} 분석을 시작합니다...`);

  let browser = reusableBrowser;
  let ownBrowser = false;

  try {
    if (!browser) {
      const launchOptions = await getBrowserLaunchOptions(true);
      browser = await chromium.launch(launchOptions);
      ownBrowser = true;
    }

    try {
      const seoResult = await seoAuditService.runFullAudit(browser, config.targetUrl, {
        includeSEO: needsSEO,
        includeAI: needsAI,
      });
      log(`✅ ${label} 분석 완료 (종합 점수: ${seoResult.score})`);
      return seoResult;
    } finally {
      if (ownBrowser && browser) {
        try { await browser.close(); } catch { /* ignore */ }
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`❌ ${label} 분석 중 오류 발생: ${errorMsg}`);
    console.error('SEO/AI Audit Error:', error);
    return undefined;
  }
}
