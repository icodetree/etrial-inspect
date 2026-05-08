/**
 * SEO Analyzer — 11. GEO (AI 최적화) 분석
 */
import type { Page } from 'playwright-core';
import type { SEOCategory, SEOIssue, SEOPassed } from '@/types/seo';
import type { GeoData } from '@/types/seo';
import { makeCategory } from '../types';

export async function analyzeGeo(page: Page, baseUrl: string): Promise<SEOCategory<GeoData>> {
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
    hasContactInfo: false, hasUrlDeclarations: false, hasSocialLinks: false,
    sectionCount: 0,
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

    // 연락처 정보 확인 (이메일 또는 전화번호)
    contentQuality.hasContactInfo = /\b[\w.-]+@[\w.-]+\.\w{2,}\b/.test(llmsContent) ||
      /\b\d{2,4}[-.\s]\d{3,4}[-.\s]\d{4}\b/.test(llmsContent);

    // URL 선언 확인 (AI가 페이지 참조할 수 있도록)
    contentQuality.hasUrlDeclarations = /URL:\s*https?:\/\//i.test(llmsContent) ||
      (llmsContent.match(/https?:\/\/\S+/g) || []).length > 0;

    // 소셜 링크 확인
    contentQuality.hasSocialLinks = /(instagram|facebook|twitter|linkedin|blog\.naver|post\.naver)/i.test(llmsContent);

    // H2 섹션 수 계산
    contentQuality.sectionCount = (llmsContent.match(/^## /mg) || []).length;

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

  // GEO score (합계 100점)
  let geoScore = 0;
  if (llmsExists) geoScore += 30;                            // 존재 여부
  if (contentQuality.structureScore >= 50) geoScore += 20;   // H1+H2+H3 완전 구조
  else if (contentQuality.structureScore >= 30) geoScore += 10;
  if (contentQuality.sectionCount >= 3) geoScore += 10;      // 3개 이상 H2 섹션
  if (contentQuality.hasSummary) geoScore += 5;
  if (contentQuality.hasContactInfo) geoScore += 5;          // 연락처
  if (contentQuality.hasUrlDeclarations) geoScore += 5;      // URL 선언
  if (contentQuality.hasSocialLinks) geoScore += 5;          // 소셜
  if (robotsAiCrawlers.gptBot) geoScore += 5;               // 크롤러 허용 각 5점 (4개 = 20점)
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

  // llms.txt 품질 관련 이슈/패스
  if (llmsExists && llmsContent) {
    if (contentQuality.hasContactInfo) {
      passed.push({ message: 'llms.txt에 연락처 정보가 포함되어 있습니다', details: {} });
    } else {
      issues.push({ severity: 'info', message: 'llms.txt에 연락처 정보가 없습니다', details: {}, suggestion: '이메일, 전화번호를 추가하면 AI가 더 정확한 정보를 제공할 수 있습니다' });
    }

    if (contentQuality.hasUrlDeclarations) {
      passed.push({ message: 'llms.txt에 URL 선언이 포함되어 있습니다', details: {} });
    } else {
      issues.push({ severity: 'info', message: 'llms.txt에 URL 선언이 없습니다', details: {}, suggestion: '각 섹션에 URL: https://... 형식으로 페이지 링크를 추가하세요' });
    }

    if (contentQuality.hasSocialLinks) {
      passed.push({ message: 'llms.txt에 소셜 미디어 링크가 포함되어 있습니다', details: {} });
    } else {
      issues.push({ severity: 'info', message: 'llms.txt에 소셜 미디어 링크가 없습니다', details: {}, suggestion: '블로그, 인스타그램 등 소셜 미디어 링크를 추가하면 AI가 더 풍부한 정보를 제공합니다' });
    }

    if (contentQuality.sectionCount >= 3) {
      passed.push({ message: `llms.txt에 ${contentQuality.sectionCount}개의 섹션이 있습니다`, details: { sectionCount: contentQuality.sectionCount } });
    } else {
      issues.push({ severity: 'info', message: `llms.txt의 섹션이 부족합니다 (${contentQuality.sectionCount}개)`, details: { sectionCount: contentQuality.sectionCount }, suggestion: '회사 개요, 주요 서비스, 포트폴리오, 연락처 등 3개 이상의 H2 섹션을 추가하세요' });
    }
  }

  if (!robotsAiCrawlers.gptBot) {
    issues.push({ severity: 'info', message: 'GPTBot이 robots.txt에서 차단되어 있습니다', details: {}, suggestion: 'AI 검색 노출을 원하면 GPTBot을 허용하세요' });
  }
  if (!robotsAiCrawlers.claudeBot) {
    issues.push({ severity: 'info', message: 'ClaudeBot이 robots.txt에서 차단되어 있습니다', details: {}, suggestion: 'AI 검색 노출을 원하면 ClaudeBot을 허용하세요' });
  }

  return makeCategory('AI 최적화 (GEO)', issues, passed, data, start);
}

export function generateDefaultLlmsTxt(baseUrl: string): string {
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
