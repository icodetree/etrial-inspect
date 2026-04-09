/**
 * SEO Analyzer Engine (SOYOYU JSON 구조 기반)
 * Playwright page.evaluate() 기반 11개 카테고리 분석
 */
import type { Browser, Page } from 'playwright-core';
import type {
  SEOAnalysisResult,
  SEOCategory,
  SEOIssue,
  SEOPassed,
  MetaData,
  HeadingData,
  ImageData,
  ImageItem,
  LinkData,
  LinkItem,
  SocialData,
  ContentData,
  SemanticData,
  A11yData,
  SchemaData,
  TechnicalData,
  GeoData,
} from '@/types/seo';

// ---------------------------------------------------------------------------
// Score helper
// ---------------------------------------------------------------------------
function calcScore(issues: SEOIssue[]): number {
  let score = 100;
  for (const i of issues) {
    if (i.severity === 'critical') score -= 20;
    else if (i.severity === 'warning') score -= 10;
    else score -= 5;
  }
  return Math.max(0, score);
}

function makeCategory<T>(name: string, issues: SEOIssue[], passed: SEOPassed[], data: T, startMs: number): SEOCategory<T> {
  return { name, score: calcScore(issues), issues, passed, data, executionTime: Date.now() - startMs };
}

// ---------------------------------------------------------------------------
// 1. Meta
// ---------------------------------------------------------------------------
async function analyzeMeta(page: Page): Promise<SEOCategory<MetaData>> {
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

// ---------------------------------------------------------------------------
// 2. Heading
// ---------------------------------------------------------------------------
async function analyzeHeading(page: Page): Promise<SEOCategory<HeadingData>> {
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

// ---------------------------------------------------------------------------
// 3. Image
// ---------------------------------------------------------------------------
async function analyzeImage(page: Page): Promise<SEOCategory<ImageData>> {
  const start = Date.now();

  // DOM에서 이미지 정보 수집
  const rawImages = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    return imgs.map((img, i) => {
      const src = img.src || img.getAttribute('data-src') || '';
      const alt = img.getAttribute('alt');
      const filename = src.split('/').pop()?.split('?')[0] || '';
      const ext = filename.split('.').pop()?.toLowerCase() || '';
      return {
        index: i,
        src,
        alt: alt ?? '',
        htmlCode: img.outerHTML.substring(0, 500),
        hasAlt: alt !== null,
        isEmptyAlt: alt === '',
        hasTitle: img.hasAttribute('title'),
        loading: img.getAttribute('loading'),
        hasLazyLoading: img.getAttribute('loading') === 'lazy',
        hasWidth: img.hasAttribute('width') || !!img.style.width,
        hasHeight: img.hasAttribute('height') || !!img.style.height,
        extension: ext,
        filename,
        isMeaningful: /[a-z]{3,}/i.test(filename.replace(/\.\w+$/, '')),
      };
    });
  });

  // 파일 크기 병렬 수집 (HEAD 요청)
  const images: ImageItem[] = await Promise.all(
    rawImages.map(async (img) => {
      let fileSize = 0;
      try {
        if (img.src && img.src.startsWith('http')) {
          const resp = await fetch(img.src, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          const cl = resp.headers.get('content-length');
          if (cl) fileSize = parseInt(cl, 10);
        }
      } catch { /* ignore */ }
      const fileSizeKB = Math.round(fileSize / 1024);
      return {
        ...img,
        fileSize,
        fileSizeKB,
        isLarge: fileSizeKB > 200,
        isVeryLarge: fileSizeKB > 1000,
      };
    })
  );

  const total = images.length;
  const stats = {
    missingAlt: images.filter(i => !i.hasAlt).length,
    emptyAlt: images.filter(i => i.isEmptyAlt).length,
    withTitle: images.filter(i => i.hasTitle).length,
    lazyLoading: images.filter(i => i.hasLazyLoading).length,
    missingDimensions: images.filter(i => !i.hasWidth || !i.hasHeight).length,
    webpFormat: images.filter(i => i.extension === 'webp').length,
    avifFormat: images.filter(i => i.extension === 'avif').length,
    meaningfulFilenames: images.filter(i => i.isMeaningful).length,
    largeImages: images.filter(i => i.isLarge).length,
    veryLargeImages: images.filter(i => i.isVeryLarge).length,
    totalSize: images.reduce((a, b) => a + b.fileSize, 0),
    avgSize: total > 0 ? Math.round(images.reduce((a, b) => a + b.fileSize, 0) / total) : 0,
  };

  const data: ImageData = { total, images, stats };
  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (stats.missingAlt > 0) {
    issues.push({ severity: 'critical', message: `alt 속성이 없는 이미지 ${stats.missingAlt}개`, details: { count: stats.missingAlt }, suggestion: '모든 이미지에 alt 속성을 추가하세요' });
  } else if (total > 0) {
    passed.push({ message: '모든 이미지에 alt 속성이 있습니다', details: {} });
  }

  if (stats.missingDimensions > 0) {
    issues.push({ severity: 'warning', message: `width/height가 없는 이미지 ${stats.missingDimensions}개`, details: { count: stats.missingDimensions }, suggestion: 'CLS 방지를 위해 이미지에 width/height를 명시하세요' });
  }

  if (total > 0 && stats.lazyLoading === 0) {
    issues.push({ severity: 'warning', message: 'lazy loading이 적용된 이미지가 없습니다', details: {}, suggestion: 'loading="lazy" 속성을 적용하세요' });
  }

  if (stats.veryLargeImages > 0) {
    issues.push({ severity: 'warning', message: `1MB 이상의 매우 큰 이미지 ${stats.veryLargeImages}개`, details: { count: stats.veryLargeImages }, suggestion: '이미지를 압축하거나 WebP/AVIF 형식으로 변환하세요' });
  }

  return makeCategory('이미지', issues, passed, data, start);
}

// ---------------------------------------------------------------------------
// 4. Link
// ---------------------------------------------------------------------------
async function analyzeLink(page: Page): Promise<SEOCategory<LinkData>> {
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

// ---------------------------------------------------------------------------
// 5. Social
// ---------------------------------------------------------------------------
async function analyzeSocial(page: Page): Promise<SEOCategory<SocialData>> {
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

// ---------------------------------------------------------------------------
// 6. Content
// ---------------------------------------------------------------------------
async function analyzeContent(page: Page): Promise<SEOCategory<ContentData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    const bodyText = document.body.innerText || '';
    const bodyHtml = document.body.innerHTML || '';
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

// ---------------------------------------------------------------------------
// 7. Semantic
// ---------------------------------------------------------------------------
async function analyzeSemantic(page: Page): Promise<SEOCategory<SemanticData>> {
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

// ---------------------------------------------------------------------------
// 8. Accessibility
// ---------------------------------------------------------------------------
async function analyzeAccessibility(page: Page): Promise<SEOCategory<A11yData>> {
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

// ---------------------------------------------------------------------------
// 9. Schema
// ---------------------------------------------------------------------------
async function analyzeSchema(page: Page): Promise<SEOCategory<SchemaData>> {
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

// ---------------------------------------------------------------------------
// 10. Technical
// ---------------------------------------------------------------------------
async function analyzeTechnical(page: Page): Promise<SEOCategory<TechnicalData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    // Performance
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const nav = navEntries[0] || null;

    const paintEntries = performance.getEntriesByType('paint') as PerformancePaintTiming[];
    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');

    const coreWebVitals = {
      lcp: null as number | null,
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      cls: null as number | null,
      fid: null as number | null,
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
    };

    // Crawlability
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || null;
    const metaRobots = document.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
    const hreflangEls = Array.from(document.querySelectorAll('link[hreflang]'));
    const hreflang = hreflangEls.map(el => `${el.getAttribute('hreflang')}:${el.getAttribute('href')}`);
    const alternateEls = Array.from(document.querySelectorAll('link[rel="alternate"]'));
    const alternateLinks = alternateEls.map(el => el.getAttribute('href') || '');
    const paginationPrev = document.querySelector('link[rel="prev"]')?.getAttribute('href') || '';
    const paginationNext = document.querySelector('link[rel="next"]')?.getAttribute('href') || '';
    const pagination = [paginationPrev, paginationNext].filter(Boolean);

    // Resources
    const javascript = document.querySelectorAll('script[src]').length;
    const css = document.querySelectorAll('link[rel="stylesheet"]').length;

    // Security
    const allLinks = Array.from(document.querySelectorAll('a[href]'));
    let httpsLinks = 0, httpLinks = 0;
    allLinks.forEach(a => {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('https://')) httpsLinks++;
      else if (href.startsWith('http://')) httpLinks++;
    });

    // Doctype
    const dt = document.doctype;

    return {
      coreWebVitals,
      crawlability: { canonical, metaRobots, hreflang, alternateLinks, pagination },
      resources: { javascript, css },
      validation: [],
      security: { httpsLinks, httpLinks },
      doctype: { exists: !!dt, name: dt ? dt.name : '' },
    } as TechnicalData;
  });

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (!data.doctype.exists) {
    issues.push({ severity: 'warning', message: 'DOCTYPE 선언이 없습니다', details: {}, suggestion: '<!DOCTYPE html>을 추가하세요' });
  } else {
    passed.push({ message: 'DOCTYPE이 선언되어 있습니다', details: {} });
  }

  if (data.coreWebVitals.ttfb !== null && data.coreWebVitals.ttfb > 800) {
    issues.push({ severity: 'warning', message: `TTFB가 느립니다 (${data.coreWebVitals.ttfb}ms)`, details: { ttfb: data.coreWebVitals.ttfb }, suggestion: '서버 응답 시간을 개선하세요 (목표: 800ms 이하)' });
  }

  if (data.security.httpLinks > 0) {
    issues.push({ severity: 'warning', message: `HTTP 링크 ${data.security.httpLinks}개 발견`, details: { count: data.security.httpLinks }, suggestion: '모든 링크를 HTTPS로 변경하세요' });
  }

  if (data.resources.javascript > 30) {
    issues.push({ severity: 'info', message: `외부 JavaScript 파일이 많습니다 (${data.resources.javascript}개)`, details: { count: data.resources.javascript }, suggestion: 'JavaScript 파일을 번들링하거나 지연 로딩을 적용하세요' });
  }

  return makeCategory('기술 분석', issues, passed, data, start);
}

// ---------------------------------------------------------------------------
// 11. GEO (AI 최적화)
// ---------------------------------------------------------------------------
async function analyzeGeo(page: Page, baseUrl: string): Promise<SEOCategory<GeoData>> {
  const start = Date.now();

  // llms.txt 확인
  let llmsExists = false;
  let llmsContent: string | undefined;
  try {
    const resp = await fetch(`${baseUrl}/llms.txt`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      llmsExists = true;
      llmsContent = await resp.text();
    }
  } catch { /* not found */ }

  // llms.txt 구조 분석
  const structure = {
    hasH1: false, hasH2: false, hasH3: false,
    paragraphCount: 0, wordCount: 0, codeBlockCount: 0,
  };
  const contentQuality = {
    hasSummary: false, hasKeywords: false,
    readabilityScore: 0, structureScore: 0,
  };
  let brokenLinks: string[] = [];

  if (llmsContent) {
    structure.hasH1 = /^# /m.test(llmsContent);
    structure.hasH2 = /^## /m.test(llmsContent);
    structure.hasH3 = /^### /m.test(llmsContent);
    structure.paragraphCount = llmsContent.split(/\n\n+/).filter(p => p.trim().length > 0).length;
    structure.wordCount = llmsContent.split(/\s+/).filter(w => w.length > 0).length;
    structure.codeBlockCount = (llmsContent.match(/```[\s\S]*?```/g) || []).length;

    // Quality
    const paragraphs = llmsContent.split(/\n\n+/).filter(p => p.trim().length > 0);
    const firstP = paragraphs[0] || '';
    contentQuality.hasSummary = firstP.length > 50 && firstP.length < 300;
    contentQuality.hasKeywords = structure.wordCount > 20;
    contentQuality.structureScore = (structure.hasH1 ? 30 : 0) + (structure.hasH2 ? 20 : 0) + (structure.hasH3 ? 10 : 0);
    const listCount = (llmsContent.match(/^[\-\*] /gm) || []).length;
    contentQuality.readabilityScore = listCount > 0 ? 10 : 5;

    // Broken links check
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const matches = [...llmsContent.matchAll(linkRegex)];
    const linkChecks = await Promise.allSettled(
      matches.map(async (m) => {
        const linkUrl = m[2].startsWith('http') ? m[2] : `${baseUrl}${m[2].startsWith('/') ? '' : '/'}${m[2]}`;
        try {
          const resp = await fetch(linkUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
          if (!resp.ok) return m[2];
        } catch {
          return m[2];
        }
        return null;
      })
    );
    brokenLinks = linkChecks
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter((v): v is string => v !== null);
  }

  // robots.txt AI crawler 허용 여부
  const robotsAiCrawlers = { googleBot: true, gptBot: true, claudeBot: true, bingBot: true };
  try {
    const resp = await fetch(`${baseUrl}/robots.txt`, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) {
      const text = await resp.text();
      // 간단한 User-agent + Disallow: / 패턴 탐지
      const blocks = text.split(/(?=User-agent:)/i);
      for (const block of blocks) {
        const agentMatch = block.match(/User-agent:\s*(.+)/i);
        if (!agentMatch) continue;
        const agent = agentMatch[1].trim().toLowerCase();
        const hasDisallowAll = /Disallow:\s*\/\s*$/m.test(block);
        if (hasDisallowAll) {
          if (agent === 'gptbot') robotsAiCrawlers.gptBot = false;
          if (agent === 'claudebot' || agent === 'claude-web') robotsAiCrawlers.claudeBot = false;
          if (agent === 'googlebot' || agent === 'google-extended') robotsAiCrawlers.googleBot = false;
          if (agent === 'bingbot') robotsAiCrawlers.bingBot = false;
          if (agent === '*') {
            robotsAiCrawlers.gptBot = false;
            robotsAiCrawlers.claudeBot = false;
            robotsAiCrawlers.googleBot = false;
            robotsAiCrawlers.bingBot = false;
          }
        }
      }
    }
  } catch { /* unable to fetch robots.txt */ }

  // GEO score
  let geoScore = 0;
  if (llmsExists) geoScore += 40;
  if (contentQuality.structureScore >= 30) geoScore += 20;
  if (contentQuality.hasSummary) geoScore += 10;
  if (contentQuality.hasKeywords) geoScore += 10;
  if (robotsAiCrawlers.gptBot) geoScore += 5;
  if (robotsAiCrawlers.claudeBot) geoScore += 5;
  if (robotsAiCrawlers.googleBot) geoScore += 5;
  if (robotsAiCrawlers.bingBot) geoScore += 5;

  const data: GeoData = {
    llmsTxt: {
      exists: llmsExists,
      content: llmsContent,
      structure,
      contentQuality,
      brokenLinks,
      suggestedContent: llmsExists ? undefined : generateDefaultLlmsTxt(baseUrl),
    },
    robotsAiCrawlers,
    score: Math.min(100, geoScore),
  };

  const issues: SEOIssue[] = [];
  const passed: SEOPassed[] = [];

  if (!llmsExists) {
    issues.push({ severity: 'warning', message: 'llms.txt 파일이 없습니다', details: {}, suggestion: 'AI 크롤러를 위한 llms.txt 파일을 생성하세요' });
  } else {
    passed.push({ message: 'llms.txt 파일이 존재합니다', details: { wordCount: structure.wordCount } });
  }

  if (!robotsAiCrawlers.gptBot) {
    issues.push({ severity: 'info', message: 'GPTBot이 robots.txt에서 차단되어 있습니다', details: {}, suggestion: 'AI 검색 노출을 원하면 GPTBot을 허용하세요' });
  }
  if (!robotsAiCrawlers.claudeBot) {
    issues.push({ severity: 'info', message: 'ClaudeBot이 robots.txt에서 차단되어 있습니다', details: {}, suggestion: 'AI 검색 노출을 원하면 ClaudeBot을 허용하세요' });
  }

  return makeCategory('AI 최적화 (GEO)', issues, passed, data, start);
}

function generateDefaultLlmsTxt(baseUrl: string): string {
  const domain = new URL(baseUrl).hostname.replace('www.', '');
  const siteName = domain.split('.')[0];
  return `# ${siteName}

## 서비스 개요
${siteName}는 [서비스 설명]을 제공하는 웹사이트입니다.

## 주요 기능
- 기능 1: [설명]
- 기능 2: [설명]

## 연락처
- 웹사이트: ${baseUrl}
- 이메일: contact@${domain}
`;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

function safeValue<T>(result: PromiseSettledResult<SEOCategory<T>>, defaultName: string, defaultData: T): SEOCategory<T> {
  if (result.status === 'fulfilled') return result.value;
  console.error(`[SEO Analyzer] ${defaultName} failed:`, result.reason);
  return { name: defaultName, score: 0, issues: [], passed: [], data: defaultData };
}

export async function analyzePage(browser: Browser, url: string): Promise<SEOAnalysisResult> {
  const page = await browser.newPage();
  const startTime = Date.now();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Best-effort networkidle
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch { /* proceed anyway */ }

    const pageTitle = await page.title();
    const origin = new URL(url).origin;

    const results = await Promise.allSettled([
      analyzeMeta(page),
      analyzeHeading(page),
      analyzeImage(page),
      analyzeLink(page),
      analyzeSocial(page),
      analyzeContent(page),
      analyzeSemantic(page),
      analyzeAccessibility(page),
      analyzeSchema(page),
      analyzeTechnical(page),
      analyzeGeo(page, origin),
    ]);

    const categories = {
      meta: safeValue(results[0] as PromiseSettledResult<SEOCategory<MetaData>>, '메타 태그', {} as MetaData),
      heading: safeValue(results[1] as PromiseSettledResult<SEOCategory<HeadingData>>, '헤딩 구조', {} as HeadingData),
      image: safeValue(results[2] as PromiseSettledResult<SEOCategory<ImageData>>, '이미지', {} as ImageData),
      link: safeValue(results[3] as PromiseSettledResult<SEOCategory<LinkData>>, '링크', {} as LinkData),
      social: safeValue(results[4] as PromiseSettledResult<SEOCategory<SocialData>>, '소셜 미디어', {} as SocialData),
      content: safeValue(results[5] as PromiseSettledResult<SEOCategory<ContentData>>, '콘텐츠', {} as ContentData),
      semantic: safeValue(results[6] as PromiseSettledResult<SEOCategory<SemanticData>>, '시맨틱 구조', {} as SemanticData),
      accessibility: safeValue(results[7] as PromiseSettledResult<SEOCategory<A11yData>>, '접근성', {} as A11yData),
      schema: safeValue(results[8] as PromiseSettledResult<SEOCategory<SchemaData>>, '구조화 데이터', {} as SchemaData),
      technical: safeValue(results[9] as PromiseSettledResult<SEOCategory<TechnicalData>>, '기술 분석', {} as TechnicalData),
      geo: safeValue(results[10] as PromiseSettledResult<SEOCategory<GeoData>>, 'AI 최적화 (GEO)', {} as GeoData),
    };

    // 평균 점수
    const scores = Object.values(categories).map(c => c.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    return {
      score: avgScore,
      url,
      title: pageTitle,
      timestamp: Date.now(),
      executionTime: Date.now() - startTime,
      categories,
    };
  } finally {
    await page.close();
  }
}
