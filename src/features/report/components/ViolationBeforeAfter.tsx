'use client';

import React, { useState } from 'react';
import type { CompactViolation } from '@/lib/comparison/types';
import styles from './ViolationBeforeAfter.module.css';

interface ViolationBeforeAfterProps {
  violation: CompactViolation;
  type: 'resolved' | 'new';
  screenshotUrl?: string;
}

function buildImgSrc(screenshotPath: string, screenshotUrl?: string): string {
  const filename = screenshotPath.split('/').pop();
  return screenshotUrl
    ? `${screenshotUrl}/${filename}`
    : `/screenshots/${filename}`;
}

interface ScreenshotPanelProps {
  screenshotPath?: string;
  screenshotUrl?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  alt: string;
}

function ScreenshotPanel({
  screenshotPath,
  screenshotUrl,
  boundingBox,
  alt,
}: ScreenshotPanelProps) {
  const [imgNaturalSize, setImgNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);

  if (!screenshotPath) {
    return <div className={styles.noScreenshot}>스크린샷 없음</div>;
  }

  const src = buildImgSrc(screenshotPath, screenshotUrl);

  return (
    <div className={styles.screenshotWrap}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.screenshotImg}
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={(e) => {
          const img = e.currentTarget;
          setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
        }}
      />
      {boundingBox && imgNaturalSize && imgNaturalSize.w > 0 && (
        <div
          className={styles.bboxOverlay}
          style={{
            left: `${(boundingBox.x / imgNaturalSize.w) * 100}%`,
            top: `${(boundingBox.y / imgNaturalSize.h) * 100}%`,
            width: `${(boundingBox.width / imgNaturalSize.w) * 100}%`,
            height: `${(boundingBox.height / imgNaturalSize.h) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

export function ViolationBeforeAfter({
  violation,
  type,
  screenshotUrl,
}: ViolationBeforeAfterProps) {
  return (
    <div className={styles.container}>
      <div className={styles.grid}>
        {type === 'resolved' ? (
          <>
            {/* 이전 상태: 스크린샷 + 빨간 오버레이 */}
            <div className={styles.column}>
              <p className={styles.columnLabel}>이전 상태</p>
              <ScreenshotPanel
                screenshotPath={violation.screenshotPath}
                screenshotUrl={screenshotUrl}
                boundingBox={violation.boundingBox}
                alt={`이전 위반 스크린샷 - ${violation.kwcagId} ${violation.kwcagName}`}
              />
            </div>
            {/* 현재 상태: 해결됨 */}
            <div className={styles.column}>
              <p className={styles.columnLabel}>현재 상태</p>
              <div
                className={styles.resolvedCard}
                role="status"
                aria-label="위반 해결됨"
              >
                <span className={styles.resolvedIcon} aria-hidden="true">
                  &#10003;
                </span>
                <span className={styles.resolvedText}>해결됨</span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 이전 상태: 없음 */}
            <div className={styles.column}>
              <p className={styles.columnLabel}>이전 상태</p>
              <div className={styles.placeholderCard}>
                이전 진단 시 없음
              </div>
            </div>
            {/* 현재 상태: 스크린샷 + 빨간 오버레이 */}
            <div className={styles.column}>
              <p className={styles.columnLabel}>현재 상태</p>
              <ScreenshotPanel
                screenshotPath={violation.screenshotPath}
                screenshotUrl={screenshotUrl}
                boundingBox={violation.boundingBox}
                alt={`현재 위반 스크린샷 - ${violation.kwcagId} ${violation.kwcagName}`}
              />
            </div>
          </>
        )}
      </div>

      {/* 코드 스니펫 */}
      {violation.affectedCode && (
        <div className={styles.codeBlock}>
          <p className={styles.codeLabel}>위반 코드</p>
          <pre className={styles.codeSnippet}>
            <code>{violation.affectedCode}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
