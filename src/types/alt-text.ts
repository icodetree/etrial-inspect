/**
 * KWCAG 2.2 § 1.1.1 — 적절한 대체 텍스트 제공
 * 이미지 내 텍스트와 alt 속성 간 불일치를 나타내는 진단 데이터
 */

/** 개별 이미지에 대한 불일치 결과 */
export interface AltTextMismatch {
  /** 이미지의 고유 식별자: id 속성이 있으면 `#id`, 없으면 XPath */
  elementId: string;
  /** 이미지의 완전한(절대) URL */
  imageUrl: string;
  /** HTML에 기술된 기존 alt 속성값 */
  currentAlt: string;
  /** AI Vision이 이미지에서 추출한 텍스트 (정제 완료) */
  extractedText: string;
  /** 추출 신뢰도: 0(불확실) ~ 1(확실). 텍스트가 없는 이미지는 1.0 */
  confidenceScore: number;
}

/** 스캔 동작을 제어하는 옵션 */
export interface AltTextScanOptions {
  /**
   * 불일치로 판정하는 유사도 하한값 (0 ~ 1).
   * 이 값 미만이면 불일치로 리포트됨.
   * @default 0.8
   */
  similarityThreshold?: number;
  /**
   * 한 페이지에서 검사할 최대 이미지 수.
   * Vision API 비용 제어용.
   * @default 50
   */
  maxImages?: number;
}

/** 페이지 단위 스캔 최종 결과 */
export interface AltTextScanResult {
  /** 스캔 대상 페이지 URL */
  pageUrl: string;
  /** ISO 8601 스캔 시각 */
  scannedAt: string;
  /** 장식 이미지(alt="") 제외 후 실제 검사한 이미지 수 */
  totalImagesScanned: number;
  /** 불일치 건수 */
  mismatchCount: number;
  /** 불일치 항목 배열 */
  mismatches: AltTextMismatch[];
}

/** Vision 분석 단일 결과 (내부용) */
export interface VisionAnalysisResult {
  extractedText: string;
  confidenceScore: number;
}

/** DOM에서 추출한 이미지 메타데이터 (내부용) */
export interface ImageMetadata {
  elementId: string;
  src: string;
  alt: string;
}
