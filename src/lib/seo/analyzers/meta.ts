/**
 * SEO Analyzer — 1. Meta 태그 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { MetaData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeMeta(page: Page): Promise<SEOCategory<MetaData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const getAttr = (el: Element | null, attr: string) => el?.getAttribute(attr) ?? '';
    const getOuterHtml = (el: Element | null) => el ? el.outerHTML : null;

    const titleEl = document.querySelector('title');
    const descEl = document.querySelector('meta[name="description"]');
    const kwEl = document.querySelector('meta[name="keywords"]');
    const robotsEl = document.querySelector('meta[name="robots"]');
    const viewportEl = document.querySelector('meta[name="viewport"]');
    const charsetEl = document.querySelector('meta[charset]') || document.querySelector('meta[http-equiv="Content-Type"]');
    const canonicalEl = document.querySelector('link[rel="canonical"]');
    const authorEl = document.querySelector('meta[name="author"]');

    const titleText = titleEl?.textContent?.trim() ?? '';
    const descContent = getAttr(descEl, 'content');
    const kwContent = getAttr(kwEl, 'content');
    const robotsContent = getAttr(robotsEl, 'content');
    const viewportContent = getAttr(viewportEl, 'content');
    const charsetValue = charsetEl?.getAttribute('charset') ?? '';
    const canonicalHref = getAttr(canonicalEl, 'href');
    const authorContent = getAttr(authorEl, 'content');
    const language = document.documentElement.lang || '';

    return {
      title: { exists: !!titleText, text: titleText, length: titleText.length, htmlCode: getOuterHtml(titleEl) },
      description: { exists: !!descContent, content: descContent, length: descContent.length, htmlCode: getOuterHtml(descEl) },
      keywords: { exists: !!kwContent, content: kwContent, count: kwContent ? kwContent.split(',').length : 0, htmlCode: getOuterHtml(kwEl) },
      robots: { exists: !!robotsContent, content: robotsContent, defaultValue: robotsContent ? null : 'index, follow', htmlCode: getOuterHtml(robotsEl) },
      viewport: { exists: !!viewportContent, content: viewportContent, htmlCode: getOuterHtml(viewportEl) },
      charset: { exists: !!charsetValue, value: charsetValue, htmlCode: getOuterHtml(charsetEl) },
      canonical: { exists: !!canonicalHref, href: canonicalHref, htmlCode: getOuterHtml(canonicalEl) },
      author: { exists: !!authorContent, content: authorContent, htmlCode: getOuterHtml(authorEl) },
      language,
    } as MetaData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  // title
  if (!data.title.exists) {
    issues.push({ severity: 'critical', message: 'title 태그가 없습니다', details: {}, suggestion: '<title> 태그를 추가하세요' });
  } else {
    if (data.title.length < 30) issues.push({ severity: 'warning', message: `title 길이가 너무 짧습니다 (${data.title.length}자)`, details: { length: data.title.length }, suggestion: '30자 이상으로 작성하세요' });
    else if (data.title.length > 60) issues.push({ severity: 'warning', message: `title 길이가 너무 깁니다 (${data.title.length}자)`, details: { length: data.title.length }, suggestion: '60자 이하로 작성하세요' });
    else passed.push({ message: 'title 태그가 적절합니다', details: { length: data.title.length } });
  }

  // description
  if (!data.description.exists) {
    issues.push({ severity: 'critical', message: 'meta description이 없습니다', details: {}, suggestion: '<meta name="description"> 태그를 추가하세요' });
  } else {
    if (data.description.length < 120) issues.push({ severity: 'warning', message: `description 길이가 너무 짧습니다 (${data.description.length}자)`, details: { length: data.description.length }, suggestion: '120자 이상으로 작성하세요' });
    else if (data.description.length > 160) issues.push({ severity: 'warning', message: `description 길이가 너무 깁니다 (${data.description.length}자)`, details: { length: data.description.length }, suggestion: '160자 이하로 작성하세요' });
    else passed.push({ message: 'meta description이 적절합니다', details: { length: data.description.length } });
  }

  // viewport
  if (!data.viewport.exists) {
    issues.push({ severity: 'critical', message: 'viewport 메타 태그가 없습니다', details: {}, suggestion: '<meta name="viewport" content="width=device-width, initial-scale=1"> 추가하세요' });
  } else {
    passed.push({ message: 'viewport 메타 태그가 존재합니다', details: {} });
  }

  // canonical
  if (!data.canonical.exists) {
    issues.push({ severity: 'info', message: 'canonical URL이 설정되지 않았습니다', details: {}, suggestion: '<link rel="canonical"> 태그를 추가하세요' });
  } else {
    passed.push({ message: 'canonical URL이 설정되어 있습니다', details: { href: data.canonical.href } });
  }

  // robots noindex
  if (data.robots.exists && /noindex/i.test(data.robots.content)) {
    issues.push({ severity: 'warning', message: 'robots 메타 태그에 noindex가 설정되어 있습니다', details: { content: data.robots.content }, suggestion: '검색 엔진 인덱싱이 필요하면 noindex를 제거하세요' });
  }

  // charset
  if (!data.charset.exists) {
    issues.push({ severity: 'warning', message: 'charset이 명시되지 않았습니다', details: {}, suggestion: '<meta charset="UTF-8"> 태그를 추가하세요' });
  } else {
    passed.push({ message: 'charset이 명시되어 있습니다', details: { value: data.charset.value } });
  }

  return makeCategory('메타 태그', issues, passed, data, start);
}
