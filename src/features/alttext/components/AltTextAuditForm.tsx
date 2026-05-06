'use client';

import { Asterisk, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { AltTextConfig } from '../hooks/useAltTextAudit';

interface AltTextAuditFormProps {
  config: AltTextConfig;
  setConfig: (config: AltTextConfig) => void;
  onStart: () => void;
  isProcessing: boolean;
}

export const AltTextAuditForm = ({ config, setConfig, onStart, isProcessing }: AltTextAuditFormProps) => {
  return (
    <Card title="">
      {/* 대상 설정 */}
      <fieldset className="form-section">
        <legend className="form-section-legend">대상 설정</legend>

        <div className="form-group">
          <label htmlFor="alttext-target-url" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            대표 URL
            <Asterisk size={10} color="#ef4444" strokeWidth={3} aria-label="필수 입력" style={{ marginBottom: '2px' }} />
          </label>
          <input
            id="alttext-target-url"
            type="url"
            placeholder="https://example.com"
            value={config.targetUrl}
            onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
          />
          <p style={{ fontSize: '0.8125rem', color: '#6b7280', marginTop: '0.25rem' }}>
            입력한 URL을 시작점으로 크롤링하여 발견된 모든 페이지에 대해 OCR을 수행합니다.
          </p>
        </div>
      </fieldset>

      {/* 크롤링 설정 */}
      <fieldset className="form-section">
        <legend className="form-section-legend">크롤링 설정</legend>

        <div className="form-row">
          <div className="form-group">
            <label htmlFor="alttext-max-pages">최대 페이지 수</label>
            <input
              id="alttext-max-pages"
              type="number"
              placeholder="기본값 (Vercel: 5 / 로컬: 1000)"
              min={1}
              max={1000}
              value={config.maxPages ?? ''}
              onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) || undefined })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="alttext-max-depth">최대 깊이</label>
            <input
              id="alttext-max-depth"
              type="number"
              placeholder="기본값 (Vercel: 2 / 로컬: 10)"
              min={1}
              max={20}
              value={config.maxDepth ?? ''}
              onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) || undefined })}
            />
          </div>
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            제외 경로
            <span className="tooltip-wrap">
              <HelpCircle
                size={14}
                color="#9ca3af"
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                aria-label="제외 경로 도움말"
              />
              <span className="tooltip-bubble">
                입력한 경로로 시작하는 URL은 크롤링에서 제외됩니다.
                <br />예시: /eng, /kr/old
              </span>
            </span>
          </label>
          <textarea
            placeholder={`제외할 경로를 한 줄씩 입력하세요.\n예시:\n/eng\n/kr/old`}
            value={config.excludePaths || ''}
            onChange={(e) => setConfig({ ...config, excludePaths: e.target.value })}
            rows={3}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }}
          />
        </div>
      </fieldset>

      {/* OCR 옵션 */}
      <fieldset className="form-section">
        <legend className="form-section-legend">OCR 옵션</legend>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="alttext-max-images">페이지당 최대 이미지 수</label>
            <input
              id="alttext-max-images"
              type="number"
              min={1}
              max={100}
              placeholder="20"
              value={config.maxImagesPerPage ?? ''}
              onChange={(e) =>
                setConfig({ ...config, maxImagesPerPage: parseInt(e.target.value) || undefined })
              }
            />
          </div>
          <div className="form-group">
            <label htmlFor="alttext-inspector">점검자</label>
            <input
              id="alttext-inspector"
              type="text"
              placeholder="이름 입력"
              value={config.inspector}
              onChange={(e) => setConfig({ ...config, inspector: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      <Button
        variant="primary"
        fullWidth
        onClick={onStart}
        disabled={isProcessing}
        isLoading={isProcessing}
      >
        {isProcessing ? '진행 중...' : '이미지 진단 시작'}
      </Button>
    </Card>
  );
};

export default AltTextAuditForm;
