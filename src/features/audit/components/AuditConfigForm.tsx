import { AuditConfig } from '@/types';
import styles from '@/app/page.module.css'; // Might need to move or refactor styles later
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface AuditConfigFormProps {
  config: AuditConfig;
  setConfig: (config: AuditConfig) => void;
  onStart: () => void;
  onGitHubStart?: () => void;
  isProcessing: boolean;
}

export const AuditConfigForm = ({ config, setConfig, onStart, onGitHubStart, isProcessing }: AuditConfigFormProps) => {
  return (
    <Card className={styles.card} title="진단 설정">
      <div className="form-group">
        <label>대상 URL *</label>
        <input
          type="url"
          placeholder="https://example.com"
          value={config.targetUrl}
          onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
        />
      </div>

      <div className="form-group">
        <div className="toggle-container">
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

      {/* 진단 항목 선택 */}
      <div className="form-group">
        <label className={styles['form-label']}>진단 항목 선택</label>

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

        <div className="toggle-container">
          <span
            className={`toggle ${config.enableAICheck ? 'active' : ''}`}
            onClick={() => setConfig({ ...config, enableAICheck: !config.enableAICheck })}
          />
          <label className={styles['no-margin']}>AI 친화도 (llms.txt, GEO)</label>
        </div>
      </div>

      <div className={styles.row}>
        <div className="form-group">
          <label>플랫폼</label>
          <select
            value={config.platform}
            onChange={(e) => setConfig({ ...config, platform: e.target.value as 'PC' | 'Mobile' })}
          >
            <option value="PC">PC</option>
            <option value="Mobile">Mobile</option>
          </select>
        </div>
        <div className="form-group">
          <label>점검자</label>
          <input
            type="text"
            placeholder="이름 입력"
            value={config.inspector}
            onChange={(e) => setConfig({ ...config, inspector: e.target.value })}
          />
        </div>
      </div>



      <div className="form-group">
        <label>제외 경로</label>
        <textarea
          placeholder={`제외할 경로를 한 줄씩 입력하세요.\n예시:\n/eng\n/kr/old`}
          value={config.excludePaths || ''}
          onChange={(e) => setConfig({ ...config, excludePaths: e.target.value })}
          rows={3}
          style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.85rem' }}
        />
        <small>입력한 경로로 시작하는 URL은 검사에서 제외됩니다.</small>
      </div>

      <Button
        variant="primary"
        fullWidth
        onClick={onStart}
        disabled={isProcessing}
        isLoading={isProcessing}
      >
        {isProcessing ? '진행 중...' : '🚀 전수 검사 시작'}
      </Button>

      {
        onGitHubStart && (
          <Button
            variant="secondary"
            fullWidth
            onClick={onGitHubStart}
            disabled={isProcessing}
            style={{ marginTop: '0.5rem', backgroundColor: '#24292e', color: 'white' }}
          >
            <span style={{ marginRight: '0.5rem' }}>⚡️</span>
            대규모 진단 (GitHub Actions)
          </Button>
        )
      }
    </Card >
  );
};
