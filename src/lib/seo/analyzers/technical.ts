/**
 * SEO Analyzer — 10. Technical 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { TechnicalData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeTechnical(page: Page, responseHeaders?: Map<string, string>): Promise<SEOCategory<TechnicalData>> {
  const start = Date.now();
  const data = await page.evaluate(() => {
    // Performance
    const navEntries = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    const nav = navEntries[0] || null;

    const paintEntries = performance.getEntriesByType('paint') as PerformancePaintTiming[];
    const fcpEntry = paintEntries.find(e => e.name === 'first-contentful-paint');

    // LCP: PerformanceObserver 엔트리에서 추출 (이미 로드 완료된 경우)
    const lcpEntries = performance.getEntriesByType('largest-contentful-paint') as PerformanceEntry[];
    const lcp = lcpEntries.length > 0 ? Math.round(lcpEntries[lcpEntries.length - 1].startTime) : null;

    // CLS: LayoutShift 엔트리에서 합산
    const clsEntries = performance.getEntriesByType('layout-shift') as (PerformanceEntry & { value: number })[];
    const cls = clsEntries.length > 0
      ? Math.round(clsEntries.reduce((sum: number, e: PerformanceEntry & { value: number }) => sum + e.value, 0) * 1000) / 1000
      : null;

    const coreWebVitals = {
      lcp,
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : null,
      cls,
      fid: null as number | null, // FID는 실제 사용자 인터랙션 필요 — 자동화 측정 불가
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

  // HTTP 헤더 정보 병합
  const compression = responseHeaders?.get('content-encoding') || null;
  const cacheControl = responseHeaders?.get('cache-control') || null;
  data.httpHeaders = { compression, cacheControl };

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

  // LCP 성능 평가
  if (data.coreWebVitals.lcp !== null) {
    if (data.coreWebVitals.lcp > 2500) {
      issues.push({ severity: 'warning', message: `LCP가 느립니다 (${data.coreWebVitals.lcp}ms)`, details: { lcp: data.coreWebVitals.lcp }, suggestion: 'Largest Contentful Paint를 개선하세요 (목표: 2500ms 이하)' });
    } else {
      passed.push({ message: `LCP 양호 (${data.coreWebVitals.lcp}ms)`, details: { lcp: data.coreWebVitals.lcp } });
    }
  }

  // CLS 평가
  if (data.coreWebVitals.cls !== null) {
    if (data.coreWebVitals.cls > 0.1) {
      issues.push({ severity: 'warning', message: `CLS가 높습니다 (${data.coreWebVitals.cls})`, details: { cls: data.coreWebVitals.cls }, suggestion: 'Cumulative Layout Shift를 줄이세요 (목표: 0.1 이하)' });
    } else {
      passed.push({ message: `CLS 양호 (${data.coreWebVitals.cls})`, details: { cls: data.coreWebVitals.cls } });
    }
  }

  // 압축(GZIP/Brotli) 확인
  if (compression && (compression.includes('gzip') || compression.includes('br'))) {
    passed.push({ message: `응답 압축 적용됨 (${compression})`, details: { encoding: compression } });
  } else if (compression === null) {
    issues.push({ severity: 'info', message: '응답 압축(GZIP/Brotli)이 감지되지 않았습니다', details: {}, suggestion: '서버에서 GZIP 또는 Brotli 압축을 활성화하세요' });
  }

  // Cache-Control 확인
  if (cacheControl) {
    passed.push({ message: `Cache-Control 헤더 설정됨 (${cacheControl})`, details: { cacheControl } });
  } else {
    issues.push({ severity: 'info', message: 'Cache-Control 헤더가 설정되지 않았습니다', details: {}, suggestion: '적절한 캐시 정책을 설정하세요' });
  }

  if (data.security.httpLinks > 0) {
    issues.push({ severity: 'warning', message: `HTTP 링크 ${data.security.httpLinks}개 발견`, details: { count: data.security.httpLinks }, suggestion: '모든 링크를 HTTPS로 변경하세요' });
  }

  if (data.resources.javascript > 30) {
    issues.push({ severity: 'info', message: `외부 JavaScript 파일이 많습니다 (${data.resources.javascript}개)`, details: { count: data.resources.javascript }, suggestion: 'JavaScript 파일을 번들링하거나 지연 로딩을 적용하세요' });
  }

  return makeCategory('기술 분석', issues, passed, data, start);
}
