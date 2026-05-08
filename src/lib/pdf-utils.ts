/**
 * PDF 보고서 공용 유틸리티
 *
 * PDFReportGenerator 와 ComparisonPDFGenerator 양쪽에서 공유하는
 * 이미지 처리, HTML 이스케이프, 크롭 스크린샷 렌더링 함수들을 모았다.
 */
import fs from 'fs';
import path from 'path';

/**
 * 스크린샷을 base64로 로드한다.
 * 로컬 경로(public/, cwd 기준, 절대경로) → 실패 시 원격 URL 순으로 시도.
 */
export async function imageToBase64(
  screenshotPath: string,
  screenshotUrl?: string,
): Promise<string | null> {
  // 로컬 파일 시도
  const localPaths = [
    path.join(process.cwd(), 'public', screenshotPath),
    path.join(process.cwd(), screenshotPath),
    screenshotPath,
  ];

  for (const p of localPaths) {
    try {
      if (fs.existsSync(p)) {
        const buffer = fs.readFileSync(p);
        return buffer.toString('base64');
      }
    } catch {
      continue;
    }
  }

  // GitHub Pages URL 시도
  if (screenshotUrl && screenshotPath) {
    const filename = path.basename(screenshotPath);
    const url = `${screenshotUrl}/${filename}`;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        return Buffer.from(buffer).toString('base64');
      }
    } catch {
      // 원격 fetch 실패는 무시
    }
  }

  return null;
}

/**
 * PNG 바이너리에서 이미지 크기를 추출한다 (IHDR 청크).
 * bytes 16-19 = width, 20-23 = height (big-endian).
 */
export function getPngDimensions(
  base64Data: string,
): { width: number; height: number } | null {
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length < 24) return null;
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height };
    return null;
  } catch {
    return null;
  }
}

/**
 * 바운딩 박스 주변을 크롭하여 스크린샷 HTML을 렌더링한다.
 * padding-bottom 비율 + 이미지 확대/translate 로 CSS-only 크롭을 수행하고,
 * 바운딩 박스 위치에 빨간 오버레이를 그린다.
 */
export function renderCroppedScreenshot(
  base64: string,
  boundingBox: { x: number; y: number; width: number; height: number },
  imgDimensions: { width: number; height: number },
  padding = 80,
): string {
  const bb = boundingBox;
  const dims = imgDimensions;

  // 크롭 영역 계산 (padding 포함)
  const cropX = Math.max(0, bb.x - padding);
  const cropY = Math.max(0, bb.y - padding);
  const cropRight = Math.min(dims.width, bb.x + bb.width + padding);
  const cropBottom = Math.min(dims.height, bb.y + bb.height + padding);
  const cropW = cropRight - cropX;
  const cropH = cropBottom - cropY;

  // 컨테이너 내에서 bbox 오버레이 위치 (크롭 영역 기준 퍼센트)
  const bboxLeftPct = ((bb.x - cropX) / cropW * 100).toFixed(4);
  const bboxTopPct = ((bb.y - cropY) / cropH * 100).toFixed(4);
  const bboxWidthPct = (bb.width / cropW * 100).toFixed(4);
  const bboxHeightPct = (bb.height / cropH * 100).toFixed(4);

  // absolute positioning 크롭
  const aspectRatio = (cropH / cropW * 100).toFixed(4);
  const imgScale = (dims.width / cropW * 100).toFixed(4);
  const imgLeft = (-(cropX / dims.width) * 100).toFixed(4);
  const imgTop = (-(cropY / dims.height) * 100).toFixed(4);

  return `
  <div class="violation-screenshot">
    <div class="violation-screenshot-container" style="padding-bottom: ${aspectRatio}%;">
      <img src="data:image/png;base64,${base64}" alt="오류 위치 스크린샷"
        style="position: absolute; top: 0; left: 0; width: ${imgScale}%; transform: translate(${imgLeft}%, ${imgTop}%);" />
      <div class="bbox-overlay" style="left:${bboxLeftPct}%; top:${bboxTopPct}%; width:${bboxWidthPct}%; height:${bboxHeightPct}%;"></div>
    </div>
  </div>`;
}

/** HTML 특수문자 이스케이프 */
export function escapeHtml(str: string | undefined | null): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** 문자열을 maxLen 이하로 자르고 말줄임 */
export function truncate(
  str: string | undefined | null,
  maxLen: number,
): string {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + '...';
}

/** ISO 날짜 문자열을 한국 로캘로 포매팅 */
export function formatDateKR(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
