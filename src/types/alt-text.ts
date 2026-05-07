/**
 * KWCAG 2.2 § 1.1.1 — 적절한 대체 텍스트 제공
 * 이미지 내 텍스트와 alt 속성 간 불일치 진단 데이터
 */

import type { SpaFrameworkLabel, RenderStrategyLabel } from '@/types';

/**
 * 스캔 시점에 감지된 사이트 유형 정보.
 * SPA/SSR/CSR 등 렌더링 환경을 결과에 함께 기록하여
 * 사용자가 진단이 어떤 환경에서 수행되었는지 확인할 수 있게 한다.
 */
export interface AltTextScanSiteInfo {
  /** 감지된 프레임워크 (react, next, vue, nuxt, angular, unknown) */
  framework: SpaFrameworkLabel;
  /** 렌더링 전략 (CSR, SSR, SSG, unknown) */
  renderStrategy: RenderStrategyLabel;
  /** 하이드레이션 대기 시간 (ms) */
  hydrationMs: number;
  /** SPA 준비 상태 */
  spaReadyStatus: 'ready' | 'partial' | 'timeout';
  /** 추가 참고 정보 (예: 'networkidle-timeout', 'dom-not-stabilized') */
  notes: string[];
}

/**
 * 이미지 유형 분류
 * - text-heavy: 텍스트 중심 이미지 (로고, 배너, 타이포그래피)
 * - mixed: 텍스트와 비주얼이 혼합 (인포그래픽, 카드)
 * - photo: 사진/도표/장식 (OCR로 판정 불가)
 */
export type ImageType = 'text-heavy' | 'mixed' | 'photo';

/**
 * alt 판정 결과 4단계
 * - pass: alt가 OCR 텍스트와 충분히 일치
 * - missing_alt: alt 속성 자체가 없음 (KWCAG 위반)
 * - decorative_mismatch: alt=""인데 텍스트 이미지 (장식 오분류)
 * - text_mismatch: 텍스트 이미지인데 alt가 OCR과 크게 다름
 * - review_needed: 사진/도표형 — OCR만으로 판정 불가, 사람 검토 권고
 */
export type AltTextJudgment =
  | 'pass'
  | 'missing_alt'
  | 'decorative_mismatch'
  | 'text_mismatch'
  | 'review_needed';

/**
 * OCR 실행 모드
 * - integrated: Axe 감사 직후 같은 페이지 컨텍스트에서 연속 실행 (가장 빠름)
 * - separate: 감사 종료 후 별도 단계로 페이지 재방문 (중단 가능)
 * - standalone: 감사 없이 OCR만 단독 실행 (특정 페이지 재검증)
 */
export type AltTextExecutionMode = 'integrated' | 'separate' | 'standalone';

/** Claude Vision API 재검증 결과 */
export interface ClaudeVisionAnalysis {
  suggestedAlt: string;
  isAdequate: boolean;
  reason: string;
}

/** 개별 이미지 판정 결과 */
export interface AltTextMismatch {
  /** 이미지 식별자: id 있으면 `#id`, 없으면 XPath */
  elementId: string;
  /** 이미지 절대 URL */
  imageUrl: string;
  /** 기존 alt 속성값 (속성 자체가 없으면 null) */
  currentAlt: string | null;
  /** OCR 추출 텍스트 (정제 완료) */
  extractedText: string;
  /** 추출 신뢰도: 0(불확실) ~ 1(확실) */
  confidenceScore: number;
  /** 이미지 유형 분류 */
  imageType: ImageType;
  /** 유사도 점수 (0~1) */
  similarity: number;
  /** 최종 판정 */
  judgment: AltTextJudgment;
  /** 판정 사유 (사람이 읽는 설명) */
  reason: string;
  /** Claude Vision API 재검증 결과 (AI 정밀 분석 활성 시) */
  claudeAnalysis?: ClaudeVisionAnalysis;
}

/** 스캔 동작 제어 옵션 */
export interface AltTextScanOptions {
  /**
   * 불일치로 판정하는 유사도 하한값 (0~1).
   * 이 값 미만이면 text_mismatch로 분류.
   * @default 0.6
   */
  similarityThreshold?: number;
  /**
   * 한 페이지에서 검사할 최대 이미지 수.
   * @default 20
   */
  maxImages?: number;
  /**
   * 이미지 전처리 활성화 (sharp로 이진화·업스케일·디스큐).
   * @default true
   */
  enablePreprocessing?: boolean;
  /**
   * Tesseract worker 풀 크기 (동시 OCR 수).
   * @default 2
   */
  workerPoolSize?: number;
  /**
   * 이 크기 이하 이미지는 스캔 제외 (아이콘 필터링).
   * @default 32
   */
  minImageSizePx?: number;
  /**
   * Claude Vision API로 OCR 결과를 재검증할지 여부.
   * ANTHROPIC_API_KEY가 설정되어 있어야 동작한다.
   * @default false
   */
  useClaudeVision?: boolean;
  /**
   * 사용자 취소 신호.
   */
  abortSignal?: AbortSignal;
  /**
   * 진행률 콜백.
   */
  onProgress?: (current: number, total: number, currentUrl: string) => void;
  /**
   * waitForSpaReady()의 결과를 전달하면 siteInfo에 매핑됨.
   */
  spaReadyResult?: {
    framework: SpaFrameworkLabel;
    renderStrategy: RenderStrategyLabel;
    hydrationMs: number;
    status: 'ready' | 'partial' | 'timeout';
    notes: string[];
  };
}

/** 페이지 단위 스캔 결과 */
export interface AltTextScanResult {
  pageUrl: string;
  scannedAt: string;
  /** 실제 OCR이 실행된 이미지 수 (필터링 후) */
  totalImagesScanned: number;
  /** pass가 아닌 항목 수 */
  mismatchCount: number;
  /** 판정별 집계 */
  countsByJudgment: Record<AltTextJudgment, number>;
  /** 개별 이미지 판정 결과 (pass 포함 전체) */
  items: AltTextMismatch[];
  /** 스캔 시 감지된 사이트 유형 정보 */
  siteInfo?: AltTextScanSiteInfo;
}

/** Vision 분석 단일 결과 (내부용) */
export interface VisionAnalysisResult {
  extractedText: string;
  confidenceScore: number;
  wordCount: number;
}

/** DOM 추출 이미지 메타데이터 (내부용) */
export interface ImageMetadata {
  elementId: string;
  src: string;
  /** alt 속성 자체가 없으면 null, alt="" 이면 "" */
  alt: string | null;
  /** 자연 크기 (픽셀) — 필터링용 */
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * 이미지 진단 단일 보고서 — 여러 URL을 묶어 한 번의 진단으로 처리한 결과.
 * Notion 저장·다운로드·이력 조회의 정규 단위.
 */
export interface AltTextAuditResult {
  startTime: string;
  endTime: string;
  /** 사용자가 입력한 URL 목록 */
  targetUrls: string[];
  inspector?: string;
  totalUrls: number;
  /** 모든 페이지에서 OCR이 실행된 이미지 수 합계 */
  totalImagesScanned: number;
  /** pass가 아닌 항목 수 합계 */
  totalMismatches: number;
  /** 판정별 카운트 합계 */
  countsByJudgment: Record<AltTextJudgment, number>;
  /** 페이지별 OCR 결과 (standalone API 응답 그대로) */
  scans: AltTextScanResult[];
  options?: {
    maxImagesPerPage?: number;
    useClaudeVision?: boolean;
  };
  /** 대표 사이트 유형 정보 (첫 페이지 기준) */
  siteInfo?: AltTextScanSiteInfo;
}

/** Notion 이력 리스트 단일 항목 */
export interface AltTextHistoryItem {
  id: string;
  /** 첫 URL 또는 "이미지 진단 - URL N개" */
  title: string;
  date: string;
  totalUrls: number;
  totalImages: number;
  mismatches: number;
  inspector: string | null;
  reportLink: string | null;
}
