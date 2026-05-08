/**
 * SEO Analyzer — 7. Semantic 구조 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { SemanticData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeSemantic(page: Page): Promise<SEOCategory<SemanticData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const countTag = (tag: string) => document.querySelectorAll(tag).length;

    const html5Tags: Record<string, number> = {};
    for (const tag of ['header', 'nav', 'main', 'article', 'section', 'aside', 'footer', 'figure', 'figcaption', 'details', 'summary', 'dialog', 'time', 'mark']) {
      html5Tags[tag] = countTag(tag);
    }

    const textEmphasis: Record<string, number> = {};
    for (const tag of ['strong', 'b', 'em', 'i', 'blockquote', 'cite', 'code', 'pre']) {
      textEmphasis[tag] = countTag(tag);
    }

    const divCount = countTag('div');
    const spanCount = countTag('span');

    // ARIA
    const roles = document.querySelectorAll('[role]').length;
    const labels = document.querySelectorAll('[aria-label]').length;
    const describedby = document.querySelectorAll('[aria-describedby]').length;
    const labelledby = document.querySelectorAll('[aria-labelledby]').length;
    const hidden = document.querySelectorAll('[aria-hidden]').length;
    const live = document.querySelectorAll('[aria-live]').length;

    // Forms
    const forms = document.querySelectorAll('form').length;
    const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
    const formLabels = document.querySelectorAll('label').length;
    let inputsWithLabels = 0;
    let inputsWithPlaceholder = 0;
    let inputsWithRequired = 0;
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(input => {
      const id = input.getAttribute('id');
      if (id && document.querySelector(`label[for="${id}"]`)) inputsWithLabels++;
      if (input.getAttribute('placeholder')) inputsWithPlaceholder++;
      if (input.hasAttribute('required')) inputsWithRequired++;
    });

    // Tables
    const tables = document.querySelectorAll('table');
    let withCaption = 0, withThead = 0, withTh = 0, withScope = 0;
    tables.forEach(t => {
      if (t.querySelector('caption')) withCaption++;
      if (t.querySelector('thead')) withThead++;
      if (t.querySelector('th')) withTh++;
      if (t.querySelector('th[scope]')) withScope++;
    });

    // semantic structure
    const semanticStructure: string[] = [];
    if (html5Tags.header) semanticStructure.push('header');
    if (html5Tags.nav) semanticStructure.push('nav');
    if (html5Tags.main) semanticStructure.push('main');
    if (html5Tags.article) semanticStructure.push('article');
    if (html5Tags.section) semanticStructure.push('section');
    if (html5Tags.aside) semanticStructure.push('aside');
    if (html5Tags.footer) semanticStructure.push('footer');

    // score
    let semanticScore = 0;
    if (html5Tags.main) semanticScore += 20;
    if (html5Tags.nav) semanticScore += 15;
    if (html5Tags.header) semanticScore += 10;
    if (html5Tags.footer) semanticScore += 10;
    if (html5Tags.article || html5Tags.section) semanticScore += 15;
    if (roles > 0) semanticScore += 10;
    if (labels > 0) semanticScore += 10;
    semanticScore = Math.min(100, semanticScore + 10); // base 10

    const improvements: Array<{ current: string; suggested: string; reason: string }> = [];
    if (!html5Tags.main) improvements.push({ current: 'div', suggested: 'main', reason: '페이지 주요 콘텐츠 영역을 main 태그로 감싸세요' });
    if (!html5Tags.nav) improvements.push({ current: 'div', suggested: 'nav', reason: '내비게이션 영역을 nav 태그로 감싸세요' });
    if (!html5Tags.header) improvements.push({ current: 'div', suggested: 'header', reason: '헤더 영역을 header 태그로 감싸세요' });
    if (!html5Tags.footer) improvements.push({ current: 'div', suggested: 'footer', reason: '푸터 영역을 footer 태그로 감싸세요' });

    return {
      html5Tags,
      textEmphasis,
      genericTags: { div: divCount, span: spanCount, total: divCount + spanCount },
      aria: { roles, labels, describedby, labelledby, hidden, live },
      forms: { total: forms, inputs, labels: formLabels, inputsWithLabels, inputsWithPlaceholder, inputsWithRequired },
      tables: { total: tables.length, withCaption, withThead, withTh, withScope },
      semanticStructure,
      semanticScore,
      improvements,
    } as SemanticData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (!data.html5Tags.main) {
    issues.push({ severity: 'warning', message: 'main 태그가 없습니다', details: {}, suggestion: '페이지 주요 콘텐츠 영역을 <main>으로 감싸세요' });
  } else {
    passed.push({ message: 'main 태그가 존재합니다', details: {} });
  }

  if (!data.html5Tags.nav) {
    issues.push({ severity: 'info', message: 'nav 태그가 없습니다', details: {}, suggestion: '내비게이션 영역을 <nav>로 감싸세요' });
  }

  if (data.forms.inputs > 0 && data.forms.inputsWithLabels === 0) {
    issues.push({ severity: 'warning', message: 'form input에 연결된 label이 없습니다', details: { inputs: data.forms.inputs }, suggestion: 'input 요소에 label을 연결하세요' });
  }

  return makeCategory('시맨틱 구조', issues, passed, data, start);
}
