/**
 * SEO/AI 분석 결과 타입 정의 (SOYOYU JSON 구조 기준)
 * 11개 카테고리 기반 종합 분석
 */

// 공통
export interface SEOIssue {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  details: Record<string, unknown>;
  suggestion: string;
}

export interface SEOPassed {
  message: string;
  details: Record<string, unknown>;
}

export interface SEOCategory<T = Record<string, unknown>> {
  name: string;
  score: number;
  issues: SEOIssue[];
  passed: SEOPassed[];
  data: T;
  executionTime?: number;
}

// 카테고리별 data 타입 (11개)

export interface MetaData {
  title: { exists: boolean; text: string; length: number; htmlCode: string | null };
  description: { exists: boolean; content: string; length: number; htmlCode: string | null };
  keywords: { exists: boolean; content: string; count: number; htmlCode: string | null };
  robots: { exists: boolean; content: string; defaultValue: string | null; htmlCode: string | null };
  viewport: { exists: boolean; content: string; htmlCode: string | null };
  charset: { exists: boolean; value: string; htmlCode: string | null };
  canonical: { exists: boolean; href: string; htmlCode: string | null };
  author: { exists: boolean; content: string; htmlCode: string | null };
  language: string;
}

export interface HeadingData {
  headings: { h1: string[]; h2: string[]; h3: string[]; h4: string[]; h5: string[]; h6: string[] };
  counts: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
  structure: string[];
  h1Text: string;
}

export interface ImageItem {
  index: number;
  src: string;
  alt: string;
  htmlCode: string;
  hasAlt: boolean;
  isEmptyAlt: boolean;
  hasTitle: boolean;
  loading: string | null;
  hasLazyLoading: boolean;
  hasWidth: boolean;
  hasHeight: boolean;
  extension: string;
  filename: string;
  isMeaningful: boolean;
  fileSize: number;
  fileSizeKB: number;
  isLarge: boolean;
  isVeryLarge: boolean;
}

export interface ImageData {
  total: number;
  images: ImageItem[];
  stats: {
    missingAlt: number;
    emptyAlt: number;
    withTitle: number;
    lazyLoading: number;
    missingDimensions: number;
    webpFormat: number;
    avifFormat: number;
    meaningfulFilenames: number;
    largeImages: number;
    veryLargeImages: number;
    totalSize: number;
    avgSize: number;
  };
}

export interface LinkItem {
  index: number;
  href: string;
  text: string;
  htmlCode: string;
  domain: string;
  isExternal: boolean;
  isNofollow: boolean;
  isNoopener: boolean;
  isTargetBlank: boolean;
  isSelfLink: boolean;
  isHashLink: boolean;
  isJavascript: boolean;
  isEmptyAnchor: boolean;
  isGenericAnchor: boolean;
  protocol: string;
}

export interface LinkData {
  total: number;
  links: LinkItem[];
  domainGroups: Record<string, number>;
  stats: {
    internal: number;
    external: number;
    nofollow: number;
    noopener: number;
    targetBlank: number;
    emptyAnchors: number;
    httpLinks: number;
    selfLinks: number;
  };
}

export interface SocialData {
  openGraph: {
    title: string;
    description: string;
    image: string;
    url: string;
    type: string;
    siteName: string;
    locale: string;
    article: string;
  };
  openGraphHtml: Record<string, string>;
  twitter: {
    card: string;
    title: string;
    description: string;
    image: string;
    site: string;
    creator: string;
  };
  twitterHtml: Record<string, string>;
  facebook: { appId: string; pages: string };
  facebookHtml: Record<string, string>;
}

export interface ContentData {
  stats: {
    totalWords: number;
    koreanWords: number;
    englishWords: number;
    characters: number;
    charactersNoSpaces: number;
    sentences: number;
    paragraphs: number;
    textHtmlRatio: number;
  };
  paragraphStats: {
    total: number;
    empty: number;
    short: number;
    avgLength: number;
  };
  lists: { ul: number; ol: number; dl: number; total: number };
  topKeywords: Array<{ word: string; count: number; density: number }>;
  readingTime: number;
  sentenceStructure: {
    total: number;
    avgLength: number;
    shortSentences: number;
    mediumSentences: number;
    complexSentences: number;
    complexRatio: number;
  };
  readability: {
    score: number;
    level: string;
    avgSentenceLength: number;
    avgSyllablesPerWord: number;
  };
  duplicates: string[];
}

export interface SemanticData {
  html5Tags: Record<string, number>;
  textEmphasis: Record<string, number>;
  genericTags: { div: number; span: number; total: number };
  aria: {
    roles: number;
    labels: number;
    describedby: number;
    labelledby: number;
    hidden: number;
    live: number;
  };
  forms: {
    total: number;
    inputs: number;
    labels: number;
    inputsWithLabels: number;
    inputsWithPlaceholder: number;
    inputsWithRequired: number;
  };
  tables: {
    total: number;
    withCaption: number;
    withThead: number;
    withTh: number;
    withScope: number;
  };
  semanticStructure: string[];
  semanticScore: number;
  improvements: Array<{ current: string; suggested: string; reason: string }>;
}

export interface A11yData {
  language: { html: string; hreflang: string; contentLanguage: string };
  hreflangTags: string[];
  colorContrast: {
    totalChecked: number;
    passed: number;
    failed: number;
    warnings: number;
    sufficient: boolean;
    message: string;
  };
  formAccessibility: {
    totalInputs: number;
    labeled: number;
    unlabeled: number;
    placeholderOnly: number;
    requiredFields: number;
    fieldsets: number;
  };
  ariaAnalysis: {
    total: number;
    roles: number;
    properties: number;
    states: number;
    landmarks: number;
    liveRegions: number;
    issues: number;
    warnings: number;
  };
  keyboard: {
    tabindex: number;
    tabindexNegative: number;
    tabindexPositive: number;
    accesskey: number;
  };
  media: {
    videos: number;
    videosWithCaptions: number;
    audios: number;
    audiosWithTranscript: number;
  };
  focusable: { links: number; buttons: number; inputs: number; total: number };
  skipNav: {
    hasSkipLink: boolean;
    hasMainLandmark: boolean;
    hasNavLandmark: boolean;
  };
}

export interface SchemaData {
  jsonld: object[];
  microdata: {
    itemscope: number;
    itemtype: string[];
    itemprop: number;
    items: object[];
  };
  rdfa: {
    vocab: string;
    typeof: string[];
    property: number;
    resource: number;
  };
  schemaTypes: Record<string, boolean>;
}

export interface TechnicalData {
  coreWebVitals: {
    lcp: number | null;
    fcp: number | null;
    cls: number | null;
    fid: number | null;
    ttfb: number | null;
  };
  crawlability: {
    canonical: string | null;
    metaRobots: string;
    hreflang: string[];
    alternateLinks: string[];
    pagination: string[];
  };
  resources: { javascript: number; css: number };
  validation: string[];
  security: { httpsLinks: number; httpLinks: number };
  doctype: { exists: boolean; name: string };
}

export interface GeoData {
  llmsTxt: {
    exists: boolean;
    content?: string;
    structure: {
      hasH1: boolean;
      hasH2: boolean;
      hasH3: boolean;
      paragraphCount: number;
      wordCount: number;
      codeBlockCount: number;
    };
    contentQuality: {
      hasSummary: boolean;
      hasKeywords: boolean;
      readabilityScore: number;
      structureScore: number;
    };
    brokenLinks: string[];
    suggestedContent?: string;
  };
  robotsAiCrawlers: {
    googleBot: boolean;
    gptBot: boolean;
    claudeBot: boolean;
    bingBot: boolean;
  };
  score: number;
}

// 최상위 결과 타입
export interface SEOAnalysisResult {
  score: number;
  url: string;
  title?: string;
  timestamp: number;
  executionTime?: number;
  categories: {
    meta: SEOCategory<MetaData>;
    heading: SEOCategory<HeadingData>;
    image: SEOCategory<ImageData>;
    link: SEOCategory<LinkData>;
    social: SEOCategory<SocialData>;
    content: SEOCategory<ContentData>;
    semantic: SEOCategory<SemanticData>;
    accessibility: SEOCategory<A11yData>;
    schema: SEOCategory<SchemaData>;
    technical: SEOCategory<TechnicalData>;
    geo: SEOCategory<GeoData>;
  };
}

// 하위 호환 (index.ts import 유지용)
export type SEOAuditResult = SEOAnalysisResult;

// AI 프롬프트 생성용 데이터 (하위 호환)
export interface AIPromptData {
  siteName: string;
  url: string;
  llmsTxtContent: string;
  ruleBasedScore: number;
  suggestedImprovements: string[];
  professionalFindings?: string[];
}
