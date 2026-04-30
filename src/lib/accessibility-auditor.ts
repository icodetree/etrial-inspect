import { chromium, Browser, Page, BrowserContext } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import * as fs from 'fs';
import * as path from 'path';
import koLocale from 'axe-core/locales/ko.json';
import { getBrowserLaunchOptions } from './browser-utils';
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
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
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

      // 0. 스크린샷 디렉토리 준비
      const screenshotDir = path.resolve(process.cwd(), 'public', 'screenshots');
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }

      // 1. 스크린샷 캡처
      const safeUrl = url.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeUrl}_${Date.now()}.png`;
      const screenshotPath = path.join(screenshotDir, filename);
      const publicScreenshotPath = `/screenshots/${filename}`;

      try {
        try {
          await page.screenshot({ path: screenshotPath, fullPage: true, timeout: 15000 });
        } catch (e) {
          console.warn(`Full page screenshot failed for ${url}, trying viewport only:`, e);
          await page.screenshot({ path: screenshotPath, fullPage: false, timeout: 10000 });
        }

        // Only verify if file exists to be sure
        if (fs.existsSync(screenshotPath)) {
          screenshotPaths.push(publicScreenshotPath);
        }
      } catch (e) {
        console.error(`Failed to capture screenshot for ${url}:`, e);
      }

      // 기본 접근성 스캔
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
      for (const violation of axeResults.violations) {
        for (const node of violation.nodes) {
          if (node.target && node.target.length > 0) {
            try {
              // axe returns css selector in target[0] usually
              let selector = '';
              if (typeof node.target[0] === 'string') {
                selector = node.target[0];
              } else if (typeof node.target[0] === 'object' && node.target[0] !== null && 'selector' in node.target[0]) {
                // Handle CrossTreeSelector if strictly typed
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                selector = (node.target[0] as any).selector;
              }

              if (selector) {
                // Use Playwright to find the element bounding box
                const box = await page.locator(selector).first().boundingBox();
                if (box) {
                  // node 객체에 boundingBox 주입 (타입 단언 필요할 수 있음)
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (node as any).boundingBox = box;
                }
              }
            } catch (e) {
              // Element might be hidden or moved, ignore error
            }
          }
        }
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
        storageState: path,
        viewport: { width: 1920, height: 1080 },
      });
    }
  }
}

export default AccessibilityAuditor;
