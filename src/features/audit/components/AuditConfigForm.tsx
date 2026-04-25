import { AuditConfig } from '@/types';
import styles from '@/app/page.module.css'; // Might need to move or refactor styles later
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Asterisk, HelpCircle } from 'lucide-react';

interface AuditConfigFormProps {
  config: AuditConfig;
  setConfig: (config: AuditConfig) => void;
  onStart: () => void;
  onGitHubStart?: () => void;
  isProcessing: boolean;
}

export const AuditConfigForm = ({ config, setConfig, onStart, onGitHubStart, isProcessing }: AuditConfigFormProps) => {
  return (
    <Card className={styles.card} title="">
      {/* 섹션 1: 대상 설정 */}
      <fieldset className={styles.formSection}>
        <legend className={styles.formSectionLegend}>대상 설정</legend>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            대상 URL
            <Asterisk size={10} color="#ef4444" strokeWidth={3} aria-label="필수 입력" style={{ marginBottom: '2px' }} />
          </label>
          <input
            type="url"
            placeholder="https://example.com"
            value={config.targetUrl}
            onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1.5rem' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>플랫폼</label>
            <select
              value={config.platform}
              onChange={(e) => setConfig({ ...config, platform: e.target.value as 'PC' | 'Mobile' })}
            >
              <option value="PC">PC</option>
              <option value="Mobile">Mobile</option>
            </select>
          </div>
          <div className="toggle-container" style={{ height: '45px' }}>
            <span
              className={`toggle ${config.enableLogin ? 'active' : ''}`}
              onClick={() => setConfig({ ...config, enableLogin: !config.enableLogin })}
            />
            <label className={styles['no-margin']}>로그인 필요</label>
          </div>
        </div>

        {config.enableLogin && (
          <div className="form-group">
            <label>로그인 URL</label>
            <input
              type="url"
              placeholder="https://example.com/login"
              value={config.loginUrl}
              onChange={(e) => setConfig({ ...config, loginUrl: e.target.value })}
            />
            <p className={styles['login-warning']}>
              ⚠️ 검사가 시작되면 브라우저 창이 열립니다. 로그인 완료 후 <b>창을 닫아주세요</b>. 창을 닫으면 자동으로 검사가 시작됩니다.
            </p>
          </div>
        )}
      </fieldset>

      {/* 섹션 2: 진단 옵션 */}
      <fieldset className={styles.formSection}>
        <legend className={styles.formSectionLegend}>진단 옵션</legend>

        <div className="toggle-container" style={{ marginBottom: '0.5rem' }}>
          <span
            className={`toggle ${config.enableAccessibilityCheck ? 'active' : ''}`}
            onClick={() => setConfig({ ...config, enableAccessibilityCheck: !config.enableAccessibilityCheck })}
          />
          <label className={styles['no-margin']}>웹접근성 (KWCAG 2.2)</label>
        </div>

        <div className="toggle-container" style={{ marginBottom: '0.5rem' }}>
          <span
            className={`toggle ${config.enableSEOCheck ? 'active' : ''}`}
            onClick={() => setConfig({ ...config, enableSEOCheck: !config.enableSEOCheck })}
          />
          <label className={styles['no-margin']}>SEO 최적화 (Sitemap, Meta)</label>
        </div>

        <div className="toggle-container" style={{ marginBottom: '0.5rem' }}>
          <span
            className={`toggle ${config.enableAICheck ? 'active' : ''}`}
            onClick={() => setConfig({ ...config, enableAICheck: !config.enableAICheck })}
          />
          <label className={styles['no-margin']}>AI 친화도 (llms.txt, GEO)</label>
        </div>
      </fieldset>

      {/* 섹션 3: 크롤링 설정 */}
      <fieldset className={styles.formSection}>
        <legend className={styles.formSectionLegend}>크롤링 설정</legend>

        <div className={styles.row}>
          <div className="form-group">
            <label htmlFor="audit-max-pages">최대 페이지 수</label>
            <input
              id="audit-max-pages"
              type="number"
              placeholder="기본값 (Vercel: 5 / 로컬: 1000)"
              min={1}
              max={1000}
              value={config.maxPages ?? ''}
              onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) || undefined })}
            />
          </div>
          <div className="form-group">
            <label htmlFor="audit-max-depth">최대 깊이</label>
            <input
              id="audit-max-depth"
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
            <span className={styles.tooltipWrap}>
              <HelpCircle
                size={14}
                color="#9ca3af"
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                aria-label="제외 경로 도움말"
              />
              <span className={styles.tooltipBubble}>
                입력한 경로로 시작하는 URL은 검사에서 제외됩니다.
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

      {/* 섹션 4: 기타 */}
      <fieldset className={styles.formSection}>
        <legend className={styles.formSectionLegend}>기타</legend>

        <div className="form-group">
          <label>점검자</label>
          <input
            type="text"
            placeholder="이름 입력"
            value={config.inspector}
            onChange={(e) => setConfig({ ...config, inspector: e.target.value })}
          />
        </div>
      </fieldset>

      <Button
        variant="primary"
        fullWidth
        onClick={onStart}
        disabled={isProcessing}
        isLoading={isProcessing}
      >
        {isProcessing ? '진행 중...' : '전체 검사'}
      </Button>

      {
        onGitHubStart && (
          <Button
            variant="secondary"
            onClick={onGitHubStart}
            disabled={isProcessing}
            style={{ marginTop: '0.5rem', backgroundColor: '#24292e', color: 'white', width: '100%' }}
          >
            <span style={{ marginRight: '0.5rem' }}>⚡️</span>
            대규모 진단 (GitHub Actions)
          </Button>
        )
      }
    </Card >
  );
};
