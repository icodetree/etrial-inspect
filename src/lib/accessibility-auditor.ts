import { chromium, Browser, Page, BrowserContext } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import koLocale from 'axe-core/locales/ko.json';
import { getBrowserLaunchOptions, getStealthContextOptions, STEALTH_INIT_SCRIPT } from './browser-utils';
import { convertAxeToKWCAG, KWCAGViolation } from './kwcag-mapping';
import { CUSTOM_RULE_SCRIPT } from './custom-rules';
import {
  waitForSpaReady,
  SpaFramework,
  RenderStrategy,
} from './spa-readiness';

const isDev = process.env.NODE_ENV === 'development';

export interface AuditOptions {
  enableDynamicCheck?: boolean;
  screenshotOnViolation?: boolean;
  screenshotDir?: string;
  headless?: boolean;
  /** SPA hydration 후 추가로 대기할 사용자 정의 selector */
  readySelector?: string;
  /** networkidle 타임아웃 (ms). 기본 15000 */
  networkIdleMs?: number;
  /** 전체 hydration 대기 상한 (ms). 기본 30000 */
  maxWaitMs?: number;
}

export type PageAuditStatus = 'success' | 'partial' | 'failed';

export interface PageAuditResult {
  url: string;
  title: string;
  violations: KWCAGViolation[];
  screenshotPaths: string[];
  timestamp: string;
  /** 진단 신뢰도 — success: 정상, partial: 추출 부분 실패, failed: 페이지 로드/axe 실패 */
  status: PageAuditStatus;
  /** partial/failed 일 때의 사유 (예: 'low-dom-content', 'goto-failed', 'axe-throw') */
  failureReason?: string;
  /** 감지된 SPA 프레임워크 */
  framework?: SpaFramework;
  renderStrategy?: RenderStrategy;
  /** networkidle 이후 hydration 대기까지 누적 ms */
  hydrationMs?: number;
  /** 진단 시점 DOM 전체 엘리먼트 개수 (정상/실패 구분 휴리스틱에 사용) */
  domNodeCount?: number;
}

export class AccessibilityAuditor {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private options: AuditOptions;

  constructor(options: AuditOptions = {}) {
    this.options = {
      enableDynamicCheck: true,
      screenshotOnViolation: true,
      screenshotDir: './public/screenshots',
      ...options,
    };
  }

  async init(): Promise<void> {
    const launchOptions = await getBrowserLaunchOptions(this.options.headless !== undefined ? this.options.headless : true);
    this.browser = await chromium.launch(launchOptions);
    this.context = await this.browser.newContext(getStealthContextOptions());
    await this.context.addInitScript(STEALTH_INIT_SCRIPT);
  }

  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.context = null;
  }

  /**
   * 내부 브라우저 인스턴스를 반환 (SEO 분석 등에서 재사용)
   * init()이 호출된 후에만 유효
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  async login(loginUrl: string, id: string, password: string): Promise<boolean> {
    if (!this.context) throw new Error('Auditor not initialized');

    const page = await this.context.newPage();
    try {
      await page.goto(loginUrl, { waitUntil: 'networkidle' });

      // 일반적인 로그인 폼 찾기 시도
      const idSelectors = ['#username', '#id', '#userId', '#user_id', 'input[name="id"]', 'input[name="username"]', 'input[type="email"]'];
      const pwSelectors = ['#password', '#pw', '#passwd', 'input[name="password"]', 'input[name="pw"]', 'input[type="password"]'];
      const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', '#login', '.login-btn', '.btn-login'];

      let idInput = null;
      for (const selector of idSelectors) {
        idInput = await page.$(selector);
        if (idInput) break;
      }

      let pwInput = null;
      for (const selector of pwSelectors) {
        pwInput = await page.$(selector);
        if (pwInput) break;
      }

      let submitBtn = null;
      for (const selector of submitSelectors) {
        submitBtn = await page.$(selector);
        if (submitBtn) break;
      }

      if (idInput && pwInput && submitBtn) {
        await idInput.fill(id);
        await pwInput.fill(password);
        await submitBtn.click();
        await page.waitForLoadState('networkidle');
        return true;
      }

      return false;
    } catch (error) {
      console.error('Login failed:', error);
      return false;
    } finally {
      await page.close();
    }
  }

  async auditPage(url: string, opts?: { signal?: AbortSignal }): Promise<PageAuditResult> {
    if (!this.context) throw new Error('Auditor not initialized');

    const signal = opts?.signal;
    if (signal?.aborted) {
      return {
        url,
        title: '',
        violations: [],
        screenshotPaths: [],
        timestamp: new Date().toISOString(),
        status: 'failed',
        failureReason: 'aborted',
      };
    }

    const page = await this.context.newPage();
    const screenshotPaths: string[] = [];

    let readyStatus: PageAuditStatus = 'success';
    let readyFailureReason: string | undefined;
    let framework: SpaFramework | undefined;
    let renderStrategy: RenderStrategy | undefined;
    let hydrationMs: number | undefined;
    let domNodeCount: number | undefined;

    try {
      // Use domcontentloaded as primary wait condition to prevent timeouts on sites with persistent network activity
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      } catch (e) {
        return {
          url,
          title: 'Error',
          violations: [],
          screenshotPaths: [],
          timestamp: new Date().toISOString(),
          status: 'failed',
          failureReason: e instanceof Error ? `goto-failed: ${e.message}` : 'goto-failed',
        };
      }

      // SPA hydration 대기 (프레임워크 감지 + 단계별 대기 + DOM 안정화)
      try {
        const ready = await waitForSpaReady(page, {
          readySelector: this.options.readySelector,
          networkIdleMs: this.options.networkIdleMs ?? 15000,
          maxWaitMs: this.options.maxWaitMs ?? 30000,
        });
        framework = ready.framework;
        renderStrategy = ready.renderStrategy;
        hydrationMs = ready.hydrationMs;
        domNodeCount = ready.domNodeCount;
        if (ready.status !== 'ready') {
          readyStatus = 'partial';
          readyFailureReason = `readiness:${ready.status}:${ready.notes.join(',')}`;
        }
      } catch (e) {
        // readiness 자체 실패는 치명적이지 않음 — 진단을 계속 시도하고 partial 로 표기
        console.warn(`[Audit] SPA readiness check failed for ${url}:`, e);
        readyStatus = 'partial';
        readyFailureReason = 'readiness-error';
      }

      const title = await page.title();

      // WAF/봇 차단 페이지 감지 — Cloudflare 챌린지는 자동 해결 대기 후 재확인
      let isBlocked = await page.evaluate(() => {
        const text = document.body?.innerText || '';
        const t = document.title || '';
        const el = document.getElementsByTagName('*').length;
        return (
          el < 5 ||
          /잠시만 기다리|please wait|checking your browser|just a moment|access denied|보안 위배/i.test(text + t)
        );
      }).catch(() => false);

      // Cloudflare JS 챌린지는 보통 5초 내 자동 해결 — 대기 후 재확인
      if (isBlocked) {
        await page.waitForTimeout(6000);
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        isBlocked = await page.evaluate(() => {
          const text = document.body?.innerText || '';
          const t = document.title || '';
          const el = document.getElementsByTagName('*').length;
          return (
            el < 5 ||
            /잠시만 기다리|please wait|checking your browser|just a moment|access denied|보안 위배/i.test(text + t)
          );
        }).catch(() => false);
      }

      if (isBlocked) {
        console.warn(`[Audit] 차단/챌린지 페이지 스킵: ${url}`);
        await page.close();
        return {
          url,
          title: title || 'Blocked',
          violations: [],
          screenshotPaths: [],
          timestamp: new Date().toISOString(),
          status: 'failed' as PageAuditStatus,
          failureReason: 'waf-blocked',
        };
      }

      // 1. 접근성 스캔 (스크린샷보다 먼저 실행하여 bbox 좌표와 스크린샷 시점 일치)
      const axePath = isDev
        ? path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')
        : path.join(__dirname, '../../../node_modules/axe-core/axe.min.js');

      let axeCoreSource = '';
      try {
        axeCoreSource = fs.readFileSync(axePath, 'utf8');
      } catch (e) {
        console.error('Failed to read axe.min.js from:', axePath, e);
      }

      // koLocale 설정 주입
      const axeSource = axeCoreSource
        ? `${axeCoreSource}\n window.axe.configure({ locale: ${JSON.stringify(koLocale)} });`
        : undefined;

      const builder = new AxeBuilder({ page, axeSource });

      const axeResults = await builder
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();

      // [NEW] Custom Rules Execution
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let customViolations: any[] = [];
      try {
        customViolations = await page.evaluate(CUSTOM_RULE_SCRIPT);
      } catch (e) {
        console.error('Failed to execute custom rules:', e);
      }

      // Merge custom violations into axe results
      if (customViolations.length > 0) {
        axeResults.violations.push(...customViolations);
      }

      // 2. Bounding Box 추출 및 주입
      // boundingBox()는 뷰포트 기준 좌표를 반환하므로
      // 스크롤 오프셋을 더해 문서 절대 좌표로 변환한다 (fullPage 스크린샷과 일치)
      for (const violation of axeResults.violations) {
        for (const node of violation.nodes) {
          if (node.target && node.target.length > 0) {
            try {
              // target 배열에서 가장 구체적인 (마지막) selector 사용
              let selector = '';
              for (let i = node.target.length - 1; i >= 0; i--) {
                const t = node.target[i];
                if (typeof t === 'string') {
                  selector = t;
                  break;
                } else if (typeof t === 'object' && t !== null && 'selector' in t) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  selector = (t as any).selector;
                  break;
                }
              }

              if (selector) {
                // getBoundingClientRect + scrollOffset = 문서 절대 좌표
                const absBox = await page.evaluate((sel: string) => {
                  // 1차: querySelector 시도
                  let el: Element | null = null;
                  try { el = document.querySelector(sel); } catch { /* invalid selector */ }
                  // 2차: ID 기반 폴백 (axe가 id 포함 selector를 줄 때)
                  if (!el) {
                    const idMatch = sel.match(/#([^\s.[\]>:+~]+)/);
                    if (idMatch) el = document.getElementById(idMatch[1]);
                  }
                  if (!el) return null;
                  const rect = el.getBoundingClientRect();
                  return {
                    x: rect.left + window.scrollX,
                    y: rect.top + window.scrollY,
                    width: rect.width,
                    height: rect.height,
                  };
                }, selector);
                if (absBox) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (node as any).boundingBox = absBox;
                }
              }
            } catch {
              // Element might be hidden or moved, ignore error
            }
          }
        }
      }

      // 3. 스크린샷 캡처 (axe 실행 + bbox 추출 후 → 좌표와 페이지 상태 일치 보장)
      const screenshotDir = path.resolve(process.cwd(), 'public', 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const safeUrl = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeUrl}_${Date.now()}.png`;
      const screenshotPath = path.join(screenshotDir, filename);
      const publicScreenshotPath = `/screenshots/${filename}`;

      try {
        let captured = false;
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15000 });
          captured = true;
        } catch {
          // fullPage 실패 시 viewport만 시도
          try {
            await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 });
            captured = true;
          } catch {
            // 양쪽 모두 실패 — 스크린샷 없이 계속 진행
          }
        }
        if (captured && fs.existsSync(screenshotPath)) {
          screenshotPaths.push(publicScreenshotPath);
        }
      } catch (e) {
        console.error(`Failed to capture screenshot for ${url}:`, e);
      }

      // impact null/undefined 처리 및 3:1 명도대비 필터링
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let allViolations = axeResults.violations.map((v: any) => {
        let nodes = v.nodes;
        if (v.id === 'color-contrast' || v.id === 'color-contrast-enhanced') {
          nodes = nodes.filter((node: any) => {
            const checks = [...(node.any || []), ...(node.all || []), ...(node.none || [])];
            const contrastCheck = checks.find(c => c.id === 'color-contrast' || c.id === 'color-contrast-enhanced');
            if (contrastCheck && contrastCheck.data && typeof contrastCheck.data.contrastRatio === 'number') {
              return contrastCheck.data.contrastRatio < 3.0; // 3.0 이상이면 위반 아님
            }
            return true;
          });

          // failureSummary 텍스트 수정 (4.5:1 -> 3.0:1)
          nodes = nodes.map((node: any) => {
            if (node.failureSummary) {
              node.failureSummary = node.failureSummary.replace(/4\.5:1/g, '3.0:1');
            }
            return node;
          });
        }
        return {
          ...v,
          nodes,
          impact: v.impact || 'minor'
        };
      }).filter((v: any) => v.nodes.length > 0);

      // 동적 요소 검사 (옵션)
      if (this.options.enableDynamicCheck) {
        const dynamicViolations = await this.checkDynamicElements(page);
        const saneDynamicViolations = dynamicViolations.map(v => ({
          ...v,
          impact: v.impact || 'minor'
        }));
        allViolations = [...allViolations, ...saneDynamicViolations];
      }

      // KWCAG 형식으로 변환 (boundingBox가 포함된 상태로 전달됨)
      const kwcagViolations = convertAxeToKWCAG({ violations: allViolations });

      // 정상 통과(0건)와 추출 실패 구분: 위반 0 + DOM 노드 비정상 적음 + 프레임워크 감지됨 → partial
      let finalStatus: PageAuditStatus = readyStatus;
      let finalReason = readyFailureReason;
      const LOW_DOM_THRESHOLD = 30;
      if (
        finalStatus === 'success' &&
        kwcagViolations.length === 0 &&
        typeof domNodeCount === 'number' &&
        domNodeCount < LOW_DOM_THRESHOLD &&
        framework &&
        framework !== 'unknown'
      ) {
        finalStatus = 'partial';
        finalReason = 'low-dom-content';
      }

      return {
        url,
        title,
        violations: kwcagViolations,
        screenshotPaths: [publicScreenshotPath], // Use array for consistency
        timestamp: new Date().toISOString(),
        status: finalStatus,
        failureReason: finalReason,
        framework,
        renderStrategy,
        hydrationMs,
        domNodeCount,
      };
    } catch (error) {
      console.error(`Error auditing ${url}:`, error);
      return {
        url,
        title: 'Error',
        violations: [],
        screenshotPaths: [],
        timestamp: new Date().toISOString(),
        status: 'failed',
        failureReason:
          error instanceof Error ? `audit-throw: ${error.message}` : 'audit-throw',
        framework,
        renderStrategy,
        hydrationMs,
        domNodeCount,
      };
    } finally {
      await page.close();
    }
  }

  private async checkDynamicElements(page: Page): Promise<typeof AxeBuilder.prototype.analyze extends () => Promise<infer R> ? R extends { violations: infer V } ? V : never : never> {
    const additionalViolations: ReturnType<typeof this.checkDynamicElements> extends Promise<infer R> ? R : never = [];

    try {
      // 클릭 가능한 요소 찾기
      const clickableElements = await page.$$('button, [role="button"], .btn, .dropdown-toggle');
      const originalUrl = page.url();

      for (let i = 0; i < Math.min(clickableElements.length, 10); i++) {
        const element = clickableElements[i];

        try {
          const isVisible = await element.isVisible();
          if (!isVisible) continue;

          const text = await element.innerText().catch(() => '');
          // 위험한 버튼 제외
          if (/로그아웃|logout|삭제|delete|탈퇴/i.test(text)) continue;

          await element.click({ timeout: 2000 });
          await page.waitForTimeout(500);

          // URL 이탈 체크
          if (page.url() !== originalUrl) {
            await page.goBack();
            continue;
          }

          // 새로 열린 모달/팝업 검사
          const modal = await page.$('.modal, .layer-popup, .dropdown-menu, [role="dialog"]');
          if (modal) {
            // 메인 auditPage에서 생성한 axeSource가 있으면 재사용, 없으면 그냥 생성
            const axePath = isDev
              ? path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js')
              : path.join(__dirname, '../../../node_modules/axe-core/axe.min.js');

            let axeCoreSource = '';
            try {
              axeCoreSource = fs.readFileSync(axePath, 'utf8');
            } catch (e) {
              // 무시
            }

            const axeSource = axeCoreSource
              ? `${axeCoreSource}\n window.axe.configure({ locale: ${JSON.stringify(koLocale)} });`
              : undefined;

            const axeResults = await new AxeBuilder({ page, axeSource })
              .include('.modal, .layer-popup, .dropdown-menu, [role="dialog"]')
              .withTags(['wcag2a', 'wcag2aa'])
              .analyze();

            additionalViolations.push(...axeResults.violations);
          }

          // ESC로 닫기
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        } catch {
          continue;
        }
      }
    } catch (error) {
      console.error('Dynamic element check failed:', error);
    }

    return additionalViolations;
  }

  // 스토리지 상태 저장 (세션 유지용)
  async saveStorageState(path: string): Promise<void> {
    if (this.context) {
      await this.context.storageState({ path });
    }
  }

  // 스토리지 상태 로드
  async loadStorageState(path: string): Promise<void> {
    if (this.browser && fs.existsSync(path)) {
      this.context = await this.browser.newContext({
        ...getStealthContextOptions(),
        storageState: path,
      });
      await this.context.addInitScript(STEALTH_INIT_SCRIPT);
    }
  }
}

export default AccessibilityAuditor;
