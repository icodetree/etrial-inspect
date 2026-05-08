/**
 * SEO Analyzer Engine (SOYOYU JSON 구조 기반)
 * Playwright page.evaluate() 기반 11개 카테고리 분석
 *
 * 각 analyzer는 개별 모듈로 분리되어 있으며, 이 파일은 analyzePage 진입점을 제공한다.
 */
import type { Browser } from 'playwright-core';
import type {
  SEOAnalysisResult,
  SEOCategory,
  MetaData,
  HeadingData,
  ImageData,
  LinkData,
  SocialData,
  ContentData,
  SemanticData,
  A11yData,
  SchemaData,
  TechnicalData,
  GeoData,
} from '@/types/seo';

import { safeValue, emptyCategory } from './types';
import { analyzeMeta } from './analyzers/meta';
import { analyzeHeading } from './analyzers/heading';
import { analyzeImage } from './analyzers/image';
import { analyzeLink } from './analyzers/link';
import { analyzeSocial } from './analyzers/social';
import { analyzeContent } from './analyzers/content';
import { analyzeSemantic } from './analyzers/semantic';
import { analyzeAccessibility } from './analyzers/accessibility';
import { analyzeSchema } from './analyzers/schema';
import { analyzeTechnical } from './analyzers/technical';
import { analyzeGeo } from './analyzers/geo';

export interface AnalyzePageOptions {
  /** SEO 카테고리(meta/heading/image/link/social/content/semantic/accessibility/schema/technical) 실행 여부 */
  includeSEO?: boolean;
  /** AI 친화도 카테고리(geo) 실행 여부 */
  includeAI?: boolean;
}

export async function analyzePage(
  browser: Browser,
  url: string,
  options: AnalyzePageOptions = {},
): Promise<SEOAnalysisResult> {
  const includeSEO = options.includeSEO ?? true;
  const includeAI = options.includeAI ?? true;

  const page = await browser.newPage();
  const startTime = Date.now();

  // 메인 페이지 응답의 HTTP 헤더 수집
  const responseHeaders = new Map<string, string>();
  page.on('response', (response) => {
    const baseUrl = url.split('?')[0];
    if (response.url() === url || response.url().startsWith(baseUrl)) {
      const headers = response.headers();
      if (headers['content-encoding']) responseHeaders.set('content-encoding', headers['content-encoding']);
      if (headers['cache-control']) responseHeaders.set('cache-control', headers['cache-control']);
      if (headers['x-cache']) responseHeaders.set('x-cache', headers['x-cache']);
    }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Best-effort networkidle
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch { /* proceed anyway */ }

    const pageTitle = await page.title();
    const origin = new URL(url).origin;

    // Named task mapping — 각 analyzer를 이름으로 관리하여 positional indexing 제거
    const seoTaskMap = includeSEO
      ? {
          meta: analyzeMeta(page),
          heading: analyzeHeading(page),
          image: analyzeImage(page),
          link: analyzeLink(page),
          social: analyzeSocial(page),
          content: analyzeContent(page),
          semantic: analyzeSemantic(page),
          accessibility: analyzeAccessibility(page),
          schema: analyzeSchema(page),
          technical: analyzeTechnical(page, responseHeaders),
        }
      : null;

    const geoTask = includeAI ? analyzeGeo(page, origin) : null;

    // 병렬 실행: SEO tasks + GEO task
    const seoKeys = seoTaskMap ? (Object.keys(seoTaskMap) as Array<keyof typeof seoTaskMap>) : [];
    const seoPromises = seoTaskMap ? seoKeys.map(k => seoTaskMap[k]) : [];

    const [seoResults, geoResult] = await Promise.all([
      Promise.allSettled(seoPromises),
      geoTask ? Promise.allSettled([geoTask]) : Promise.resolve([]),
    ]);

    // SEO 결과를 이름 기반으로 매핑
    const seoResultMap = new Map<string, PromiseSettledResult<SEOCategory<unknown>>>();
    seoKeys.forEach((key, idx) => {
      seoResultMap.set(key, seoResults[idx]);
    });

    const categories = {
      meta: includeSEO
        ? safeValue(seoResultMap.get('meta') as PromiseSettledResult<SEOCategory<MetaData>>, '메타 태그', {} as MetaData)
        : emptyCategory('메타 태그', {} as MetaData),
      heading: includeSEO
        ? safeValue(seoResultMap.get('heading') as PromiseSettledResult<SEOCategory<HeadingData>>, '헤딩 구조', {} as HeadingData)
        : emptyCategory('헤딩 구조', {} as HeadingData),
      image: includeSEO
        ? safeValue(seoResultMap.get('image') as PromiseSettledResult<SEOCategory<ImageData>>, '이미지', {} as ImageData)
        : emptyCategory('이미지', {} as ImageData),
      link: includeSEO
        ? safeValue(seoResultMap.get('link') as PromiseSettledResult<SEOCategory<LinkData>>, '링크', {} as LinkData)
        : emptyCategory('링크', {} as LinkData),
      social: includeSEO
        ? safeValue(seoResultMap.get('social') as PromiseSettledResult<SEOCategory<SocialData>>, '소셜 미디어', {} as SocialData)
        : emptyCategory('소셜 미디어', {} as SocialData),
      content: includeSEO
        ? safeValue(seoResultMap.get('content') as PromiseSettledResult<SEOCategory<ContentData>>, '콘텐츠', {} as ContentData)
        : emptyCategory('콘텐츠', {} as ContentData),
      semantic: includeSEO
        ? safeValue(seoResultMap.get('semantic') as PromiseSettledResult<SEOCategory<SemanticData>>, '시맨틱 구조', {} as SemanticData)
        : emptyCategory('시맨틱 구조', {} as SemanticData),
      accessibility: includeSEO
        ? safeValue(seoResultMap.get('accessibility') as PromiseSettledResult<SEOCategory<A11yData>>, '접근성', {} as A11yData)
        : emptyCategory('접근성', {} as A11yData),
      schema: includeSEO
        ? safeValue(seoResultMap.get('schema') as PromiseSettledResult<SEOCategory<SchemaData>>, '구조화 데이터', {} as SchemaData)
        : emptyCategory('구조화 데이터', {} as SchemaData),
      technical: includeSEO
        ? safeValue(seoResultMap.get('technical') as PromiseSettledResult<SEOCategory<TechnicalData>>, '기술 분석', {} as TechnicalData)
        : emptyCategory('기술 분석', {} as TechnicalData),
      geo: includeAI
        ? safeValue(geoResult[0] as PromiseSettledResult<SEOCategory<GeoData>>, 'AI 최적화 (GEO)', {} as GeoData)
        : emptyCategory('AI 최적화 (GEO)', {} as GeoData),
    };

    // 평균 점수 — 실제 실행된 카테고리만 대상
    const executedScores: number[] = [];
    if (includeSEO) {
      executedScores.push(
        categories.meta.score,
        categories.heading.score,
        categories.image.score,
        categories.link.score,
        categories.social.score,
        categories.content.score,
        categories.semantic.score,
        categories.accessibility.score,
        categories.schema.score,
        categories.technical.score,
      );
    }
    if (includeAI) executedScores.push(categories.geo.score);

    const avgScore = executedScores.length
      ? Math.round(executedScores.reduce((a, b) => a + b, 0) / executedScores.length)
      : 0;

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
