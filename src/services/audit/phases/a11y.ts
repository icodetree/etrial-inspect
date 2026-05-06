/**
 * Phase: 접근성 진단 (axe-core + KWCAG 매핑).
 *
 * `runAudit` 의 약 162~268 LOC 영역에서 추출:
 *   1) AccessibilityAuditor 인스턴스 init + storageState 로드
 *   2) 페이지 리스트를 동시성 5로 나눠 auditPage 반복
 *   3) 페이지마다 KWCAG 위반 → Violation 객체 변환 후 unique signature 기반 중복 제거
 *   4) abort signal 체크 — 워커가 break 하고 부분 결과 반환
 *   5) auditor 인스턴스를 호출자에게 노출(SEO phase 가 브라우저를 재사용할 수 있도록)
 */
import { AccessibilityAuditor, type PageAuditResult } from '@/lib/accessibility-auditor';
import { getBrowserErrorGuide } from '@/lib/browser-utils';
import * as fs from 'fs';
import type { PageInfo, Violation } from '@/types';
import type { A11yPhaseInput, A11yPhaseResult } from '../types';

/** 공통 UI 휴리스틱 — 헤더/푸터/네비/사이드바/메뉴류 */
const COMMON_UI_REGEX = /(header|footer|nav|gnb|lnb|sidebar|aside|menu|global)/i;

/** 동시 실행 가능한 페이지 진단 워커 수. */
const CONCURRENCY_LIMIT = 5;

export interface RunA11yPhaseResult extends A11yPhaseResult {
  /** SEO phase 가 브라우저를 재사용하기 위해 auditor 인스턴스를 그대로 노출. */
  auditor: AccessibilityAuditor;
}

/**
 * 접근성 진단 phase 를 실행한다.
 *
 * - `violations` 는 호출자가 소유한 배열을 mutate 한다 (abort 시 부분 결과 노출 보장).
 * - 반환된 `auditor` 는 호출자가 적절한 시점에 `close()` 해야 한다 (보통 SEO phase 종료 후).
 */
export async function runA11yPhase(input: A11yPhaseInput): Promise<RunA11yPhaseResult> {
  const {
    config,
    authStatePath,
    useStorageState,
    pages,
    signal,
    onProgress,
    log,
    violations,
  } = input;

  // SPA 자동 감지 흐름 — auditPage 가 페이지마다 waitForSpaReady 를 호출하므로
  // 통일된 기본 타임아웃(15s/30s) 사용. 정적 사이트는 networkidle 이 빠르게 끝남.
  const auditor = new AccessibilityAuditor({
    enableDynamicCheck: true,
    screenshotOnViolation: true,
    headless: true,
    readySelector: config.readySelector,
    networkIdleMs: 15000,
    maxWaitMs: 30000,
  });

  log('♿ 접근성 검사 시작...');
  try {
    await auditor.init();
  } catch (e) {
    const guide = getBrowserErrorGuide(e);
    throw new Error(`접근성 검사 엔진 초기화 실패: ${guide}`);
  }

  if (useStorageState && fs.existsSync(authStatePath)) {
    await auditor.loadStorageState(authStatePath);
  }

  const pageAuditResults: PageAuditResult[] = [];
  const uniqueViolationMap = new Map<string, Violation>();
  let violationNumber = 0;
  let completedCount = 0;
  let nextPageIndex = 0;

  const auditPageWrapper = async (page: PageInfo, index: number): Promise<void> => {
    if (signal?.aborted) return;
    log(`  검사 시작 (${index + 1}/${pages.length}): ${page.url}`);

    try {
      const auditResult = await auditor.auditPage(page.url, { signal });
      pageAuditResults.push(auditResult);

      for (const kwcagViolation of auditResult.violations) {
        for (const node of kwcagViolation.nodes) {
          const selector =
            node.target && node.target.length > 0 ? node.target.join(' > ') : '';
          const signature = `${kwcagViolation.axeRuleId}||${selector}||${node.html}`;
          const isCommonUI = COMMON_UI_REGEX.test(selector);

          if (uniqueViolationMap.has(signature)) {
            const existing = uniqueViolationMap.get(signature)!;
            if (existing.occurrenceCount !== undefined) {
              existing.occurrenceCount++;
            }
            continue;
          }

          violationNumber++;
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
            selector,
            occurrenceCount: 1,
            isCommon: isCommonUI,
            boundingBox: node.boundingBox,
            screenshotPath: auditResult.screenshotPaths?.[0],
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
        onProgress({
          type: 'progress',
          current: completedCount,
          total: pages.length,
          url: page.url,
        });
      }
      log(`  검사 완료 (${completedCount}/${pages.length}): ${page.url}`);
    }
  };

  const worker = async (): Promise<void> => {
    while (nextPageIndex < pages.length) {
      if (signal?.aborted) break;
      const currentIndex = nextPageIndex++;
      const page = pages[currentIndex];
      await auditPageWrapper(page, currentIndex);
    }
  };

  const workers = Array(Math.min(pages.length, CONCURRENCY_LIMIT))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);

  log('✅ 접근성 검사 완료');

  return { pageAuditResults, auditor };
}
