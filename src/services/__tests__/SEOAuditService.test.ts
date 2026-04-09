import { SEOAuditService } from '../SEOAuditService';

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
      geo: { name: 'AI 최적화 (GEO)', score: 70, issues: [], passed: [], data: {} },
    },
  }),
}));

describe('SEOAuditService - SOYOYU 구조 기반', () => {
  let service: SEOAuditService;

  beforeEach(() => {
    service = new SEOAuditService();
    jest.clearAllMocks();
  });

  test('runFullAudit should delegate to analyzePage and return SEOAnalysisResult', async () => {
    const mockBrowser = {} as any;
    const result = await service.runFullAudit(mockBrowser, 'https://example.com');

    expect(result).toHaveProperty('score', 75);
    expect(result).toHaveProperty('url', 'https://example.com');
    expect(result).toHaveProperty('categories');
    expect(result.categories).toHaveProperty('meta');
    expect(result.categories).toHaveProperty('geo');
    expect(Object.keys(result.categories)).toHaveLength(11);
  });

  test('runFullAudit result categories should each have score, issues, passed, data', async () => {
    const mockBrowser = {} as any;
    const result = await service.runFullAudit(mockBrowser, 'https://example.com');

    for (const [, cat] of Object.entries(result.categories)) {
      expect(cat).toHaveProperty('name');
      expect(cat).toHaveProperty('score');
      expect(cat).toHaveProperty('issues');
      expect(cat).toHaveProperty('passed');
      expect(cat).toHaveProperty('data');
    }
  });
});
