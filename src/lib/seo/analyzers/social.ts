/**
 * SEO Analyzer — 5. Social 미디어 메타 태그 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { SocialData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeSocial(page: Page): Promise<SEOCategory<SocialData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const getMeta = (selector: string): string => {
      const el = document.querySelector(selector);
      return el?.getAttribute('content') ?? '';
    };
    const getHtml = (selector: string): string => {
      const el = document.querySelector(selector);
      return el ? el.outerHTML : '';
    };

    const ogFields = ['title', 'description', 'image', 'url', 'type', 'site_name', 'locale', 'article'];
    const openGraph: Record<string, string> = {};
    const openGraphHtml: Record<string, string> = {};
    for (const f of ogFields) {
      const key = f === 'site_name' ? 'siteName' : f;
      openGraph[key] = getMeta(`meta[property="og:${f}"]`);
      openGraphHtml[key] = getHtml(`meta[property="og:${f}"]`);
    }

    const twFields = ['card', 'title', 'description', 'image', 'site', 'creator'];
    const twitter: Record<string, string> = {};
    const twitterHtml: Record<string, string> = {};
    for (const f of twFields) {
      twitter[f] = getMeta(`meta[name="twitter:${f}"]`);
      twitterHtml[f] = getHtml(`meta[name="twitter:${f}"]`);
    }

    const facebook: Record<string, string> = {
      appId: getMeta('meta[property="fb:app_id"]'),
      pages: getMeta('meta[property="fb:pages"]'),
    };
    const facebookHtml: Record<string, string> = {
      appId: getHtml('meta[property="fb:app_id"]'),
      pages: getHtml('meta[property="fb:pages"]'),
    };

    return { openGraph, openGraphHtml, twitter, twitterHtml, facebook, facebookHtml } as unknown as SocialData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (!data.openGraph.title) issues.push({ severity: 'warning', message: 'og:title이 설정되지 않았습니다', details: {}, suggestion: '<meta property="og:title"> 태그를 추가하세요' });
  else passed.push({ message: 'og:title이 설정되어 있습니다', details: {} });

  if (!data.openGraph.description) issues.push({ severity: 'warning', message: 'og:description이 설정되지 않았습니다', details: {}, suggestion: '<meta property="og:description"> 태그를 추가하세요' });
  if (!data.openGraph.image) issues.push({ severity: 'warning', message: 'og:image가 설정되지 않았습니다', details: {}, suggestion: '<meta property="og:image"> 태그를 추가하세요' });
  if (!data.twitter.card) issues.push({ severity: 'info', message: 'Twitter Card 메타 태그가 없습니다', details: {}, suggestion: '<meta name="twitter:card"> 태그를 추가하세요' });

  return makeCategory('소셜 미디어', issues, passed, data, start);
}
