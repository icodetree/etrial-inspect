/**
 * SEO Analyzer — 2. Heading 구조 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { HeadingData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeHeading(page: Page): Promise<SEOCategory<HeadingData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const headings: Record<string, string[]> = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
    const structure: string[] = [];
    document.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(el => {
      const tag = el.tagName.toLowerCase() as keyof typeof headings;
      const text = (el.textContent || '').trim();
      headings[tag].push(text);
      structure.push(`${tag}: ${text}`);
    });
    return {
      headings: headings as HeadingData['headings'],
      counts: {
        h1: headings.h1.length, h2: headings.h2.length, h3: headings.h3.length,
        h4: headings.h4.length, h5: headings.h5.length, h6: headings.h6.length,
      },
      structure,
      h1Text: headings.h1[0] || '',
    } as HeadingData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (data.counts.h1 === 0) {
    issues.push({ severity: 'critical', message: 'h1 태그가 없습니다', details: {}, suggestion: '페이지에 h1 태그를 하나 추가하세요' });
  } else if (data.counts.h1 > 1) {
    issues.push({ severity: 'warning', message: `h1 태그가 ${data.counts.h1}개 있습니다`, details: { count: data.counts.h1 }, suggestion: 'h1 태그는 페이지당 1개만 사용하세요' });
  } else {
    passed.push({ message: 'h1 태그가 1개 존재합니다', details: { text: data.h1Text } });
  }

  // 헤딩 계층 건너뜀 검사
  if (data.counts.h2 === 0 && data.counts.h3 > 0) {
    issues.push({ severity: 'warning', message: 'h2 없이 h3가 사용되었습니다 (헤딩 계층 건너뜀)', details: {}, suggestion: 'h2 태그를 먼저 사용한 후 h3를 사용하세요' });
  }
  if (data.counts.h3 === 0 && data.counts.h4 > 0) {
    issues.push({ severity: 'warning', message: 'h3 없이 h4가 사용되었습니다 (헤딩 계층 건너뜀)', details: {}, suggestion: '헤딩 계층 구조를 순서대로 유지하세요' });
  }

  return makeCategory('헤딩 구조', issues, passed, data, start);
}
