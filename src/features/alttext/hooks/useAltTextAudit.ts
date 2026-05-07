'use client';

import { useCallback, useEffect, useState } from 'react';
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

export function useAltTextAudit(onHistoryRefresh?: () => void) {
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
      addLog('[크롤링] 진행 중...');
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
      addLog('[이미지 분석] 결과 집계 중...');
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
        message: `완료 — 페이지 ${audit.totalUrls}개 / 이미지 ${audit.totalImagesScanned}장 / 불일치 ${audit.totalMismatches}건 (Notion 자동 저장 중...)`,
      });

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
        addLog(`Notion 자동 저장 완료! ✅ ${reportUrl ? `(${reportUrl})` : ''}`);
        setProgress({
          status: 'completed',
          message: `완료 및 Notion 저장 완료 — 페이지 ${audit.totalUrls}개 / 이미지 ${audit.totalImagesScanned}장 / 불일치 ${audit.totalMismatches}건`,
        });
        if (onHistoryRefresh) {
          onHistoryRefresh();
        }
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : String(saveError);
        addLog(`Notion 자동 저장 오류: ${message}`);
        setProgress({
          status: 'completed',
          message: `완료 (Notion 저장 실패) — 페이지 ${audit.totalUrls}개 / 이미지 ${audit.totalImagesScanned}장 / 불일치 ${audit.totalMismatches}건`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`❌ 오류: ${message}`);
      setProgress({ status: 'error', message });
    }
  }, [config, addLog]);

  // 실행 중 페이크 로그 — 일반 진단(useAudit.ts) 패턴 미러링
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (progress.status === 'running') {
      const messages = [
        `${config.targetUrl} 접속 중...`,
        'DOM 구조 분석 중...',
        '링크 추출 중...',
        'sitemap.xml 확인 중...',
        '서버 응답 대기 중...',
        'HTML 콘텐츠 파싱 중...',
        '내부 링크 식별 중...',
        '이미지 OCR 엔진 준비 중...',
        '대체 텍스트 유사도 판정 중...',
        '이미지 전처리 중...',
        'OCR 결과 분석 중...',
      ];
      interval = setInterval(() => {
        const msg = messages[Math.floor(Math.random() * messages.length)];
        addLog(msg);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [progress.status, config.targetUrl, addLog]);

  return {
    config,
    setConfig,
    progress,
    logs,
    result,
    startScan,
  };
}
