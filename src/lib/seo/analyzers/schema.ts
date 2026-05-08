/**
 * SEO Analyzer — 9. Schema (구조화 데이터) 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { SchemaData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeSchema(page: Page): Promise<SEOCategory<SchemaData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    // JSON-LD
    const jsonldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const jsonld: object[] = [];
    for (const s of jsonldScripts) {
      try {
        const parsed = JSON.parse(s.textContent || '');
        jsonld.push(parsed);
      } catch { /* invalid json */ }
    }

    // Microdata
    const itemscope = document.querySelectorAll('[itemscope]').length;
    const itemtypeEls = document.querySelectorAll('[itemtype]');
    const itemtype = Array.from(itemtypeEls).map(el => el.getAttribute('itemtype') || '');
    const itemprop = document.querySelectorAll('[itemprop]').length;

    // RDFa
    const vocabEl = document.querySelector('[vocab]');
    const typeofEls = document.querySelectorAll('[typeof]');
    const rdfa = {
      vocab: vocabEl?.getAttribute('vocab') || '',
      typeof: Array.from(typeofEls).map(el => el.getAttribute('typeof') || ''),
      property: document.querySelectorAll('[property]').length,
      resource: document.querySelectorAll('[resource]').length,
    };

    // Schema types detection
    const allText = jsonld.map(j => JSON.stringify(j)).join(' ');
    const schemaTypes: Record<string, boolean> = {
      article: /@type.*Article/i.test(allText),
      organization: /@type.*Organization/i.test(allText),
      product: /@type.*Product/i.test(allText),
      breadcrumb: /@type.*BreadcrumbList/i.test(allText),
      faq: /@type.*FAQPage/i.test(allText),
      localBusiness: /@type.*LocalBusiness/i.test(allText),
      website: /@type.*WebSite/i.test(allText),
      person: /@type.*Person/i.test(allText),
    };

    return {
      jsonld,
      microdata: { itemscope, itemtype, itemprop, items: [] },
      rdfa,
      schemaTypes,
    } as SchemaData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (data.jsonld.length === 0 && data.microdata.itemscope === 0) {
    issues.push({ severity: 'info', message: '구조화된 데이터(JSON-LD/Microdata)가 없습니다', details: {}, suggestion: 'JSON-LD 형식의 구조화된 데이터를 추가하세요' });
  } else {
    passed.push({ message: `구조화된 데이터 발견: JSON-LD ${data.jsonld.length}개, Microdata ${data.microdata.itemscope}개`, details: {} });
  }

  return makeCategory('구조화 데이터', issues, passed, data, start);
}
