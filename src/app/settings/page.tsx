'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSettings } from '@/features/settings/hooks/useSettings';
import styles from './page.module.css';

interface IntegrationStatus {
  notion: { configured: boolean };
  github: { configured: boolean };
  hasAnthropicKey?: boolean;
}

interface AnthropicKeyState {
  hasKey: boolean;
  masked: string | null;
}

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings, isLoaded } = useSettings();
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus | null>(null);
  const [statusError, setStatusError] = useState(false);

  // Anthropic API Key 관리 상태
  const [anthropicState, setAnthropicState] = useState<AnthropicKeyState>({ hasKey: false, masked: null });
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [anthropicSaving, setAnthropicSaving] = useState(false);
  const [anthropicFeedback, setAnthropicFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchAnthropicKey = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/anthropic-key');
      const data = await res.json();
      setAnthropicState({ hasKey: data.hasKey, masked: data.masked });
    } catch {
      // 상태 조회 실패 시 기본값 유지
    }
  }, []);

  useEffect(() => {
    fetch('/api/settings/status')
      .then(r => r.json())
      .then(setIntegrationStatus)
      .catch(() => setStatusError(true));

    fetchAnthropicKey();
  }, [fetchAnthropicKey]);

  if (!isLoaded) return null;

  const handleReset = () => {
    if (window.confirm('모든 설정을 기본값으로 초기화하시겠습니까?')) {
      resetSettings();
    }
  };

  const handleSaveAnthropicKey = async () => {
    if (!anthropicKeyInput.trim()) return;
    setAnthropicSaving(true);
    setAnthropicFeedback(null);
    try {
      const res = await fetch('/api/settings/anthropic-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: anthropicKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '저장 실패');
      setAnthropicState({ hasKey: data.hasKey, masked: data.masked });
      setAnthropicKeyInput('');
      setAnthropicFeedback({ type: 'success', message: 'API 키가 저장되었습니다.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnthropicFeedback({ type: 'error', message: `저장 실패: ${msg}` });
    } finally {
      setAnthropicSaving(false);
    }
  };

  const handleDeleteAnthropicKey = async () => {
    if (!window.confirm('Anthropic API 키를 삭제하시겠습니까? AI 정밀 분석 기능을 사용할 수 없게 됩니다.')) return;
    setAnthropicSaving(true);
    setAnthropicFeedback(null);
    try {
      const res = await fetch('/api/settings/anthropic-key', { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      setAnthropicState({ hasKey: false, masked: null });
      setAnthropicKeyInput('');
      setAnthropicFeedback({ type: 'success', message: 'API 키가 삭제되었습니다.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAnthropicFeedback({ type: 'error', message: `삭제 실패: ${msg}` });
    } finally {
      setAnthropicSaving(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '720px' }}>
      <h1 className={styles.pageTitle}>설정</h1>
      <p className={styles.pageDesc}>시스템 설정을 관리합니다.</p>

      {/* 1. 연동 상태 */}
      <section aria-labelledby="section-integration" className={`card ${styles.sectionCard}`}>
        <h2 id="section-integration" className={styles.sectionTitle}>연동 상태</h2>

        {statusError ? (
          <p className={styles.helpText}>연동 상태를 불러오지 못했습니다.</p>
        ) : !integrationStatus ? (
          <p className={styles.helpText} aria-live="polite">연동 상태를 확인하는 중...</p>
        ) : (
          <>
            <div className={styles.integrationRow}>
              <span className={styles.integrationLabel}>Notion API</span>
              <span
                className={`${styles.statusBadge} ${
                  integrationStatus.notion.configured
                    ? styles.statusConnected
                    : styles.statusDisconnected
                }`}
              >
                {integrationStatus.notion.configured ? '연결됨' : '미설정'}
              </span>
            </div>

            <div className={styles.integrationRow}>
              <span className={styles.integrationLabel}>GitHub Token</span>
              <span
                className={`${styles.statusBadge} ${
                  integrationStatus.github.configured
                    ? styles.statusConnected
                    : styles.statusDisconnected
                }`}
              >
                {integrationStatus.github.configured ? '연결됨' : '미설정'}
              </span>
            </div>

            <div className={styles.integrationRow}>
              <span className={styles.integrationLabel}>Anthropic API</span>
              <span
                className={`${styles.statusBadge} ${
                  anthropicState.hasKey
                    ? styles.statusConnected
                    : styles.statusDisconnected
                }`}
              >
                {anthropicState.hasKey ? '연결됨' : '미설정'}
              </span>
            </div>
          </>
        )}

        <p className={styles.helpText} style={{ marginTop: '0.75rem' }}>
          API 키는 서버 환경변수(.env)에서 설정하거나, 아래 AI 설정에서 직접 관리할 수 있습니다.
        </p>
      </section>

      {/* 1-1. Anthropic API Key 관리 */}
      <section aria-labelledby="section-anthropic" className={`card ${styles.sectionCard}`}>
        <h2 id="section-anthropic" className={styles.sectionTitle}>AI 설정 (Anthropic API)</h2>

        <div className={styles.anthropicStatus} aria-live="polite">
          {anthropicState.hasKey ? (
            <p className={styles.anthropicStatusText}>
              <span className={styles.statusIndicatorConnected} aria-hidden="true" />
              API 키 설정됨 — <code className={styles.maskedKey}>{anthropicState.masked}</code>
            </p>
          ) : (
            <p className={styles.anthropicStatusText}>
              <span className={styles.statusIndicatorDisconnected} aria-hidden="true" />
              API 키 미설정
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="anthropic-api-key">Anthropic API 키</label>
          <div className={styles.apiKeyInputRow}>
            <input
              id="anthropic-api-key"
              type="password"
              placeholder="sk-ant-api03-..."
              autoComplete="off"
              value={anthropicKeyInput}
              onChange={(e) => setAnthropicKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveAnthropicKey();
                }
              }}
              aria-describedby="anthropic-key-help"
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSaveAnthropicKey}
              disabled={anthropicSaving || !anthropicKeyInput.trim()}
            >
              {anthropicSaving ? '저장 중...' : '저장'}
            </button>
            {anthropicState.hasKey && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteAnthropicKey}
                disabled={anthropicSaving}
              >
                삭제
              </button>
            )}
          </div>
          <p id="anthropic-key-help" className={styles.helpText}>
            Claude Vision 이미지 정밀 분석에 사용됩니다. 키는 서버의 .env.local에 저장되며, 서버 재시작 없이 즉시 반영됩니다.
          </p>
        </div>

        {anthropicFeedback && (
          <p
            className={anthropicFeedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}
            role="alert"
          >
            {anthropicFeedback.message}
          </p>
        )}
      </section>

      {/* 2. 기본 진단 설정 */}
      <section aria-labelledby="section-audit" className={`card ${styles.sectionCard}`}>
        <h2 id="section-audit" className={styles.sectionTitle}>기본 진단 설정</h2>

        <div className="form-group">
          <label htmlFor="settings-platform">기본 플랫폼</label>
          <select
            id="settings-platform"
            value={settings.defaultPlatform}
            onChange={e => updateSettings({ defaultPlatform: e.target.value as 'PC' | 'Mobile' })}
          >
            <option value="PC">PC</option>
            <option value="Mobile">Mobile</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="settings-max-pages">기본 최대 페이지 수</label>
          <input
            id="settings-max-pages"
            type="number"
            min={1}
            placeholder="제한 없음"
            value={settings.defaultMaxPages ?? ''}
            onChange={e => {
              const val = e.target.value;
              updateSettings({ defaultMaxPages: val === '' ? null : Number(val) });
            }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="settings-max-depth">기본 최대 깊이</label>
          <input
            id="settings-max-depth"
            type="number"
            min={1}
            placeholder="제한 없음"
            value={settings.defaultMaxDepth ?? ''}
            onChange={e => {
              const val = e.target.value;
              updateSettings({ defaultMaxDepth: val === '' ? null : Number(val) });
            }}
          />
        </div>

        <div className="form-group">
          <label htmlFor="settings-inspector">기본 점검자</label>
          <input
            id="settings-inspector"
            type="text"
            placeholder="점검자 이름을 입력하세요"
            value={settings.defaultInspector}
            onChange={e => updateSettings({ defaultInspector: e.target.value })}
          />
        </div>
      </section>

      {/* 3. 진단 항목 기본값 */}
      <section aria-labelledby="section-audit-types" className={`card ${styles.sectionCard}`}>
        <h2 id="section-audit-types" className={styles.sectionTitle}>진단 항목 기본값</h2>

        <div className={styles.settingRow}>
          <div className="toggle-container">
            <span
              role="switch"
              aria-checked={settings.defaultEnableAccessibility}
              aria-label="웹접근성 (KWCAG 2.2)"
              tabIndex={0}
              className={`toggle ${settings.defaultEnableAccessibility ? 'active' : ''}`}
              onClick={() => updateSettings({ defaultEnableAccessibility: !settings.defaultEnableAccessibility })}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  updateSettings({ defaultEnableAccessibility: !settings.defaultEnableAccessibility });
                }
              }}
            />
            <span>웹접근성 (KWCAG 2.2)</span>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div className="toggle-container">
            <span
              role="switch"
              aria-checked={settings.defaultEnableSEO}
              aria-label="SEO 최적화"
              tabIndex={0}
              className={`toggle ${settings.defaultEnableSEO ? 'active' : ''}`}
              onClick={() => updateSettings({ defaultEnableSEO: !settings.defaultEnableSEO })}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  updateSettings({ defaultEnableSEO: !settings.defaultEnableSEO });
                }
              }}
            />
            <span>SEO 최적화</span>
          </div>
        </div>

        <div className={styles.settingRow}>
          <div className="toggle-container">
            <span
              role="switch"
              aria-checked={settings.defaultEnableAI}
              aria-label="AI 친화도"
              tabIndex={0}
              className={`toggle ${settings.defaultEnableAI ? 'active' : ''}`}
              onClick={() => updateSettings({ defaultEnableAI: !settings.defaultEnableAI })}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  updateSettings({ defaultEnableAI: !settings.defaultEnableAI });
                }
              }}
            />
            <span>AI 친화도</span>
          </div>
        </div>
      </section>

      {/* 4. 내보내기 설정 */}
      <section aria-labelledby="section-export" className={`card ${styles.sectionCard}`}>
        <h2 id="section-export" className={styles.sectionTitle}>내보내기 설정</h2>

        <div className={styles.settingRow}>
          <div className="toggle-container">
            <span
              role="switch"
              aria-checked={settings.autoSaveToNotion}
              aria-label="진단 완료 후 자동 Notion 저장"
              tabIndex={0}
              className={`toggle ${settings.autoSaveToNotion ? 'active' : ''}`}
              onClick={() => updateSettings({ autoSaveToNotion: !settings.autoSaveToNotion })}
              onKeyDown={e => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  updateSettings({ autoSaveToNotion: !settings.autoSaveToNotion });
                }
              }}
            />
            <span>진단 완료 후 자동 Notion 저장</span>
          </div>
        </div>
      </section>

      {/* 5. 표시 설정 */}
      <section aria-labelledby="section-display" className={`card ${styles.sectionCard}`}>
        <h2 id="section-display" className={styles.sectionTitle}>표시 설정</h2>

        <div className="form-group">
          <label htmlFor="settings-theme">테마</label>
          <select id="settings-theme" value="light" disabled>
            <option value="light">라이트</option>
          </select>
          <p className={styles.helpText}>다크모드 준비 중</p>
        </div>
      </section>

      {/* 초기화 버튼 */}
      <div className={styles.resetArea}>
        <button
          type="button"
          className="btn btn-danger"
          onClick={handleReset}
        >
          기본값으로 초기화
        </button>
      </div>
    </div>
  );
}
