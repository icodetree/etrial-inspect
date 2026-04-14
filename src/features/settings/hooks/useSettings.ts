'use client';

import { useState, useEffect, useCallback } from 'react';

export interface AppSettings {
  /** 기본 진단 설정 */
  defaultPlatform: 'PC' | 'Mobile';
  defaultMaxPages: number | null;
  defaultMaxDepth: number | null;
  defaultInspector: string;

  /** 진단 항목 기본값 */
  defaultEnableAccessibility: boolean;
  defaultEnableSEO: boolean;
  defaultEnableAI: boolean;

  /** 내보내기 설정 */
  autoSaveToNotion: boolean;

  /** 표시 설정 */
  theme: 'light'; // dark mode 준비
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultPlatform: 'PC',
  defaultMaxPages: null,
  defaultMaxDepth: null,
  defaultInspector: '',
  defaultEnableAccessibility: true,
  defaultEnableSEO: true,
  defaultEnableAI: true,
  autoSaveToNotion: false,
  theme: 'light',
};

const STORAGE_KEY = 'etrial-settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch {
      /* localStorage 접근 불가 시 기본값 유지 */
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, updateSettings, resetSettings, isLoaded };
}
