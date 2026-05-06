'use client';

import { AuditConfig } from '@/types';
import styles from './AuditConfigForm.module.css';
import { Card } from '@/components/ui/Card';
import { Asterisk, HelpCircle, ChevronDown, ChevronRight, Sparkles, GitBranch, Key } from 'lucide-react';
import { useRef, useState } from 'react';

interface AuditConfigFormProps {
  config: AuditConfig;
  setConfig: (config: AuditConfig) => void;
  onStart: () => void;
  onGitHubStart?: () => void;
  isProcessing: boolean;
}

const PLATFORMS = ['PC', 'Mobile'] as const;

export const AuditConfigForm = ({ config, setConfig, onStart, onGitHubStart, isProcessing }: AuditConfigFormProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const platformRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handlePlatformKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
      return;
    }
    e.preventDefault();
    const last = PLATFORMS.length - 1;
    let next = currentIndex;
    if (e.key === 'ArrowLeft') next = currentIndex === 0 ? last : currentIndex - 1;
    else if (e.key === 'ArrowRight') next = currentIndex === last ? 0 : currentIndex + 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    const target = platformRefs.current[next];
    if (target) {
      target.focus();
      setConfig({ ...config, platform: PLATFORMS[next] });
    }
  };

  return (
    <Card title="">

      {/* 대상 설정 */}
      <fieldset className="form-section">
        <legend className="form-section-legend">대상 설정</legend>
        <div className="form-group">
          <label htmlFor="audit-target-url" style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
            대상 URL
            <Asterisk size={10} color="#ef4444" strokeWidth={3} aria-label="필수 입력" style={{ marginBottom: '2px' }} />
          </label>
          <input
            id="audit-target-url"
            type="url"
            placeholder="https://example.com"
            value={config.targetUrl}
            onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
          />
        </div>
      </fieldset>

      {/* 기본 설정 */}
      <fieldset className="form-section">
        <legend className="form-section-legend">기본 설정</legend>
        <div className="form-row">
          <div className="form-group">
            <label id="audit-platform-label">플랫폼</label>
            <div
              role="radiogroup"
              aria-labelledby="audit-platform-label"
              aria-label="진단 대상 디바이스"
              className={styles.platformGroup}
            >
              {PLATFORMS.map((p, idx) => {
                const selected = config.platform === p;
                const className = `${styles.platformOption} ${selected ? styles.platformOptionSelected : ''}`;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    ref={(el) => { platformRefs.current[idx] = el; }}
                    onClick={() => setConfig({ ...config, platform: p })}
                    onKeyDown={(e) => handlePlatformKeyDown(e, idx)}
                    className={className}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="audit-inspector">점검자 역할</label>
            <select
              id="audit-inspector"
              value={config.inspector || '퍼블리싱'}
              onChange={(e) => setConfig({ ...config, inspector: e.target.value })}
            >
              {['기획', '디자인', '퍼블리싱', '개발', 'QA', '운영', '기타'].map(role => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '0.5rem' }}>
          <label>진단 항목</label>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              { key: 'enableAccessibilityCheck', label: '웹접근성 (KWCAG 2.2)' },
              { key: 'enableSEOCheck', label: 'SEO 최적화' },
              { key: 'enableAICheck', label: 'AI 친화도' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9375rem', color: '#374151', fontWeight: 400 }}>
                <input
                  type="checkbox"
                  checked={config[key as keyof AuditConfig] as boolean}
                  onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#111827', cursor: 'pointer' }}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      {/* ── 3. 고급 설정 (접기/펼치기) ── */}
      <button
        type="button"
        onClick={() => setAdvancedOpen(prev => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          background: 'none',
          border: 'none',
          padding: '0.5rem 0',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#4b5563',
          marginBottom: advancedOpen ? '1rem' : '0',
        }}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        추가 옵션 및 고급 설정
      </button>

      {advancedOpen && (
        <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* 로그인 설정 */}
          <fieldset style={{ padding: '1rem', margin: 0, background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <legend style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 6px', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Key size={12} /> 로그인 인증
            </legend>
            <div style={{ marginBottom: config.enableLogin ? '0.75rem' : '0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#374151', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={config.enableLogin}
                  onChange={(e) => setConfig({ ...config, enableLogin: e.target.checked })}
                  style={{ width: '16px', height: '16px', accentColor: '#111827', cursor: 'pointer' }}
                />
                로그인이 필요한 페이지 진단
              </label>
            </div>

            {config.enableLogin && (
              <div className="form-group" style={{ marginBottom: 0, paddingLeft: '1.5rem' }}>
                <label>로그인 페이지 URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/login"
                  value={config.loginUrl}
                  onChange={(e) => setConfig({ ...config, loginUrl: e.target.value })}
                />
                <p className="login-warning">
                  ⚠️ 검사가 시작되면 로그인 브라우저 창이 열립니다. 로그인 완료 후 <b>창을 닫아주세요</b>.
                </p>
              </div>
            )}
          </fieldset>

          {/* 크롤링 설정 */}
          <fieldset style={{ padding: '1rem', margin: 0, background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <legend style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 6px', marginBottom: '0.75rem' }}>
              크롤링 설정
            </legend>
            <div className="form-row" style={{ marginBottom: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="audit-max-pages">최대 페이지 수</label>
                <input
                  id="audit-max-pages"
                  type="number"
                  placeholder="기본값 (로컬 1000)"
                  min={1}
                  max={1000}
                  value={config.maxPages ?? ''}
                  onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) || undefined })}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="audit-max-depth">최대 깊이 (Depth)</label>
                <input
                  id="audit-max-depth"
                  type="number"
                  placeholder="기본값 (로컬 10)"
                  min={1}
                  max={20}
                  value={config.maxDepth ?? ''}
                  onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) || undefined })}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                제외할 경로 (Exclude Paths)
                <span className="tooltip-wrap">
                  <HelpCircle size={14} color="#9ca3af" style={{ cursor: 'pointer' }} tabIndex={0} aria-label="제외 경로 도움말" />
                  <span className="tooltip-bubble">
                    입력한 경로로 시작하는 URL은 검사에서 제외됩니다.
                    <br />예시: /eng, /kr/old
                  </span>
                </span>
              </label>
              <textarea
                placeholder={`/eng\n/kr/old`}
                value={config.excludePaths || ''}
                onChange={(e) => setConfig({ ...config, excludePaths: e.target.value })}
                rows={2}
                style={{ resize: 'vertical', fontFamily: 'monospace' }}
              />
            </div>
          </fieldset>

          {/* 고급 옵션 */}
          <fieldset style={{ padding: '1rem', margin: 0, background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <legend style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 6px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              동적 렌더링 지연
              <span className="tooltip-wrap">
                <HelpCircle size={14} color="#9ca3af" style={{ cursor: 'pointer' }} tabIndex={0} aria-label="고급 옵션 도움말" />
                <span className="tooltip-bubble">
                  SPA(React/Vue/Angular) 사이트는 자동 감지됩니다.<br />
                  특정 selector가 보일 때 진단 시작이 필요하면 입력하세요.
                </span>
              </span>
            </legend>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="audit-ready-selector">렌더링 완료 Selector (선택사항)</label>
              <input
                id="audit-ready-selector"
                type="text"
                placeholder="예: #app .loaded 또는 [data-test=ready]"
                value={config.readySelector || ''}
                onChange={(e) => setConfig({ ...config, readySelector: e.target.value || undefined })}
              />
            </div>
          </fieldset>
        </div>
      )}

      {/* ── 4. 실행 버튼 — 하단 가운데 정렬 및 강조 ── */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
        {onGitHubStart && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onGitHubStart}
            disabled={isProcessing}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#24292e',
              color: '#fff',
              borderColor: '#24292e',
              padding: '0.875rem 1.5rem',
              fontSize: '0.9375rem',
              borderRadius: '8px',
              fontWeight: 600,
              flex: 1,
              maxWidth: '220px',
              justifyContent: 'center'
            }}
          >
            <GitBranch size={18} aria-hidden="true" />
            대규모 진단 (GitHub)
          </button>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onStart}
          disabled={isProcessing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'center',
            padding: '0.875rem 1.5rem',
            fontSize: '0.9375rem',
            borderRadius: '8px',
            fontWeight: 600,
            flex: 1,
            maxWidth: onGitHubStart ? '220px' : '300px'
          }}
        >
          <Sparkles size={18} aria-hidden="true" />
          {isProcessing ? '진행 중...' : '전체 검사 시작'}
        </button>
      </div>

    </Card>
  );
};
