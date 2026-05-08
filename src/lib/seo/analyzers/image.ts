/**
 * SEO Analyzer — 3. Image 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { ImageData, ImageItem } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeImage(page: Page): Promise<SEOCategory<ImageData>> {
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
