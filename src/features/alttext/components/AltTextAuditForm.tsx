'use client';

import { Asterisk } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import styles from '@/app/page.module.css';
import type { AltTextConfig } from '../hooks/useAltTextAudit';

interface AltTextAuditFormProps {
  config: AltTextConfig;
  setConfig: (config: AltTextConfig) => void;
  onStart: () => void;
  isProcessing: boolean;
}

export const AltTextAuditForm = ({ config, setConfig, onStart, isProcessing }: AltTextAuditFormProps) => {
  return (
    <Card className={styles.card} title="">
      <fieldset className={styles.formSection}>
        <legend className={styles.formSectionLegend}>대상 URL</legend>
        <div className="form-group">
          <label htmlFor="alttext-urls" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            검사할 페이지 URL (한 줄에 하나씩, 최대 50개)
            <Asterisk size={10} color="#ef4444" strokeWidth={3} aria-label="필수 입력" />
          </label>
          <textarea
            id="alttext-urls"
            placeholder={'https://example.com\nhttps://example.com/about'}
            value={config.urlsText}
            onChange={(e) => setConfig({ ...config, urlsText: e.target.value })}
            rows={6}
            style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.9rem', width: '100%' }}
          />
        </div>
      </fieldset>

      <fieldset className={styles.formSection}>
        <legend className={styles.formSectionLegend}>옵션</legend>
        <div className={styles.row}>
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
