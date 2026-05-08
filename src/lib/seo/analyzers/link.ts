/**
 * SEO Analyzer — 4. Link 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { LinkData, LinkItem } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeLink(page: Page): Promise<SEOCategory<LinkData>> {
  const start = Date.now();
  const pageUrl = page.url();

  const data = await page.evaluate((currentUrl: string) => {
    const origin = new URL(currentUrl).origin;
    const hostname = new URL(currentUrl).hostname;
    const links = Array.from(document.querySelectorAll('a[href]'));
    const domainGroups: Record<string, number> = {};
    const items: LinkItem[] = links.map((a, i) => {
      const href = a.getAttribute('href') || '';
      const text = (a.textContent || '').trim();
      const rel = a.getAttribute('rel') || '';
      const target = a.getAttribute('target') || '';
      let domain = '';
      let isExternal = false;
      let protocol = '';
      try {
        const u = new URL(href, currentUrl);
        domain = u.hostname;
        isExternal = u.hostname !== hostname;
        protocol = u.protocol;
      } catch { /* invalid url */ }

      if (domain) domainGroups[domain] = (domainGroups[domain] || 0) + 1;

      const isGeneric = /^(click here|here|read more|more|자세히|더보기|바로가기|클릭)$/i.test(text);

      return {
        index: i,
        href,
        text,
        htmlCode: a.outerHTML.substring(0, 500),
        domain,
        isExternal,
        isNofollow: /nofollow/i.test(rel),
        isNoopener: /noopener/i.test(rel),
        isTargetBlank: target === '_blank',
        isSelfLink: href === currentUrl || href === '',
        isHashLink: href.startsWith('#'),
        isJavascript: href.startsWith('javascript:'),
        isEmptyAnchor: !text && !a.querySelector('img') && !a.getAttribute('aria-label'),
        isGenericAnchor: isGeneric,
        protocol,
      } as LinkItem;
    });

    const stats = {
      internal: items.filter(l => !l.isExternal).length,
      external: items.filter(l => l.isExternal).length,
      nofollow: items.filter(l => l.isNofollow).length,
      noopener: items.filter(l => l.isNoopener).length,
      targetBlank: items.filter(l => l.isTargetBlank).length,
      emptyAnchors: items.filter(l => l.isEmptyAnchor).length,
      httpLinks: items.filter(l => l.protocol === 'http:').length,
      selfLinks: items.filter(l => l.isSelfLink).length,
    };

    return { total: items.length, links: items, domainGroups, stats } as LinkData;
  }, pageUrl);

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (data.stats.emptyAnchors > 0) {
    issues.push({ severity: 'critical', message: `텍스트가 없는 링크 ${data.stats.emptyAnchors}개`, details: { count: data.stats.emptyAnchors }, suggestion: '링크에 의미 있는 텍스트나 aria-label을 추가하세요' });
  }

  // _blank without noopener
  const unsafeBlank = data.links.filter(l => l.isTargetBlank && !l.isNoopener).length;
  if (unsafeBlank > 0) {
    issues.push({ severity: 'warning', message: `target="_blank"에 rel="noopener"가 없는 링크 ${unsafeBlank}개`, details: { count: unsafeBlank }, suggestion: 'target="_blank" 링크에 rel="noopener noreferrer"를 추가하세요' });
  }

  if (data.stats.httpLinks > 0) {
    issues.push({ severity: 'warning', message: `HTTP 프로토콜 링크 ${data.stats.httpLinks}개 (HTTPS 권장)`, details: { count: data.stats.httpLinks }, suggestion: 'HTTP 링크를 HTTPS로 변경하세요' });
  }

  if (data.stats.emptyAnchors === 0 && data.total > 0) {
    passed.push({ message: '모든 링크에 텍스트가 있습니다', details: {} });
  }

  return makeCategory('링크', issues, passed, data, start);
}
