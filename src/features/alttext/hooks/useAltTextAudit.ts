'use client';

import { useCallback, useState } from 'react';
import type {
  AltTextAuditResult,
  AltTextJudgment,
  AltTextScanResult,
} from '@/types/alt-text';

export interface AltTextConfig {
  /** textarea 입력값 — 한 줄에 하나의 URL */
  urlsText: string;
  inspector: string;
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
    urlsText: '',
    inspector: '',
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
    setLogs(prev => [...prev.slice(-100), { time, message }]);
  }, []);

  const startScan = useCallback(async () => {
    const urls = config.urlsText
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      alert('URL을 한 줄에 하나씩 입력해주세요.');
      return;
    }
    if (urls.length > 50) {
      alert('한 번에 최대 50개 URL까지 지원합니다.');
      return;
    }

    setLogs([]);
    setResult(null);
    setProgress({ status: 'running', message: 'OCR 스캔 시작...' });
    addLog(`📥 ${urls.length}개 URL 입력됨`);
    addLog('🚀 OCR 스캔 요청 전송...');

    const startTime = new Date().toISOString();

    try {
      const res = await fetch('/api/alt-text-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          maxImagesPerPage: config.maxImagesPerPage,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data: { scannedAt: string; totalUrls: number; results: AltTextScanResult[] } = await res.json();
      const scans = data.results;

      const counts: Record<AltTextJudgment, number> = {
        pass: 0,
        missing_alt: 0,
        decorative_mismatch: 0,
        text_mismatch: 0,
        review_needed: 0,
      };
      let totalImages = 0;
      let totalMismatches = 0;
      for (const scan of scans) {
        totalImages += scan.totalImagesScanned;
        totalMismatches += scan.mismatchCount;
        for (const k of Object.keys(scan.countsByJudgment) as AltTextJudgment[]) {
          counts[k] += scan.countsByJudgment[k] ?? 0;
        }
        addLog(`✅ ${scan.pageUrl} — 이미지 ${scan.totalImagesScanned}장, 불일치 ${scan.mismatchCount}건`);
      }

      const audit: AltTextAuditResult = {
        startTime,
        endTime: new Date().toISOString(),
        targetUrls: urls,
        inspector: config.inspector || undefined,
        totalUrls: urls.length,
        totalImagesScanned: totalImages,
        totalMismatches,
        countsByJudgment: counts,
        scans,
        options: { maxImagesPerPage: config.maxImagesPerPage },
      };

      setResult(audit);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(audit));
      } catch {
        // localStorage 용량 초과 등은 무시
      }
      addLog('🎉 OCR 스캔 완료');
      setProgress({
        status: 'completed',
        message: `완료 — 이미지 ${totalImages}장, 불일치 ${totalMismatches}건`,
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
