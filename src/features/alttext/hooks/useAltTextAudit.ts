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
  status: 'idle' | 'crawling' | 'scanning' | 'completed' | 'error';
  message: string;
  current: number;
  total: number;
  currentUrl: string;
  startTime?: number;
}

export interface AltTextLogEntry {
  time: string;
  message: string;
}

const STORAGE_KEY = 'altTextAuditResult';

export function useAltTextAudit(onHistoryRefresh?: () => void) {
  const [config, setConfig] = useState<AltTextConfig>({
    targetUrl: '',
    inspector: '',
    maxPages: undefined,
    maxDepth: undefined,
    excludePaths: '',
    maxImagesPerPage: undefined,
  });
  const [progress, setProgress] = useState<AltTextProgressState>({
    status: 'idle', message: '', current: 0, total: 0, currentUrl: '',
  });
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

    const now = Date.now();
    setLogs([]);
    setResult(null);
    setProgress({
      status: 'crawling', message: '크롤링 + OCR 시작...',
      current: 0, total: 0, currentUrl: '', startTime: now,
    });
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

      // SSE 스트리밍 파싱
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let audit: AltTextAuditResult | null = null;
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;

          const eventMatch = block.match(/^event:\s*(\S+)\ndata:\s*([\s\S]+)$/);
          if (!eventMatch) continue;

          const [, eventType, dataStr] = eventMatch;
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(dataStr);
          } catch {
            continue;
          }

          switch (eventType) {
            case 'crawl-progress':
              setProgress(prev => ({
                ...prev,
                status: 'crawling',
                message: `크롤링: ${parsed.current}/${parsed.total} - ${parsed.url}`,
                current: parsed.current as number,
                total: parsed.total as number,
                currentUrl: parsed.url as string,
              }));
              addLog(`크롤링: ${parsed.current}/${parsed.total} - ${parsed.url}`);
              break;

            case 'progress':
              setProgress(prev => ({
                ...prev,
                status: 'scanning',
                message: `OCR 분석: ${parsed.current}/${parsed.total} - ${parsed.url}`,
                current: parsed.current as number,
                total: parsed.total as number,
                currentUrl: parsed.url as string,
              }));
              addLog(`OCR 분석: ${parsed.current}/${parsed.total} - ${parsed.url}`);
              break;

            case 'log':
              addLog(parsed.message as string);
              break;

            case 'result':
              audit = parsed as unknown as AltTextAuditResult;
              break;

            case 'error':
              throw new Error(String(parsed.message || '이미지 진단 실패'));
          }
        }
      }

      if (!audit) {
        throw new Error('서버에서 결과를 수신하지 못했습니다.');
      }

      setResult(audit);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(audit));
      } catch {
        // localStorage 용량 초과 등은 무시
      }

      addLog(
        `🎉 진단 완료 — 페이지 ${audit.totalUrls}개, 이미지 ${audit.totalImagesScanned}장, 불일치 ${audit.totalMismatches}건`,
      );
      setProgress(prev => ({
        ...prev,
        status: 'completed',
        message: `완료 — 페이지 ${audit.totalUrls}개 / 이미지 ${audit.totalImagesScanned}장 / 불일치 ${audit.totalMismatches}건 (Notion 자동 저장 중...)`,
      }));

      // Auto-save to Notion
      try {
        addLog('Notion 자동 저장 진행 중...');
        const saveRes = await fetch('/api/alttext/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(audit),
        });

        if (!saveRes.ok) {
          const err = await saveRes.json().catch(() => ({}));
          throw new Error(err.error || 'Notion 저장 실패');
        }

        const { reportUrl } = await saveRes.json();
        addLog(`Notion 자동 저장 완료! ${reportUrl ? `(${reportUrl})` : ''}`);
        setProgress(prev => ({
          ...prev,
          status: 'completed',
          message: `완료 및 Notion 저장 완료 — 페이지 ${audit!.totalUrls}개 / 이미지 ${audit!.totalImagesScanned}장 / 불일치 ${audit!.totalMismatches}건`,
        }));
        if (onHistoryRefresh) {
          onHistoryRefresh();
        }
      } catch (saveError) {
        const msg = saveError instanceof Error ? saveError.message : String(saveError);
        addLog(`Notion 자동 저장 오류: ${msg}`);
        setProgress(prev => ({
          ...prev,
          status: 'completed',
          message: `완료 (Notion 저장 실패) — 페이지 ${audit!.totalUrls}개 / 이미지 ${audit!.totalImagesScanned}장 / 불일치 ${audit!.totalMismatches}건`,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`오류: ${message}`);
      setProgress(prev => ({ ...prev, status: 'error', message, current: 0, total: 0 }));
    }
  }, [config, addLog, onHistoryRefresh]);

  return {
    config,
    setConfig,
    progress,
    logs,
    result,
    startScan,
  };
}
