'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AuditResult } from '@/types';
import styles from './ProposalModal.module.css';

interface ProposalModalProps {
  result: AuditResult;
  onClose: () => void;
}

export default function ProposalModal({ result, onClose }: ProposalModalProps) {
  const [companyName, setCompanyName] = useState('');
  const [managerName, setManagerName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const companyInputRef = useRef<HTMLInputElement>(null);

  // 모달 열릴 때 첫 입력 필드에 포커스
  useEffect(() => {
    companyInputRef.current?.focus();
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 포커스 트랩
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;

    const focusableElements = modal.querySelectorAll<HTMLElement>(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, []);

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: companyName.trim(),
          contactPerson: managerName.trim() || undefined,
          result,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `PDF 생성 실패 (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `제안서_${companyName.trim()}_${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="제안서 생성"
      >
        <div className={styles.header}>
          <h2>제안서 생성</h2>
          <button
            type="button"
            onClick={onClose}
            className={styles['close-btn']}
            aria-label="모달 닫기"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.content}>
          <div className={styles['form-group']}>
            <label htmlFor="proposal-company" className={styles.label}>
              회사명 <span className={styles.required}>*</span>
            </label>
            <input
              ref={companyInputRef}
              id="proposal-company"
              type="text"
              className={styles.input}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="예: 이트라이브"
              required
              aria-required="true"
            />
          </div>

          <div className={styles['form-group']}>
            <label htmlFor="proposal-manager" className={styles.label}>
              담당자명
            </label>
            <input
              id="proposal-manager"
              type="text"
              className={styles.input}
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
              placeholder="예: 홍길동"
            />
          </div>

          <div className={styles['info-box']}>
            <p>
              진단 결과를 기반으로 접근성 개선 제안서 PDF를 생성합니다.
            </p>
            <ul>
              <li>총 {result.totalViolations}건의 위반 사항 포함</li>
              <li>진단 대상: {result.totalPages}개 페이지</li>
            </ul>
          </div>

          {error && (
            <div className={styles['error-message']} role="alert">
              {error}
            </div>
          )}

          <div className={styles.footer}>
            <button
              type="button"
              onClick={onClose}
              className={styles['cancel-btn']}
              disabled={generating}
            >
              취소
            </button>
            <button
              type="submit"
              className={styles['submit-btn']}
              disabled={generating || !companyName.trim()}
              aria-busy={generating}
            >
              {generating ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  생성 중...
                </>
              ) : (
                'PDF 생성'
              )}
            </button>
          </div>
        </form>

        {generating && (
          <div className={styles['loading-overlay']} aria-live="assertive">
            <p>제안서를 생성하고 있습니다. 잠시만 기다려주세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}
