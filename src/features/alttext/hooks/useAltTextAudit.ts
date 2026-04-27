'use client';

import { useCallback, useState } from 'react';
import type { AltTextAuditResult } from '@/types/alt-text';

export interface AltTextConfig {
  targetUrl: string;
  inspector: string;
  maxPages?: number;
  maxDepth?: number;
  excludePaths?: string;
  maxImagesPerPage?: number;
}

export interface AltTextProgressState {
  status: 'idle' | 'running' | 'completed' | 'error';
  message: string;
}

export interface AltTextLogEntry {
  time: string;
  message: string;
}

const STORAGE_KEY = 'altTextAuditResult';

export function useAltTextAudit() {
  const [config, setConfig] = useState<AltTextConfig>({
    targetUrl: '',
    inspector: '',
    maxPages: undefined,
    maxDepth: undefined,
    excludePaths: '',
    maxImagesPerPage: undefined,
  });
  const [progress, setProgress] = useState<AltTextProgressState>({ status: 'idle', message: '' });
  const [logs, setLogs] = useState<AltTextLogEntry[]>([]);
  const [result, setResult] = useState<AltTextAuditResult | null>(null);

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString('ko-KR', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    setLogs(prev => [...prev.slice(-200), { time, message }]);
  }, []);

  const startScan = useCallback(async () => {
    if (!config.targetUrl.trim()) {
      alert('대상 URL을 입력해주세요.');
      return;
    }

    setLogs([]);
    setResult(null);
    setProgress({ status: 'running', message: '크롤링 + OCR 시작...' });
    addLog(`🚀 크롤링 + 이미지 진단 시작: ${config.targetUrl}`);

    try {
      const res = await fetch('/api/alttext/crawl-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: config.targetUrl.trim(),
          inspector: config.inspector || undefined,
          maxPages: config.maxPages,
          maxDepth: config.maxDepth,
          excludePaths: config.excludePaths,
          maxImagesPerPage: config.maxImagesPerPage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const audit: AltTextAuditResult = await res.json();
      setResult(audit);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(audit));
      } catch {
        // localStorage 용량 초과 등은 무시
      }
      addLog(
        `🎉 진단 완료 — 페이지 ${audit.totalUrls}개, 이미지 ${audit.totalImagesScanned}장, 불일치 ${audit.totalMismatches}건`,
      );
      setProgress({
        status: 'completed',
        message: `완료 — 페이지 ${audit.totalUrls}개 / 이미지 ${audit.totalImagesScanned}장 / 불일치 ${audit.totalMismatches}건`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ 오류: ${message}`);
      setProgress({ status: 'error', message });
    }
  }, [config, addLog]);

  return {
    config,
    setConfig,
    progress,
    logs,
    result,
    startScan,
  };
}
