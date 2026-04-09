// analyzePage 모킹
jest.mock('@/lib/seo-analyzer', () => ({
  analyzePage: jest.fn().mockResolvedValue({
    score: 75,
    url: 'https://example.com',
    title: 'Example',
    timestamp: Date.now(),
    executionTime: 1000,
    categories: {
      meta: { name: '메타 태그', score: 80, issues: [], passed: [], data: {} },
      heading: { name: '헤딩 구조', score: 90, issues: [], passed: [], data: {} },
      image: { name: '이미지', score: 70, issues: [], passed: [], data: {} },
      link: { name: '링크', score: 85, issues: [], passed: [], data: {} },
      social: { name: '소셜 미디어', score: 60, issues: [], passed: [], data: {} },
      content: { name: '콘텐츠', score: 75, issues: [], passed: [], data: {} },
      semantic: { name: '시맨틱 구조', score: 65, issues: [], passed: [], data: {} },
      accessibility: { name: '접근성', score: 80, issues: [], passed: [], data: {} },
      schema: { name: '구조화 데이터', score: 50, issues: [], passed: [], data: {} },
      technical: { name: '기술 분석', score: 85, issues: [], passed: [], data: {} },
      geo: { name: 'AI 최적화 (GEO)', score: 70, issues: [], passed: [], data: {
        llmsTxt: { exists: true, structure: { hasH1: true, hasH2: true, hasH3: false, paragraphCount: 3, wordCount: 150, codeBlockCount: 0 },
          contentQuality: { hasSummary: true, hasKeywords: true, readabilityScore: 8, structureScore: 50 }, brokenLinks: [] },
        robotsAiCrawlers: { googleBot: true, gptBot: true, claudeBot: true, bingBot: true },
        score: 70,
      }},
    },
  }),
}));

import { SEOAuditService } from '../SEOAuditService';

describe('SEOAuditService - SOYOYU 구조: GEO/AI 분석', () => {
  let service: SEOAuditService;

  beforeEach(() => {
    service = new SEOAuditService();
  });

  test('runFullAudit should return GEO category with llms.txt data', async () => {
    const mockBrowser = {} as any;
    const result = await service.runFullAudit(mockBrowser, 'https://example.com');

    expect(result).toBeDefined();
    expect(result.score).toBe(75);
    expect(result.categories.geo).toBeDefined();
    expect(result.categories.geo.data.llmsTxt?.exists).toBe(true);
    expect(result.categories.geo.data.robotsAiCrawlers?.gptBot).toBe(true);
  });
});
