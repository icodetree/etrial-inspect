/**
 * SPA 메뉴 클릭 탐색.
 *
 * Phase 3-1: 기존 `WebCrawler.discoverByMenuClick` 을 분리.
 *
 * 첫 페이지의 GNB / nav / [role=menu*] / [role=tab] 영역에서 위험하지 않은 후보를
 * 최대 N 개까지 클릭해 클라이언트 사이드 라우팅을 트리거한다. URL 변경은 history-hook
 * 이 자동으로 sink 를 통해 큐에 push 하므로 이 모듈은 클릭만 담당한다.
 *
 * 위험 텍스트(로그아웃/결제/삭제/제출 등)를 가진 후보는 모두 제외해 유저 데이터에
 * 영향을 주지 않는다.
 */

import type { Page } from 'playwright-core';

const MAX_CANDIDATES = 10;
const DANGER_PATTERN =
  /로그아웃|logout|로그인|login|회원가입|signup|join|삭제|delete|탈퇴|withdraw|결제|payment|구매|buy|submit|제출/i;

/**
 * 메뉴 후보 selector — collectLinks 와 분리된 nav/gnb/role 기반 선택자.
 * 두 위치(`$$eval` 후보 수집, `locator(...).nth(idx)` 클릭) 에서 동일하게 사용한다.
 */
const MENU_CANDIDATE_SELECTOR = [
  'header a',
  'nav a',
  '[role=navigation] a',
  '.gnb a',
  '.lnb a',
  '[role=menuitem]',
  '[role=tab]',
  'header button',
  'nav button',
  '[role=navigation] button',
  '.gnb button',
  '.lnb button',
  '.nav a',
  '.menu a',
  '.navigation a',
  '[class*="nav-"] a',
  '[class*="menu-"] a',
].join(', ');

interface RawCandidate {
  text: string;
  href: string | null;
}

/**
 * 페이지의 메뉴 후보를 수집해 최대 N 개까지 순서대로 클릭한다.
 * 클릭 후 URL 이 바뀌면 goBack() 으로 시작점에 복귀하고 다음 후보를 시도한다.
 *
 * 모든 동작은 best-effort — 개별 후보 실패는 무시하고 다음으로 진행한다.
 */
export async function discoverByMenuClick(page: Page): Promise<void> {
  let candidates: RawCandidate[];
  try {
    candidates = await page.$$eval(MENU_CANDIDATE_SELECTOR, (els) => {
      const out: { text: string; href: string | null }[] = [];
      for (let i = 0; i < els.length; i++) {
        const el = els[i] as HTMLElement;
        const tag = el.tagName;
        // form submit 버튼 제외
        if (tag === 'BUTTON') {
          const btn = el as HTMLButtonElement;
          if (btn.type === 'submit' || el.closest('form')) continue;
        }
        const text = (el.innerText || el.textContent || '').trim().slice(0, 80);
        const href = tag === 'A' ? (el as HTMLAnchorElement).getAttribute('href') : null;
        out.push({ text, href });
      }
      return out;
    });
  } catch {
    return;
  }

  // 후보 정제: 위험 텍스트 제외, anchor 의 href 가 mailto/tel/javascript 인 것 제외
  const safe = candidates
    .map((c, idx) => ({ ...c, idx }))
    .filter((c) => !DANGER_PATTERN.test(c.text))
    .filter((c) => {
      if (!c.href) return true;
      return !/^(mailto:|tel:|javascript:|#$)/i.test(c.href);
    })
    .slice(0, MAX_CANDIDATES);

  if (safe.length === 0) return;

  const startUrl = page.url();

  for (const c of safe) {
    try {
      // 매 클릭 전 현재 URL 기록
      const beforeUrl = page.url();
      const locator = page.locator(MENU_CANDIDATE_SELECTOR).nth(c.idx);
      const visible = await locator.isVisible({ timeout: 500 }).catch(() => false);
      if (!visible) continue;

      await locator.click({ timeout: 1000, trial: false });
      // URL 변경 감지 — 짧게 기다림
      await Promise.race([
        page.waitForURL(() => page.url() !== beforeUrl, { timeout: 1000 }).catch(() => null),
        page.waitForTimeout(600),
      ]);

      // URL 이 시작 URL 과 달라졌으면 goBack 으로 복귀 (sink 가 이미 큐에 push 했음)
      if (page.url() !== startUrl) {
        try {
          await page.goBack({ timeout: 1500, waitUntil: 'domcontentloaded' });
        } catch {
          // 복귀 실패 시 다시 startUrl 로 강제 이동 — 재진입 대신 그냥 break
          break;
        }
      }
    } catch {
      // 개별 후보 실패는 무시하고 다음 후보로
      continue;
    }
  }
}
