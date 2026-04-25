'use client';

import AltTextScanSection from '@/features/report/components/AltTextScanSection';
import type { AltTextAuditResult } from '@/types/alt-text';
import styles from '@/app/page.module.css';

interface AltTextResultViewerProps {
  result: AltTextAuditResult;
  onSaveToNotion?: () => Promise<void> | void;
  isSavingNotion?: boolean;
}

/**
 * 이미지 진단 결과 보고서 뷰어 (단계 4 — 다운로드 버튼 placeholder)
 *
 * 다운로드(엑셀/JSON/PDF) 핸들러는 단계 5에서, Notion 저장은 단계 6에서 연결된다.
 */
export const AltTextResultViewer = ({ result, onSaveToNotion, isSavingNotion }: AltTextResultViewerProps) => {
  const notReady = () => alert('다음 단계에서 활성화됩니다.');

  const counts = result.countsByJudgment;

  return (
    <div className="container">
      <header className={`${styles['report-header']} ${styles['report-header-column']}`}>
        <div className={styles['header-row']}>
          <div>
            <h1 className={styles['report-title']}>이미지 진단 보고서</h1>
            <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>
              진단 시간: {new Date(result.endTime).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
              {result.inspector ? ` · 점검자: ${result.inspector}` : ''}
            </p>
          </div>
        </div>

        <div className={styles['action-row']}>
          <button className="btn btn-secondary" onClick={notReady}>엑셀 다운로드</button>
          <button className="btn btn-secondary" onClick={notReady}>JSON 다운로드</button>
          <button className="btn btn-secondary" onClick={notReady}>PDF 보고서</button>
          {onSaveToNotion && (
            <button
              className="btn btn-secondary"
              onClick={() => onSaveToNotion()}
              disabled={isSavingNotion}
              style={{ background: '#1a1a1a', color: '#fff', borderColor: '#1a1a1a' }}
            >
              {isSavingNotion ? 'Notion 저장 중...' : 'Notion 저장'}
            </button>
          )}
        </div>
      </header>

      <section
        style={{
          marginTop: '1rem',
          padding: '1rem 1.25rem',
          background: '#fff',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
        }}
      >
        <h3 style={{ marginTop: 0 }}>요약</h3>
        <ul style={{ margin: 0, lineHeight: 1.8 }}>
          <li>대상 URL: {result.totalUrls}개</li>
          <li>OCR 실행 이미지: {result.totalImagesScanned}장</li>
          <li>불일치(pass 제외): {result.totalMismatches}건</li>
          <li>
            판정별 카운트 — 정상 {counts.pass} / alt 누락 {counts.missing_alt} /
            장식 오분류 {counts.decorative_mismatch} / 텍스트 불일치 {counts.text_mismatch} /
            수동 검토 {counts.review_needed}
          </li>
        </ul>
      </section>

      <AltTextScanSection scans={result.scans} />
    </div>
  );
};

export default AltTextResultViewer;
