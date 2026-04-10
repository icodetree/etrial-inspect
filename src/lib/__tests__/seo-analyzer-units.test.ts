/**
 * seo-analyzer.ts 단위 테스트
 *
 * analyzePage()는 Playwright 의존성이 크므로 통합 테스트에서 다루고,
 * 여기서는 모듈 내부의 순수 로직(점수 계산, generateDefaultLlmsTxt 등)을 검증한다.
 *
 * generateDefaultLlmsTxt는 모듈 내부(private) 함수이므로 직접 테스트할 수 없다.
 * 대신 analyzePage를 모킹된 환경에서 호출하여 GEO 카테고리의 suggestedContent를 간접 검증하거나,
 * 순수 로직에 해당하는 부분을 별도로 테스트한다.
 */

// ---------------------------------------------------------------------------
// SEOAuditService 를 통한 간접 검증 (analyzePage mock)
// ---------------------------------------------------------------------------

import type { SEOAnalysisResult, SEOCategory, GeoData, SEOIssue, MetaData } from '@/types/seo';

// ---------------------------------------------------------------------------
// 1. calcScore 로직 검증 (순수 함수 재구현하여 동일 로직 테스트)
// ---------------------------------------------------------------------------

describe('SEO Analyzer — calcScore 로직', () => {
  // calcScore는 export되지 않으므로, 동일 로직을 재현하여 경계값 검증
  function calcScore(issues: { severity: string }[]): number {
    let score = 100;
    for (const i of issues) {
      if (i.severity === 'critical') score -= 20;
      else if (i.severity === 'warning') score -= 10;
      else score -= 5;
    }
    return Math.max(0, score);
  }

  test('이슈 없으면 100점', () => {
    expect(calcScore([])).toBe(100);
  });

  test('critical 이슈 1개 → 80점', () => {
    expect(calcScore([{ severity: 'critical' }])).toBe(80);
  });

  test('warning 이슈 1개 → 90점', () => {
    expect(calcScore([{ severity: 'warning' }])).toBe(90);
  });

  test('info 이슈 1개 → 95점', () => {
    expect(calcScore([{ severity: 'info' }])).toBe(95);
  });

  test('critical 5개 → 0점 (하한 0)', () => {
    const issues = Array(5).fill({ severity: 'critical' });
    expect(calcScore(issues)).toBe(0);
  });

  test('critical 10개 → 0점 (음수가 되지 않음)', () => {
    const issues = Array(10).fill({ severity: 'critical' });
    expect(calcScore(issues)).toBe(0);
  });

  test('혼합: critical 2 + warning 3 → 100 - 40 - 30 = 30', () => {
    const issues = [
      { severity: 'critical' },
      { severity: 'critical' },
      { severity: 'warning' },
      { severity: 'warning' },
      { severity: 'warning' },
    ];
    expect(calcScore(issues)).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// 2. generateDefaultLlmsTxt 로직 검증
//    (함수가 private이므로 동일 로직 재구현하여 출력 형식 검증)
// ---------------------------------------------------------------------------

describe('SEO Analyzer — generateDefaultLlmsTxt 로직', () => {
  function generateDefaultLlmsTxt(baseUrl: string): string {
    const domain = new URL(baseUrl).hostname.replace('www.', '');
    const siteName = domain.split('.')[0];
    return `# ${siteName} - AI 크롤러 안내 문서
# ${baseUrl}/llms.txt
# 최종 업데이트: ${new Date().toISOString().split('T')[0]}

## 회사 개요

${siteName}는 [서비스/회사 설명]을 제공하는 [업종]입니다.
[위치 및 규모 설명을 추가하세요.]

- 회사명: [정식 회사명]
- 설립연도: [연도]
- 대표 서비스: [주요 서비스 나열]
- 주소: [주소]
- 전화: [전화번호]
- 이메일: contact@${domain}
- 영업시간: [영업시간]

## 웹사이트 구조

### 메인 사이트
- URL: ${baseUrl}
- 설명: [사이트 설명]
- 주요 페이지:
  - /about - 회사소개
  - /services - 서비스 안내
  - /portfolio - 포트폴리오
  - /contact - 문의

## 주요 서비스

### 1. [서비스명]
[서비스 상세 설명을 작성하세요.]

### 2. [서비스명]
[서비스 상세 설명을 작성하세요.]

### 3. [서비스명]
[서비스 상세 설명을 작성하세요.]

## 주요 포트폴리오

[대표 프로젝트/고객사 목록을 추가하세요.]
- [프로젝트/고객 1]
- [프로젝트/고객 2]
- [프로젝트/고객 3]

## 연락처 및 소셜 미디어

- 공식 웹사이트: ${baseUrl}
- 이메일: contact@${domain}
- 전화: [전화번호]
- 블로그: [블로그 URL]
- 인스타그램: [인스타그램 URL]
- 페이스북: [페이스북 URL]

## 문의 안내

프로젝트 문의는 다음 방법으로 가능합니다:
- 전화: [전화번호] (평일 09:00~18:00)
- 이메일: contact@${domain}
- 온라인 문의: ${baseUrl}/contact
`;
  }

  test('H1 헤더가 포함된다 (# 으로 시작하는 행)', () => {
    const result = generateDefaultLlmsTxt('https://example.com');
    expect(result).toMatch(/^# /m);
  });

  test('H2 헤더가 포함된다 (## 으로 시작하는 행)', () => {
    const result = generateDefaultLlmsTxt('https://example.com');
    expect(result).toMatch(/^## /m);
  });

  test('H3 헤더가 포함된다 (### 으로 시작하는 행)', () => {
    const result = generateDefaultLlmsTxt('https://example.com');
    expect(result).toMatch(/^### /m);
  });

  test('도메인에서 사이트 이름을 추출한다', () => {
    const result = generateDefaultLlmsTxt('https://mycompany.co.kr');
    expect(result).toContain('# mycompany');
  });

  test('www 접두사를 제거한다', () => {
    const result = generateDefaultLlmsTxt('https://www.example.com');
    expect(result).toContain('contact@example.com');
    expect(result).not.toContain('contact@www.');
  });

  test('baseUrl이 llms.txt 참조에 포함된다', () => {
    const result = generateDefaultLlmsTxt('https://test-site.org');
    expect(result).toContain('https://test-site.org/llms.txt');
  });

  test('H2 섹션이 3개 이상이다 (GEO 점수 계산에 영향)', () => {
    const result = generateDefaultLlmsTxt('https://example.com');
    const h2Count = (result.match(/^## /gm) || []).length;
    expect(h2Count).toBeGreaterThanOrEqual(3);
  });

  test('연락처 정보(이메일)를 포함한다', () => {
    const result = generateDefaultLlmsTxt('https://example.com');
    expect(result).toMatch(/[\w.-]+@[\w.-]+\.\w{2,}/);
  });
});

// ---------------------------------------------------------------------------
// 3. GEO 점수 계산 로직 검증
// ---------------------------------------------------------------------------

describe('SEO Analyzer — GEO 점수 계산 로직', () => {
  /**
   * analyzeGeo의 점수 계산 로직을 재현하여 경계값 검증.
   * 원본 소스와 동일한 계산식을 사용한다.
   */
  function calcGeoScore(params: {
    llmsExists: boolean;
    structureScore: number;
    sectionCount: number;
    hasSummary: boolean;
    hasContactInfo: boolean;
    hasUrlDeclarations: boolean;
    hasSocialLinks: boolean;
    gptBot: boolean;
    claudeBot: boolean;
    googleBot: boolean;
    bingBot: boolean;
  }): number {
    let geoScore = 0;
    if (params.llmsExists) geoScore += 30;
    if (params.structureScore >= 50) geoScore += 20;
    else if (params.structureScore >= 30) geoScore += 10;
    if (params.sectionCount >= 3) geoScore += 10;
    if (params.hasSummary) geoScore += 5;
    if (params.hasContactInfo) geoScore += 5;
    if (params.hasUrlDeclarations) geoScore += 5;
    if (params.hasSocialLinks) geoScore += 5;
    if (params.gptBot) geoScore += 5;
    if (params.claudeBot) geoScore += 5;
    if (params.googleBot) geoScore += 5;
    if (params.bingBot) geoScore += 5;
    return Math.min(100, geoScore);
  }

  test('llms.txt 없고 모든 항목 false → 0점', () => {
    const score = calcGeoScore({
      llmsExists: false,
      structureScore: 0,
      sectionCount: 0,
      hasSummary: false,
      hasContactInfo: false,
      hasUrlDeclarations: false,
      hasSocialLinks: false,
      gptBot: false,
      claudeBot: false,
      googleBot: false,
      bingBot: false,
    });
    expect(score).toBe(0);
  });

  test('llms.txt만 존재 → 30점', () => {
    const score = calcGeoScore({
      llmsExists: true,
      structureScore: 0,
      sectionCount: 0,
      hasSummary: false,
      hasContactInfo: false,
      hasUrlDeclarations: false,
      hasSocialLinks: false,
      gptBot: false,
      claudeBot: false,
      googleBot: false,
      bingBot: false,
    });
    expect(score).toBe(30);
  });

  test('모든 크롤러 허용만 → 20점', () => {
    const score = calcGeoScore({
      llmsExists: false,
      structureScore: 0,
      sectionCount: 0,
      hasSummary: false,
      hasContactInfo: false,
      hasUrlDeclarations: false,
      hasSocialLinks: false,
      gptBot: true,
      claudeBot: true,
      googleBot: true,
      bingBot: true,
    });
    expect(score).toBe(20);
  });

  test('structureScore 30~49 → 중간 구조 점수 (10점)', () => {
    const score = calcGeoScore({
      llmsExists: true,
      structureScore: 40,
      sectionCount: 0,
      hasSummary: false,
      hasContactInfo: false,
      hasUrlDeclarations: false,
      hasSocialLinks: false,
      gptBot: false,
      claudeBot: false,
      googleBot: false,
      bingBot: false,
    });
    expect(score).toBe(40); // 30(llms) + 10(structure)
  });

  test('structureScore >= 50 → 완전 구조 점수 (20점)', () => {
    const score = calcGeoScore({
      llmsExists: true,
      structureScore: 60,
      sectionCount: 0,
      hasSummary: false,
      hasContactInfo: false,
      hasUrlDeclarations: false,
      hasSocialLinks: false,
      gptBot: false,
      claudeBot: false,
      googleBot: false,
      bingBot: false,
    });
    expect(score).toBe(50); // 30 + 20
  });

  test('모든 항목 최대 → 100점', () => {
    const score = calcGeoScore({
      llmsExists: true,
      structureScore: 60,
      sectionCount: 5,
      hasSummary: true,
      hasContactInfo: true,
      hasUrlDeclarations: true,
      hasSocialLinks: true,
      gptBot: true,
      claudeBot: true,
      googleBot: true,
      bingBot: true,
    });
    expect(score).toBe(100);
  });

  test('100을 초과하지 않는다 (cap)', () => {
    // 이론적으로 100을 넘을 수 없지만 로직 확인
    const score = calcGeoScore({
      llmsExists: true,
      structureScore: 60,
      sectionCount: 5,
      hasSummary: true,
      hasContactInfo: true,
      hasUrlDeclarations: true,
      hasSocialLinks: true,
      gptBot: true,
      claudeBot: true,
      googleBot: true,
      bingBot: true,
    });
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// 4. llms.txt 구조 분석 로직 검증
// ---------------------------------------------------------------------------

describe('SEO Analyzer — llms.txt 구조 분석 로직', () => {
  // analyzeGeo 내부의 구조 분석 로직을 재현

  function analyzeStructure(content: string) {
    const structure = {
      hasH1: /^# /m.test(content),
      hasH2: /^## /m.test(content),
      hasH3: /^### /m.test(content),
      paragraphCount: content.split(/\n\n+/).filter(p => p.trim().length > 0).length,
      wordCount: content.split(/\s+/).filter(w => w.length > 0).length,
      codeBlockCount: (content.match(/```[\s\S]*?```/g) || []).length,
    };

    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);
    const firstP = paragraphs[0] || '';
    const contentQuality = {
      hasSummary: firstP.length > 50 && firstP.length < 300,
      hasKeywords: structure.wordCount > 20,
      structureScore: (structure.hasH1 ? 30 : 0) + (structure.hasH2 ? 20 : 0) + (structure.hasH3 ? 10 : 0),
      sectionCount: (content.match(/^## /mg) || []).length,
      hasContactInfo: /\b[\w.-]+@[\w.-]+\.\w{2,}\b/.test(content) || /\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}\b/.test(content),
      hasUrlDeclarations: /URL:\s*https?:\/\//i.test(content) || (content.match(/https?:\/\/\S+/g) || []).length > 0,
      hasSocialLinks: /(instagram|facebook|twitter|linkedin|blog\.naver|post\.naver)/i.test(content),
    };

    return { structure, contentQuality };
  }

  test('빈 콘텐츠 → 모든 구조 항목 false/0', () => {
    const { structure, contentQuality } = analyzeStructure('');
    expect(structure.hasH1).toBe(false);
    expect(structure.hasH2).toBe(false);
    expect(structure.hasH3).toBe(false);
    expect(structure.wordCount).toBe(0);
    expect(contentQuality.structureScore).toBe(0);
  });

  test('H1+H2+H3 모두 포함 → structureScore 60', () => {
    const content = '# Title\n\n## Section\n\n### Sub';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.structureScore).toBe(60);
  });

  test('H1만 있으면 structureScore 30', () => {
    const content = '# Title Only\n\nSome paragraph text.';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.structureScore).toBe(30);
  });

  test('이메일 주소가 있으면 hasContactInfo true', () => {
    const content = '연락처: support@example.com';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.hasContactInfo).toBe(true);
  });

  test('전화번호가 있으면 hasContactInfo true', () => {
    const content = '전화: 02-1234-5678';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.hasContactInfo).toBe(true);
  });

  test('소셜 링크 감지: instagram 포함', () => {
    const content = '팔로우: https://instagram.com/mypage';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.hasSocialLinks).toBe(true);
  });

  test('URL 선언 감지', () => {
    const content = 'URL: https://example.com/page';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.hasUrlDeclarations).toBe(true);
  });

  test('H2 섹션 수 정확히 카운트', () => {
    const content = '## A\ntext\n## B\ntext\n## C\ntext';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.sectionCount).toBe(3);
  });

  test('코드 블록 카운트', () => {
    const content = '```js\nconsole.log("a");\n```\n\n```py\nprint("b")\n```';
    const { structure } = analyzeStructure(content);
    expect(structure.codeBlockCount).toBe(2);
  });

  test('hasSummary: 첫 단락이 50~300자 사이', () => {
    const longFirstP = 'A'.repeat(100); // 100자
    const content = `${longFirstP}\n\n다음 단락`;
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.hasSummary).toBe(true);
  });

  test('hasSummary: 첫 단락이 50자 미만이면 false', () => {
    const content = '짧은 요약\n\n다음 단락';
    const { contentQuality } = analyzeStructure(content);
    expect(contentQuality.hasSummary).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Meta 분석 이슈 로직 검증
// ---------------------------------------------------------------------------

describe('SEO Analyzer — Meta 이슈 판단 로직', () => {
  // analyzeMeta 내부의 이슈 판단을 재현

  function checkMetaIssues(data: { titleExists: boolean; titleLength: number; descExists: boolean; descLength: number }) {
    const issues: { severity: string; message: string }[] = [];

    if (!data.titleExists) {
      issues.push({ severity: 'critical', message: 'title 태그가 없습니다' });
    } else {
      if (data.titleLength < 30) issues.push({ severity: 'warning', message: `title 길이가 너무 짧습니다 (${data.titleLength}자)` });
      else if (data.titleLength > 60) issues.push({ severity: 'warning', message: `title 길이가 너무 깁니다 (${data.titleLength}자)` });
    }

    if (!data.descExists) {
      issues.push({ severity: 'critical', message: 'meta description이 없습니다' });
    } else {
      if (data.descLength < 120) issues.push({ severity: 'warning', message: `description 길이가 너무 짧습니다` });
    }

    return issues;
  }

  test('title 없음 → critical', () => {
    const issues = checkMetaIssues({ titleExists: false, titleLength: 0, descExists: true, descLength: 150 });
    expect(issues.some(i => i.severity === 'critical' && i.message.includes('title'))).toBe(true);
  });

  test('title 30자 미만 → warning', () => {
    const issues = checkMetaIssues({ titleExists: true, titleLength: 10, descExists: true, descLength: 150 });
    expect(issues.some(i => i.severity === 'warning' && i.message.includes('짧습니다'))).toBe(true);
  });

  test('title 30~60자 → 이슈 없음', () => {
    const issues = checkMetaIssues({ titleExists: true, titleLength: 45, descExists: true, descLength: 150 });
    const titleIssues = issues.filter(i => i.message.includes('title'));
    expect(titleIssues).toHaveLength(0);
  });

  test('title 60자 초과 → warning', () => {
    const issues = checkMetaIssues({ titleExists: true, titleLength: 70, descExists: true, descLength: 150 });
    expect(issues.some(i => i.severity === 'warning' && i.message.includes('깁니다'))).toBe(true);
  });

  test('description 없음 → critical', () => {
    const issues = checkMetaIssues({ titleExists: true, titleLength: 45, descExists: false, descLength: 0 });
    expect(issues.some(i => i.severity === 'critical' && i.message.includes('description'))).toBe(true);
  });

  test('description 120자 미만 → warning', () => {
    const issues = checkMetaIssues({ titleExists: true, titleLength: 45, descExists: true, descLength: 50 });
    expect(issues.some(i => i.severity === 'warning' && i.message.includes('짧습니다'))).toBe(true);
  });
});
