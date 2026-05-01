'use client';

import { AuditConfig } from '@/types';
import styles from '@/app/page.module.css';
import { Card } from '@/components/ui/Card';
import { Asterisk, HelpCircle, ChevronDown, ChevronRight, Sparkles, GitBranch, Key } from 'lucide-react';
import { useState } from 'react';

interface AuditConfigFormProps {
  config: AuditConfig;
  setConfig: (config: AuditConfig) => void;
  onStart: () => void;
  onGitHubStart?: () => void;
  isProcessing: boolean;
}

export const AuditConfigForm = ({ config, setConfig, onStart, onGitHubStart, isProcessing }: AuditConfigFormProps) => {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <Card className={styles.card} title="">

      {/* ── 1. 대상 URL ── */}
      <div className="form-group" style={{ marginBottom: '1.25rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.9375rem', fontWeight: 600, color: '#374151' }}>
          대상 URL
          <Asterisk size={12} color="#ef4444" strokeWidth={3} aria-label="필수 입력" style={{ marginBottom: '2px' }} />
        </label>
        <input
          type="url"
          placeholder="https://example.com"
          value={config.targetUrl}
          onChange={(e) => setConfig({ ...config, targetUrl: e.target.value })}
          style={{ padding: '0.75rem 1rem', fontSize: '1rem', borderRadius: '8px' }}
        />
      </div>

      {/* ── 2. 기본 설정 (플랫폼 & 진단항목 & 점검자) ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', alignItems: 'center', marginBottom: '1.25rem', padding: '1.25rem', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
        
        {/* 플랫폼 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>플랫폼</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['PC', 'Mobile'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setConfig({ ...config, platform: p })}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  border: '1px solid',
                  cursor: 'pointer',
                  background: config.platform === p ? '#111827' : '#fff',
                  color: config.platform === p ? '#fff' : '#374151',
                  borderColor: config.platform === p ? '#111827' : '#d1d5db',
                  transition: 'all 0.15s',
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* 구분선 */}
        <div style={{ width: '1px', background: '#e5e7eb', alignSelf: 'stretch', margin: '0 0.25rem' }} aria-hidden="true" />

        {/* 점검자 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>점검자 역할</span>
          <select
            value={config.inspector || '퍼블리싱'}
            onChange={(e) => setConfig({ ...config, inspector: e.target.value })}
            style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.875rem', height: '34px', background: '#fff', minWidth: '130px', outline: 'none' }}
          >
            {['기획', '디자인', '퍼블리싱', '개발', 'QA', '운영', '기타'].map(role => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>

        {/* 구분선 */}
        <div style={{ width: '1px', background: '#e5e7eb', alignSelf: 'stretch', margin: '0 0.25rem' }} aria-hidden="true" />

        {/* 진단 항목 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>진단 항목</span>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center', height: '34px' }}>
            {[
              { key: 'enableAccessibilityCheck', label: '웹접근성 (KWCAG 2.2)' },
              { key: 'enableSEOCheck', label: 'SEO 최적화' },
              { key: 'enableAICheck', label: 'AI 친화도' },
            ].map(({ key, label }) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#374151' }}>
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

      </div>

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
                <label style={{ fontSize: '0.8125rem', color: '#4b5563', marginBottom: '4px' }}>로그인 페이지 URL</label>
                <input
                  type="url"
                  placeholder="https://example.com/login"
                  value={config.loginUrl}
                  onChange={(e) => setConfig({ ...config, loginUrl: e.target.value })}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
                />
                <p className={styles['login-warning']} style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#b45309', background: '#fef3c7', padding: '0.5rem 0.75rem', borderRadius: '6px' }}>
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
            <div className={styles.row} style={{ marginBottom: '1rem', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <label htmlFor="audit-max-pages" style={{ fontSize: '0.8125rem' }}>최대 페이지 수</label>
                <input
                  id="audit-max-pages"
                  type="number"
                  placeholder="기본값 (로컬 1000)"
                  min={1}
                  max={1000}
                  value={config.maxPages ?? ''}
                  onChange={(e) => setConfig({ ...config, maxPages: parseInt(e.target.value) || undefined })}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                <label htmlFor="audit-max-depth" style={{ fontSize: '0.8125rem' }}>최대 깊이 (Depth)</label>
                <input
                  id="audit-max-depth"
                  type="number"
                  placeholder="기본값 (로컬 10)"
                  min={1}
                  max={20}
                  value={config.maxDepth ?? ''}
                  onChange={(e) => setConfig({ ...config, maxDepth: parseInt(e.target.value) || undefined })}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8125rem' }}>
                제외할 경로 (Exclude Paths)
                <span className={styles.tooltipWrap}>
                  <HelpCircle size={14} color="#9ca3af" style={{ cursor: 'pointer' }} tabIndex={0} aria-label="제외 경로 도움말" />
                  <span className={styles.tooltipBubble}>
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
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
              />
            </div>
          </fieldset>

          {/* 고급 옵션 */}
          <fieldset style={{ padding: '1rem', margin: 0, background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <legend style={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 6px', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              동적 렌더링 지연
              <span className={styles.tooltipWrap}>
                <HelpCircle size={14} color="#9ca3af" style={{ cursor: 'pointer' }} tabIndex={0} aria-label="고급 옵션 도움말" />
                <span className={styles.tooltipBubble}>
                  SPA(React/Vue/Angular) 사이트는 자동 감지됩니다.<br />
                  특정 selector가 보일 때 진단 시작이 필요하면 입력하세요.
                </span>
              </span>
            </legend>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="audit-ready-selector" style={{ fontSize: '0.8125rem' }}>렌더링 완료 Selector (선택사항)</label>
              <input
                id="audit-ready-selector"
                type="text"
                placeholder="예: #app .loaded 또는 [data-test=ready]"
                value={config.readySelector || ''}
                onChange={(e) => setConfig({ ...config, readySelector: e.target.value || undefined })}
                style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem' }}
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

