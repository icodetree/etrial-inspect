import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import styles from './ViolationDetailModal.module.css';
import { Violation, BoundingBox } from '@/types';

interface ViolationDetailModalProps {
  violation: Violation | null;
  boundingBox?: BoundingBox;
  screenshotPath?: string;
  artifactName?: string | null;
  screenshotUrl?: string | null;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export const ViolationDetailModal: React.FC<ViolationDetailModalProps> = ({
  violation,
  boundingBox,
  screenshotPath,
  artifactName,
  screenshotUrl,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // 이미지 스케일링 상태
  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);

  // Artifact 다운로드 URL 상태
  const [artifactUrl, setArtifactUrl] = useState<string | null>(null);
  const [isLoadingArtifact, setIsLoadingArtifact] = useState(false);
  const [, setDownloadError] = useState(false);

  const isOpen = violation !== null;

  // ESC 키로 모달 닫기 + Tab focus trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = getFocusableElements(root);
      if (focusables.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Focus 진입/복귀
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    if (root) {
      const focusables = getFocusableElements(root);
      if (focusables.length > 0) {
        focusables[0].focus();
      } else {
        root.focus();
      }
    }
    return () => {
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [isOpen]);

  const updateScale = useCallback(() => {
    if (imgRef.current) {
      const { clientWidth, naturalWidth } = imgRef.current;
      if (naturalWidth > 0) {
        setScale(clientWidth / naturalWidth);
      }
    }
  }, []);

  // 윈도 리사이즈 시 이미지 스케일 재계산 (cleanup 중복 제거)
  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
    };
  }, [isOpen, updateScale]);

  // 스크린샷 유무 확인 및 URL 결정
  const hasScreenshot = Boolean(screenshotPath);
  const filename = screenshotPath ? screenshotPath.split('/').pop() : '';
  const finalImageUrl = screenshotUrl && filename ? `${screenshotUrl}${filename}` : screenshotPath;

  // Artifact 노트 표시 여부: artifactName이 있고, URL로 바로 볼 수 없는 경우에만 표시
  const showArtifactNote = Boolean(artifactName && screenshotPath && !screenshotUrl);

  useEffect(() => {
    if (!isOpen) return;
    if (artifactName && !hasScreenshot) {
      setIsLoadingArtifact(true);
      setDownloadError(false);
      const fname = screenshotPath ? screenshotPath.split('/').pop() : '';

      fetch(`/api/artifact/screenshot?artifactName=${artifactName}&filename=${fname}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.downloadUrl) {
            setArtifactUrl(data.downloadUrl);
          } else {
            setDownloadError(true);
          }
        })
        .catch((err) => {
          console.error('Failed to fetch artifact url:', err);
          setDownloadError(true);
        })
        .finally(() => setIsLoadingArtifact(false));
    }
  }, [isOpen, artifactName, hasScreenshot, screenshotPath]);

  // 모달 클로즈 후 렌더 안 함 (hooks 호출 후에 early return)
  if (!isOpen || !violation) return null;

  // GitHub Actions Run ID 추출 (screenshots-12345678 -> 12345678)
  const runId = artifactName?.replace('screenshots-', '');
  const actionsUrl = runId
    ? `https://github.com/${process.env.NEXT_PUBLIC_GITHUB_REPO || 'UX-Ino/etrial-inspect'}/actions/runs/${runId}`
    : '#';

  return (
    <div className={styles['modal-overlay']} onClick={onClose}>
      <div
        ref={dialogRef}
        className={styles['modal-content']}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles['modal-header']}>
          <h2 id={titleId} className={styles['modal-title']}>
            위반 항목 상세: {violation.kwcagName}
          </h2>
          <button
            type="button"
            className={styles['close-btn']}
            onClick={onClose}
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        <div className={styles['modal-body']}>
          {hasScreenshot && !showArtifactNote ? (
            <div className={styles['screenshot-container']}>
              <img
                ref={imgRef}
                src={finalImageUrl}
                alt="Page Screenshot"
                className={styles['screenshot-img']}
                onLoad={updateScale}
                onError={() => {
                  console.error('Image load failed:', finalImageUrl);
                }}
              />
              {boundingBox && (
                <div
                  className={styles['mask-box']}
                  style={{
                    left: boundingBox.x * scale,
                    top: boundingBox.y * scale,
                    width: boundingBox.width * scale,
                    height: boundingBox.height * scale,
                  }}
                >
                  <div className={styles['mask-label']}>위반 요소</div>
                </div>
              )}
            </div>
          ) : showArtifactNote ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <p style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>
                📦 스크린샷 확인 안내
              </p>
              <p>GitHub Actions 환경에서는 보안 정책상 이미지를 바로 볼 수 없으며,<br />압축 파일(ZIP)로 다운로드해야 합니다.</p>

              <div style={{ margin: '20px 0', padding: '16px', background: '#f8f9fa', borderRadius: '8px' }}>
                <p style={{ fontSize: '14px', marginBottom: '4px' }}>Artifact 이름</p>
                <code style={{ background: '#e9ecef', padding: '4px 8px', borderRadius: '4px', color: '#333' }}>{artifactName}</code>
              </div>

              {isLoadingArtifact ? (
                <p style={{ marginTop: '12px', fontSize: '13px' }}>⏳ 다운로드 링크 생성 중...</p>
              ) : artifactUrl ? (
                <a
                  href={artifactUrl}
                  className={styles['open-link-btn']}
                  style={{ display: 'inline-block', marginTop: '12px', background: '#2da44e', border: 'none', color: 'white', padding: '10px 20px', borderRadius: '6px', textDecoration: 'none', fontSize: '14px', fontWeight: 'bold' }}
                >
                  📥 Artifact ZIP 다운로드
                </a>
              ) : (
                <div style={{ marginTop: '12px' }}>
                  <p style={{ color: '#d73a49', fontSize: '13px', marginBottom: '8px' }}>
                    ⚠️ 다운로드 링크를 가져올 수 없습니다.
                  </p>
                  <a
                    href={actionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: '#0366d6', textDecoration: 'underline', fontSize: '13px', cursor: 'pointer' }}
                  >
                    GitHub Actions 실행 페이지에서 직접 확인하기 &rarr;
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <p>스크린샷 이미지가 없습니다.</p>
              <p>최신 검사를 실행하면 스크린샷이 생성됩니다.</p>
            </div>
          )}
        </div>

        <div className={styles['modal-footer']}>
          <a
            href={violation.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles['open-link-btn']}
          >
            새 탭에서 실제 페이지 열기
          </a>
        </div>
      </div>
    </div>
  );
};
