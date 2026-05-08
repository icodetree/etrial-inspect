/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import type { SEOAnalysisResult } from '@/types/seo';

// Mock CSS module
jest.mock('../AIDetailView.module.css', () =>
  new Proxy({}, { get: (_, key) => key })
);

// Mock ai-prompt-generator
const mockCopyPromptAndOpenAI = jest.fn().mockResolvedValue(true);
jest.mock('@/lib/ai-prompt-generator', () => ({
  copyPromptAndOpenAI: (...args: unknown[]) => mockCopyPromptAndOpenAI(...args),
  AITool: { CHATGPT: 'chatgpt', CLAUDE: 'claude', GEMINI: 'gemini', PERPLEXITY: 'perplexity' },
  AI_PROMPT_TEMPLATES: {
    chatgpt: { name: 'ChatGPT', url: 'https://chat.openai.com', icon: '🤖', promptPrefix: '' },
    gemini: { name: 'Google Gemini', url: 'https://gemini.google.com', icon: '✨', promptPrefix: '' },
    claude: { name: 'Claude', url: 'https://claude.ai', icon: '🟣', promptPrefix: '' },
  },
}));

import AIDetailView from '../AIDetailView';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<SEOAnalysisResult> = {}): SEOAnalysisResult {
  return {
    score: 75,
    url: 'https://example.com',
    timestamp: Date.now(),
    categories: {
      meta: {
        name: 'meta', score: 80, issues: [], passed: [],
        data: {
          title: { exists: true, text: 'Example', length: 7, htmlCode: null },
          description: { exists: true, content: 'Desc', length: 4, htmlCode: null },
          keywords: { exists: false, content: '', count: 0, htmlCode: null },
          robots: { exists: true, content: 'index,follow', defaultValue: null, htmlCode: null },
          viewport: { exists: true, content: 'width=device-width', htmlCode: null },
          charset: { exists: true, value: 'utf-8', htmlCode: null },
          canonical: { exists: true, href: 'https://example.com', htmlCode: null },
          author: { exists: false, content: '', htmlCode: null },
          language: 'ko',
        },
      },
      heading: {
        name: 'heading', score: 70, issues: [], passed: [],
        data: {
          headings: { h1: ['Main'], h2: ['Sub1', 'FAQ?'], h3: [], h4: [], h5: [], h6: [] },
          counts: { h1: 1, h2: 2, h3: 0, h4: 0, h5: 0, h6: 0 },
          structure: ['H1: Main', 'H2: Sub1'],
          h1Text: 'Main',
        },
      },
      image: {
        name: 'image', score: 90, issues: [], passed: [],
        data: { total: 0, images: [], stats: { missingAlt: 0, emptyAlt: 0, withTitle: 0, lazyLoading: 0, missingDimensions: 0, webpFormat: 0, avifFormat: 0, meaningfulFilenames: 0, largeImages: 0, veryLargeImages: 0, totalSize: 0, avgSize: 0 } },
      },
      link: {
        name: 'link', score: 85, issues: [], passed: [],
        data: { total: 0, links: [], domainGroups: {}, stats: { internal: 0, external: 0, nofollow: 0, noopener: 0, targetBlank: 0, emptyAnchors: 0, httpLinks: 0, selfLinks: 0 } },
      },
      social: {
        name: 'social', score: 60, issues: [], passed: [],
        data: {
          openGraph: { title: 'OG Title', description: '', image: 'https://example.com/og.jpg', url: '', type: '', siteName: '', locale: '', article: '' },
          openGraphHtml: {}, twitter: { card: '', title: '', description: '', image: '', site: '', creator: '' },
          twitterHtml: {}, facebook: { appId: '', pages: '' }, facebookHtml: {},
        },
      },
      content: {
        name: 'content', score: 70, issues: [], passed: [],
        data: {
          stats: { totalWords: 500, koreanWords: 400, englishWords: 100, characters: 2000, charactersNoSpaces: 1500, sentences: 30, paragraphs: 10, textHtmlRatio: 0.3 },
          paragraphStats: { total: 10, empty: 0, short: 2, avgLength: 50 },
          lists: { ul: 1, ol: 0, dl: 0, total: 1 },
          topKeywords: [{ word: 'example', count: 10, density: 2.0 }],
          readingTime: 3, sentenceStructure: { total: 30, avgLength: 15, shortSentences: 10, mediumSentences: 15, complexSentences: 5, complexRatio: 0.17 },
          readability: { score: 70, level: 'easy', avgSentenceLength: 15, avgSyllablesPerWord: 1.5 },
          duplicates: [],
        },
      },
      semantic: {
        name: 'semantic', score: 65, issues: [], passed: [],
        data: {
          html5Tags: {}, textEmphasis: {}, genericTags: { div: 10, span: 5, total: 15 },
          aria: { roles: 0, labels: 0, describedby: 0, labelledby: 0, hidden: 0, live: 0 },
          forms: { total: 0, inputs: 0, labels: 0, inputsWithLabels: 0, inputsWithPlaceholder: 0, inputsWithRequired: 0 },
          tables: { total: 1, withCaption: 0, withThead: 0, withTh: 0, withScope: 0 },
          semanticStructure: [], semanticScore: 40, improvements: [],
        },
      },
      accessibility: {
        name: 'accessibility', score: 80, issues: [], passed: [],
        data: {
          language: { html: 'ko', hreflang: '', contentLanguage: '' }, hreflangTags: [],
          colorContrast: { totalChecked: 0, passed: 0, failed: 0, warnings: 0, sufficient: true, message: '' },
          formAccessibility: { totalInputs: 0, labeled: 0, unlabeled: 0, placeholderOnly: 0, requiredFields: 0, fieldsets: 0 },
          ariaAnalysis: { total: 0, roles: 0, properties: 0, states: 0, landmarks: 0, liveRegions: 0, issues: 0, warnings: 0 },
          keyboard: { tabindex: 0, tabindexNegative: 0, tabindexPositive: 0, accesskey: 0 },
          media: { videos: 0, videosWithCaptions: 0, audios: 0, audiosWithTranscript: 0 },
          focusable: { links: 0, buttons: 0, inputs: 0, total: 0 },
          skipNav: { hasSkipLink: false, hasMainLandmark: false, hasNavLandmark: false },
        },
      },
      schema: {
        name: 'schema', score: 50, issues: [], passed: [],
        data: {
          jsonld: [{ '@type': 'Organization' }],
          microdata: { itemscope: 0, itemtype: [], itemprop: 0, items: [] },
          rdfa: { vocab: '', typeof: [], property: 0, resource: 0 },
          schemaTypes: { organization: true, website: true, faq: false, article: true, breadcrumb: false, person: false, howto: false },
        },
      },
      technical: {
        name: 'technical', score: 85, issues: [], passed: [],
        data: {
          coreWebVitals: { lcp: null, fcp: null, cls: null, fid: null, ttfb: null },
          crawlability: { canonical: null, metaRobots: '', hreflang: [], alternateLinks: [], pagination: [] },
          resources: { javascript: 5, css: 3 }, validation: [],
          security: { httpsLinks: 10, httpLinks: 0 }, doctype: { exists: true, name: 'html' },
        },
      },
      geo: {
        name: 'AI/GEO 최적화', score: 62, issues: [
          { severity: 'warning', message: 'llms.txt 파일이 없습니다', details: {}, suggestion: 'llms.txt를 추가하세요' },
        ], passed: [
          { message: 'robots.txt에 AI 크롤러가 허용됨', details: {} },
        ],
        data: {
          llmsTxt: {
            exists: false,
            structure: { hasH1: false, hasH2: false, hasH3: false, paragraphCount: 0, wordCount: 0, codeBlockCount: 0 },
            contentQuality: { hasSummary: false, hasKeywords: false, hasContactInfo: false, hasUrlDeclarations: false, hasSocialLinks: false, sectionCount: 0, readabilityScore: 0, structureScore: 0 },
            brokenLinks: [],
            suggestedContent: '# Example\nAI-friendly content',
          },
          robotsAiCrawlers: { googleBot: true, gptBot: true, claudeBot: true, bingBot: true },
          score: 62,
        },
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AIDetailView', () => {
  beforeEach(() => {
    mockCopyPromptAndOpenAI.mockClear();
  });

  it('renders score circle with the correct GEO score', () => {
    const result = makeResult();
    render(<AIDetailView result={result} />);

    // The ScoreCircle renders the score as text with aria-label
    const scoreEl = screen.getByLabelText('점수 62점');
    expect(scoreEl).toBeInTheDocument();
    expect(scoreEl).toHaveTextContent('62');
  });

  it('renders analysis category sections', () => {
    render(<AIDetailView result={makeResult()} />);

    // E-E-A-T section
    expect(screen.getByLabelText('E-E-A-T 신호')).toBeInTheDocument();
    expect(screen.getByText('전문성')).toBeInTheDocument();

    // Conversational section
    expect(screen.getByLabelText('대화형 최적화')).toBeInTheDocument();

    // Knowledge graph section
    expect(screen.getByLabelText('지식 그래프')).toBeInTheDocument();

    // Entity section
    expect(screen.getByLabelText('엔티티 & 비교')).toBeInTheDocument();

    // Structured data section
    expect(screen.getByLabelText('구조화 데이터 현황')).toBeInTheDocument();
  });

  it('renders issues and passed items in check section', () => {
    render(<AIDetailView result={makeResult()} />);

    // Issue from geo category
    expect(screen.getByText('llms.txt 파일이 없습니다')).toBeInTheDocument();

    // Passed toggle button
    const passedToggle = screen.getByRole('button', { name: /통과 항목/ });
    expect(passedToggle).toBeInTheDocument();
    expect(passedToggle).toHaveTextContent('1개');
  });

  it('expands passed items on click', async () => {
    const user = userEvent.setup();
    render(<AIDetailView result={makeResult()} />);

    const passedToggle = screen.getByRole('button', { name: /통과 항목/ });
    await user.click(passedToggle);

    expect(screen.getByText('robots.txt에 AI 크롤러가 허용됨')).toBeInTheDocument();
  });

  it('calls copyPromptAndOpenAI when an AI tool button is clicked', async () => {
    const user = userEvent.setup();
    render(<AIDetailView result={makeResult()} />);

    // Find the ChatGPT button
    const chatgptBtn = screen.getByRole('button', { name: /ChatGPT에게 물어보기/ });
    expect(chatgptBtn).toBeInTheDocument();

    await user.click(chatgptBtn);

    expect(mockCopyPromptAndOpenAI).toHaveBeenCalledTimes(1);
    expect(mockCopyPromptAndOpenAI).toHaveBeenCalledWith(
      'chatgpt',
      expect.objectContaining({
        siteName: 'example.com',
        url: 'https://example.com',
        ruleBasedScore: 62,
      }),
    );
  });

  it('shows copy success message after AI prompt button click', async () => {
    const user = userEvent.setup();
    render(<AIDetailView result={makeResult()} />);

    const chatgptBtn = screen.getByRole('button', { name: /ChatGPT에게 물어보기/ });
    await user.click(chatgptBtn);

    expect(await screen.findByText(/프롬프트가 복사되었습니다/)).toBeInTheDocument();
  });
});
