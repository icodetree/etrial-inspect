/**
 * discoverByMenuClick — Phase 3-1 분리 모듈 단위 테스트.
 *
 * Playwright `Page` 를 모킹해 다음을 검증한다:
 *  - $$eval 이 nav/header/role 기반 selector 로 호출된다.
 *  - 위험 텍스트(로그아웃/결제/삭제 등) 후보는 클릭 시도조차 되지 않는다.
 *  - 안전 후보들은 차례로 click 된다.
 *  - $$eval 이 throw 하면 함수 자체는 silently 종료된다.
 *  - 클릭 후 URL 이 바뀌면 goBack 으로 복귀를 시도한다.
 */

import type { Page } from 'playwright-core';
import { discoverByMenuClick } from '../../crawler/spa-discovery';

interface MockLocator {
  isVisible: jest.Mock;
  click: jest.Mock;
  nth: jest.Mock;
}

interface MockPage {
  $$eval: jest.Mock;
  locator: jest.Mock;
  url: jest.Mock;
  waitForURL: jest.Mock;
  waitForTimeout: jest.Mock;
  goBack: jest.Mock;
}

function buildMockLocator(): MockLocator {
  const m: MockLocator = {
    isVisible: jest.fn().mockResolvedValue(true),
    click: jest.fn().mockResolvedValue(undefined),
    nth: jest.fn(),
  };
  m.nth.mockReturnValue(m);
  return m;
}

function buildMockPage(currentUrl = 'https://example.com'): MockPage & { _locator: MockLocator } {
  const locator = buildMockLocator();
  const m: MockPage & { _locator: MockLocator } = {
    $$eval: jest.fn(),
    locator: jest.fn().mockReturnValue(locator),
    url: jest.fn().mockReturnValue(currentUrl),
    waitForURL: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    goBack: jest.fn().mockResolvedValue(undefined),
    _locator: locator,
  };
  return m;
}

describe('discoverByMenuClick', () => {
  test('$$eval 이 nav/header/role 기반 selector 로 호출된다', async () => {
    const page = buildMockPage();
    page.$$eval.mockResolvedValue([]);

    await discoverByMenuClick(page as unknown as Page);

    expect(page.$$eval).toHaveBeenCalledTimes(1);
    const selector = page.$$eval.mock.calls[0][0] as string;
    expect(selector).toContain('header a');
    expect(selector).toContain('nav a');
    expect(selector).toContain('[role=navigation] a');
    expect(selector).toContain('[role=menuitem]');
    expect(selector).toContain('[role=tab]');
  });

  test('후보가 0 개면 locator/click 이 호출되지 않는다', async () => {
    const page = buildMockPage();
    page.$$eval.mockResolvedValue([]);

    await discoverByMenuClick(page as unknown as Page);

    expect(page.locator).not.toHaveBeenCalled();
    expect(page._locator.click).not.toHaveBeenCalled();
  });

  test('위험 텍스트(로그아웃/결제/삭제)는 클릭에서 제외된다', async () => {
    const page = buildMockPage();
    page.$$eval.mockResolvedValue([
      { text: '소개', href: '/about' },
      { text: '로그아웃', href: '/logout' },
      { text: '결제하기', href: '/checkout' },
      { text: '삭제', href: null },
      { text: '제출', href: null },
      { text: '연락처', href: '/contact' },
    ]);

    await discoverByMenuClick(page as unknown as Page);

    // 안전 후보 2 개(소개, 연락처) 만 클릭되어야 한다
    expect(page._locator.click).toHaveBeenCalledTimes(2);
  });

  test('mailto:/tel:/javascript: href 후보는 클릭에서 제외된다', async () => {
    const page = buildMockPage();
    page.$$eval.mockResolvedValue([
      { text: '메일', href: 'mailto:hi@example.com' },
      { text: '전화', href: 'tel:010-0000-0000' },
      { text: 'JS', href: 'javascript:void(0)' },
      { text: '#', href: '#' },
      { text: '소개', href: '/about' },
    ]);

    await discoverByMenuClick(page as unknown as Page);

    expect(page._locator.click).toHaveBeenCalledTimes(1);
  });

  test('최대 10 개 후보까지만 클릭한다', async () => {
    const page = buildMockPage();
    const candidates = Array.from({ length: 20 }).map((_, i) => ({
      text: `메뉴${i}`,
      href: `/m${i}`,
    }));
    page.$$eval.mockResolvedValue(candidates);

    await discoverByMenuClick(page as unknown as Page);

    expect(page._locator.click).toHaveBeenCalledTimes(10);
  });

  test('보이지 않는 후보(isVisible=false)는 클릭하지 않는다', async () => {
    const page = buildMockPage();
    page.$$eval.mockResolvedValue([
      { text: '보임', href: '/visible' },
      { text: '숨김', href: '/hidden' },
    ]);

    page._locator.isVisible
      .mockResolvedValueOnce(true) // 보임
      .mockResolvedValueOnce(false); // 숨김

    await discoverByMenuClick(page as unknown as Page);

    expect(page._locator.click).toHaveBeenCalledTimes(1);
  });

  test('$$eval 이 throw 하면 함수는 silently 종료한다', async () => {
    const page = buildMockPage();
    page.$$eval.mockRejectedValue(new Error('eval failed'));

    await expect(
      discoverByMenuClick(page as unknown as Page),
    ).resolves.toBeUndefined();
    expect(page.locator).not.toHaveBeenCalled();
  });

  test('클릭 후 URL 이 바뀌면 goBack 으로 복귀한다', async () => {
    const page = buildMockPage('https://example.com');
    page.$$eval.mockResolvedValue([{ text: '소개', href: '/about' }]);

    // 클릭 시점에 URL 이 바뀐 것처럼 시뮬레이션
    let urlState = 'https://example.com';
    page.url.mockImplementation(() => urlState);
    page._locator.click.mockImplementation(async () => {
      urlState = 'https://example.com/about';
    });

    await discoverByMenuClick(page as unknown as Page);

    expect(page.goBack).toHaveBeenCalledTimes(1);
  });

  test('개별 후보의 클릭 실패는 무시되고 다음 후보로 진행한다', async () => {
    const page = buildMockPage();
    page.$$eval.mockResolvedValue([
      { text: '메뉴1', href: '/m1' },
      { text: '메뉴2', href: '/m2' },
      { text: '메뉴3', href: '/m3' },
    ]);

    page._locator.click
      .mockRejectedValueOnce(new Error('click1 fail'))
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await expect(discoverByMenuClick(page as unknown as Page)).resolves.toBeUndefined();
    expect(page._locator.click).toHaveBeenCalledTimes(3);
  });
});
