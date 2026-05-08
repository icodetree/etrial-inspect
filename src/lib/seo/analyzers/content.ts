/**
 * SEO Analyzer — 6. Content 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { ContentData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeContent(page: Page): Promise<SEOCategory<ContentData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const body = document.body;
    const bodyText = body ? (body.innerText || '') : '';
    const bodyHtml = body ? (body.innerHTML || '') : '';
    const words = bodyText.split(/\s+/).filter(w => w.length > 0);
    const koreanWords = words.filter(w => /[\uAC00-\uD7A3]/.test(w)).length;
    const englishWords = words.filter(w => /^[a-zA-Z]+$/.test(w)).length;
    const chars = bodyText.length;
    const charsNoSpaces = bodyText.replace(/\s/g, '').length;
    const sentences = bodyText.split(/[.!?。]+/).filter(s => s.trim().length > 0);
    const paragraphs = document.querySelectorAll('p');
    const textHtmlRatio = bodyHtml.length > 0 ? Math.round((bodyText.length / bodyHtml.length) * 10000) / 100 : 0;

    // paragraph stats
    const pTexts = Array.from(paragraphs).map(p => (p.textContent || '').trim());
    const nonEmpty = pTexts.filter(t => t.length > 0);
    const shortP = nonEmpty.filter(t => t.length < 50);

    // lists
    const ul = document.querySelectorAll('ul').length;
    const ol = document.querySelectorAll('ol').length;
    const dl = document.querySelectorAll('dl').length;

    // top keywords (simple word frequency)
    const freq: Record<string, number> = {};
    const totalW = words.length;
    for (const w of words) {
      const lower = w.toLowerCase().replace(/[^a-z0-9\uAC00-\uD7A3]/g, '');
      if (lower.length < 2) continue;
      freq[lower] = (freq[lower] || 0) + 1;
    }
    const topKeywords = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count, density: totalW > 0 ? Math.round((count / totalW) * 10000) / 100 : 0 }));

    // reading time (avg 200 wpm Korean, 250 wpm English)
    const readingTime = Math.ceil(words.length / 200);

    // sentence structure
    const sentLengths = sentences.map(s => s.trim().split(/\s+/).length);
    const avgSentLen = sentLengths.length > 0 ? Math.round(sentLengths.reduce((a, b) => a + b, 0) / sentLengths.length) : 0;
    const shortS = sentLengths.filter(l => l < 10).length;
    const mediumS = sentLengths.filter(l => l >= 10 && l <= 25).length;
    const complexS = sentLengths.filter(l => l > 25).length;

    // readability (simplified)
    const readabilityScore = Math.max(0, Math.min(100, 100 - (avgSentLen - 15) * 3));

    return {
      stats: {
        totalWords: totalW,
        koreanWords,
        englishWords,
        characters: chars,
        charactersNoSpaces: charsNoSpaces,
        sentences: sentences.length,
        paragraphs: paragraphs.length,
        textHtmlRatio,
      },
      paragraphStats: {
        total: paragraphs.length,
        empty: pTexts.filter(t => t.length === 0).length,
        short: shortP.length,
        avgLength: nonEmpty.length > 0 ? Math.round(nonEmpty.reduce((a, b) => a + b.length, 0) / nonEmpty.length) : 0,
      },
      lists: { ul, ol, dl, total: ul + ol + dl },
      topKeywords,
      readingTime,
      sentenceStructure: {
        total: sentences.length,
        avgLength: avgSentLen,
        shortSentences: shortS,
        mediumSentences: mediumS,
        complexSentences: complexS,
        complexRatio: sentences.length > 0 ? Math.round((complexS / sentences.length) * 100) / 100 : 0,
      },
      readability: {
        score: readabilityScore,
        level: readabilityScore >= 70 ? 'easy' : readabilityScore >= 40 ? 'moderate' : 'difficult',
        avgSentenceLength: avgSentLen,
        avgSyllablesPerWord: 0, // simplified
      },
      duplicates: [],
    } as ContentData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (data.stats.totalWords < 300) {
    issues.push({ severity: 'warning', message: `콘텐츠 단어 수가 부족합니다 (${data.stats.totalWords}단어)`, details: { words: data.stats.totalWords }, suggestion: '검색 엔진 최적화를 위해 300단어 이상의 콘텐츠를 작성하세요' });
  } else {
    passed.push({ message: `충분한 콘텐츠 (${data.stats.totalWords}단어)`, details: {} });
  }

  if (data.stats.textHtmlRatio < 10) {
    issues.push({ severity: 'warning', message: `텍스트/HTML 비율이 낮습니다 (${data.stats.textHtmlRatio}%)`, details: { ratio: data.stats.textHtmlRatio }, suggestion: 'HTML 대비 텍스트 콘텐츠 비율을 높이세요' });
  }

  return makeCategory('콘텐츠', issues, passed, data, start);
}
