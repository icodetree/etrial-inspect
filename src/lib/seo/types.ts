/**
 * SEO Analyzer 공통 유틸리티 함수 및 타입 re-export
 */
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';

export type { SEOCategory, SEOIssue, SEOPassed };

export function calcScore(issues: SEOIssue[]): number {
  let score = 100;
  for (const i of issues) {
    if (i.severity === 'critical') score -= 20;
    else if (i.severity === 'warning') score -= 10;
    else score -= 5;
  }
  return Math.max(0, score);
}

export function makeCategory<T>(name: string, issues: SEOIssue[], passed: SEOPassed[], data: T, startMs: number): SEOCategory<T> {
  return { name, score: calcScore(issues), issues, passed, data, executionTime: Date.now() - startMs };
}

export function safeValue<T>(result: PromiseSettledResult<SEOCategory<T>>, defaultName: string, defaultData: T): SEOCategory<T> {
  if (result.status === 'fulfilled') return result.value;
  console.error(`[SEO Analyzer] ${defaultName} failed:`, result.reason);
  return { name: defaultName, score: 0, issues: [], passed: [], data: defaultData };
}

export function emptyCategory<T>(name: string, defaultData: T): SEOCategory<T> {
  return { name, score: 0, issues: [], passed: [], data: defaultData, executionTime: 0 };
}
