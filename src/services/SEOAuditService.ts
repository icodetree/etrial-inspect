import type { Browser } from 'playwright-core';
import { analyzePage } from '@/lib/seo-analyzer';
import type { SEOAnalysisResult } from '@/types/seo';

/**
 * SEO 감사 서비스 (SOYOYU 구조 기반)
 * analyzePage() 엔진을 호출하는 얇은 래퍼
 */
export class SEOAuditService {
  async runFullAudit(browser: Browser, url: string): Promise<SEOAnalysisResult> {
    return analyzePage(browser, url);
  }
}

// 싱글톤 인스턴스 export
export const seoAuditService = new SEOAuditService();
