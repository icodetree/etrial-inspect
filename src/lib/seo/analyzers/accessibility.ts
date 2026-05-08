/**
 * SEO Analyzer — 8. Accessibility 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { A11yData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeAccessibility(page: Page): Promise<SEOCategory<A11yData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const htmlLang = document.documentElement.lang || '';
    const hreflangEls = Array.from(document.querySelectorAll('link[hreflang]'));
    const hreflangTags = hreflangEls.map(el => el.getAttribute('hreflang') || '');
    const contentLang = document.querySelector('meta[http-equiv="content-language"]')?.getAttribute('content') || '';

    // Form accessibility
    const allInputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
    let labeled = 0, unlabeled = 0, placeholderOnly = 0, requiredFields = 0;
    allInputs.forEach(input => {
      const id = input.getAttribute('id');
      const hasLabel = !!(id && document.querySelector(`label[for="${id}"]`));
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      if (hasLabel || ariaLabel || ariaLabelledBy) labeled++;
      else if (input.getAttribute('placeholder')) { placeholderOnly++; unlabeled++; }
      else unlabeled++;
      if (input.hasAttribute('required')) requiredFields++;
    });
    const fieldsets = document.querySelectorAll('fieldset').length;

    // ARIA analysis
    const ariaEls = document.querySelectorAll('[role], [aria-label], [aria-describedby], [aria-labelledby], [aria-hidden], [aria-live], [aria-expanded], [aria-pressed]');
    const ariaRoles = document.querySelectorAll('[role]').length;
    const ariaProperties = document.querySelectorAll('[aria-label], [aria-describedby], [aria-labelledby]').length;
    const ariaStates = document.querySelectorAll('[aria-expanded], [aria-pressed], [aria-checked], [aria-selected]').length;
    const landmarks = document.querySelectorAll('[role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="complementary"], [role="search"]').length;
    const liveRegions = document.querySelectorAll('[aria-live]').length;

    // Keyboard
    const tabindexAll = document.querySelectorAll('[tabindex]');
    let tabNeg = 0, tabPos = 0;
    tabindexAll.forEach(el => {
      const val = parseInt(el.getAttribute('tabindex') || '0', 10);
      if (val < 0) tabNeg++;
      else if (val > 0) tabPos++;
    });
    const accesskeys = document.querySelectorAll('[accesskey]').length;

    // Media
    const videos = document.querySelectorAll('video');
    let videosWithCaptions = 0;
    videos.forEach(v => { if (v.querySelector('track[kind="captions"], track[kind="subtitles"]')) videosWithCaptions++; });
    const audios = document.querySelectorAll('audio');
    let audiosWithTranscript = 0; // hard to detect programmatically

    // Focusable
    const focLinks = document.querySelectorAll('a[href]').length;
    const focButtons = document.querySelectorAll('button, [role="button"]').length;
    const focInputs = document.querySelectorAll('input, select, textarea').length;

    // Skip nav
    const hasSkipLink = !!document.querySelector('a[href="#main"], a[href="#content"], a[href="#main-content"], .skip-nav, .skip-link, [class*="skip"]');
    const hasMainLandmark = !!document.querySelector('main, [role="main"]');
    const hasNavLandmark = !!document.querySelector('nav, [role="navigation"]');

    return {
      language: { html: htmlLang, hreflang: hreflangTags.join(', '), contentLanguage: contentLang },
      hreflangTags,
      colorContrast: { totalChecked: 0, passed: 0, failed: 0, warnings: 0, sufficient: true, message: '별도 axe-core 검사 필요' },
      formAccessibility: { totalInputs: allInputs.length, labeled, unlabeled, placeholderOnly, requiredFields, fieldsets },
      ariaAnalysis: { total: ariaEls.length, roles: ariaRoles, properties: ariaProperties, states: ariaStates, landmarks, liveRegions, issues: 0, warnings: 0 },
      keyboard: { tabindex: tabindexAll.length, tabindexNegative: tabNeg, tabindexPositive: tabPos, accesskey: accesskeys },
      media: { videos: videos.length, videosWithCaptions, audios: audios.length, audiosWithTranscript },
      focusable: { links: focLinks, buttons: focButtons, inputs: focInputs, total: focLinks + focButtons + focInputs },
      skipNav: { hasSkipLink, hasMainLandmark, hasNavLandmark },
    } as A11yData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (!data.language.html) {
    issues.push({ severity: 'critical', message: 'html lang 속성이 없습니다', details: {}, suggestion: '<html lang="ko"> 와 같이 언어를 명시하세요' });
  } else {
    passed.push({ message: `html lang="${data.language.html}" 설정됨`, details: {} });
  }

  if (data.formAccessibility.unlabeled > 0) {
    issues.push({ severity: 'warning', message: `label이 없는 입력 요소 ${data.formAccessibility.unlabeled}개`, details: { count: data.formAccessibility.unlabeled }, suggestion: '모든 입력 요소에 label을 연결하세요' });
  }

  if (!data.skipNav.hasSkipLink) {
    issues.push({ severity: 'info', message: '건너뛰기 링크(skip navigation)가 없습니다', details: {}, suggestion: '키보드 사용자를 위해 skip navigation 링크를 추가하세요' });
  }

  if (!data.skipNav.hasMainLandmark) {
    issues.push({ severity: 'warning', message: 'main 랜드마크가 없습니다', details: {}, suggestion: '<main> 태그 또는 role="main"을 사용하세요' });
  }

  if (data.keyboard.tabindexPositive > 0) {
    issues.push({ severity: 'warning', message: `양수 tabindex 사용 ${data.keyboard.tabindexPositive}개`, details: { count: data.keyboard.tabindexPositive }, suggestion: 'tabindex에 양수 값을 사용하지 마세요 (DOM 순서를 따르는 것이 좋습니다)' });
  }

  return makeCategory('접근성', issues, passed, data, start);
}
