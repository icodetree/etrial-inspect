'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AuditConfig, AuditResult } from '@/types';

export interface ProgressState {
  status: 'idle' | 'crawling' | 'auditing' | 'completed' | 'error' | 'github_polling';
  currentUrl: string;
  totalFound: number;
  processed: number;
  violations: number;
  message: string;
}

export interface LogEntry {
  time: string;
  message: string;
}

export function useAudit(onHistoryRefresh?: () => void) {
  const [config, setConfig] = useState<AuditConfig>({
    targetUrl: '',
    enableLogin: false,
    loginUrl: '',
    loginId: '',
    loginPassword: '',
    enableAccessibilityCheck: true,
    enableSEOCheck: true,
    enableAICheck: true,
    platform: 'PC',
    inspector: '',
    excludePaths: '',
  });

  const [progress, setProgress] = useState<ProgressState>({
    status: 'idle',
    currentUrl: '',
    totalFound: 0,
    processed: 0,
    violations: 0,
    message: '',
  });

  const [results, setResults] = useState<{ pages: number; violations: number } | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);

  // GitHub Actions 폴링 상태
  const [githubRunId, setGithubRunId] = useState<string | null>(null);
  const [isPollingGitHub, setIsPollingGitHub] = useState(false);
  const [latestReportId, setLatestReportId] = useState<string | null>(null);
  const [wasGitHubAudit, setWasGitHubAudit] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs(prev => [...prev.slice(-50), { time, message }]);
  }, []);

  // GitHub Actions 상태 폴링
  useEffect(() => {
    if (!isPollingGitHub || !githubRunId) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/github/status?runId=${githubRunId}`);
        const data = await res.json();

        if (data.error) {
          addLog(`[GitHub] 상태 확인 오류: ${data.error}`);
          return;
        }

        const statusMap: Record<string, string> = {
          queued: '⏳ 대기 중',
          in_progress: '🔄 진행 중',
          completed: '✅ 완료됨',
        };

        addLog(`[GitHub] 상태: ${statusMap[data.status] || data.status}`);

        if (data.status === 'completed') {
          setIsPollingGitHub(false);
          setProgress(prev => ({ ...prev, status: 'completed' }));

          if (data.conclusion === 'success') {
            addLog(`[GitHub] 검사 완료! 결과: 성공 ✅`);
            addLog(`[GitHub] Notion에 결과가 저장되었습니다.`);
            setWasGitHubAudit(true);
            // 히스토리 목록 갱신 및 최신 리포트 ID 가져오기
            addLog(`[GitHub] Notion 저장 완료 대기 중... (3초)`);

            setTimeout(async () => {
              if (onHistoryRefresh) {
                addLog(`[GitHub] 히스토리 목록 갱신 중...`);
                onHistoryRefresh();
              }
              // 최신 리포트 ID 가져오기
              try {
                const historyRes = await fetch('/api/history/list', { cache: 'no-store' });
                if (historyRes.ok) {
                  const historyData = await historyRes.json();
                  if (historyData.length > 0) {
                    setLatestReportId(historyData[0].id);
                    addLog(`[GitHub] 최신 리포트 ID 확인 완료: ${historyData[0].id}`);
                  }
                }
              } catch (err) {
                addLog(`[GitHub] 히스토리 조회 오류: ${err}`);
              }
            }, 3000);
          } else {
            addLog(`[GitHub] 검사 완료! 결과: ${data.conclusion}`);
          }
        }
      } catch (error) {
        addLog(`[GitHub] 폴링 오류: ${error}`);
      }
    };

    // 첫 번째 폴링
    pollStatus();

    // 5초마다 폴링
    pollingIntervalRef.current = setInterval(pollStatus, 5000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [isPollingGitHub, githubRunId, addLog, onHistoryRefresh]);

  // 진행 상태 동안 시각 피드백용 페이크 로그 — 선택된 진단 옵션에 해당하는 메시지만 노출
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (progress.status === 'crawling' || progress.status === 'auditing') {
      const messages: string[] = [];

      if (config.enableAccessibilityCheck) {
        messages.push(
          `${config.targetUrl} 접속 중...`,
          'DOM 구조 분석 중...',
          '링크 추출 중...',
          '서버 응답 대기 중...',
          'HTML 콘텐츠 파싱 중...',
          '내부 링크 식별 중...',
          '검사 대기열에 페이지 추가 중...',
          'axe-core 스캐너 실행 중...',
          '접근성 규칙 검증 중...',
        );
      }
      if (config.enableSEOCheck) {
        messages.push('메타 태그 수집 중...', '헤딩 구조 분석 중...', 'robots.txt 확인 중...');
      }
      if (config.enableAICheck) {
        messages.push('llms.txt 확인 중...', 'AI 크롤러 정책 점검 중...');
      }

      if (messages.length === 0) return;

      interval = setInterval(() => {
        const randomMsg = messages[Math.floor(Math.random() * messages.length)];
        addLog(randomMsg);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [
    progress.status,
    config.targetUrl,
    config.enableAccessibilityCheck,
    config.enableSEOCheck,
    config.enableAICheck,
    addLog,
  ]);

  const startAudit = useCallback(async () => {
    if (!config.targetUrl) {
      alert('대상 URL을 입력해주세요.');
      return;
    }

    if (
      !config.enableAccessibilityCheck &&
      !config.enableSEOCheck &&
      !config.enableAICheck
    ) {
      alert('진단 옵션을 최소 한 가지 이상 선택해주세요.\n(웹접근성 · SEO · AI 친화도)');
      return;
    }

    setLogs([]);
    addLog(`시스템 초기화 완료. 대상: ${config.targetUrl}`);
    addLog('크롤러 프로세스 시작...');

    setProgress({
      status: 'crawling',
      currentUrl: config.targetUrl,
      totalFound: 0,
      processed: 0,
      violations: 0,
      message: '크롤링 시작...',
    });

    try {
      const { requestAudit } = await import('@/lib/audit-client');

      const data = await requestAudit(config, (progressData: any) => {
        if (progressData.type === 'log') {
          addLog(progressData.message);
        } else if (progressData.type === 'progress') {
          setProgress(prev => ({
            ...prev,
            processed: progressData.current,
            totalFound: progressData.total,
            currentUrl: progressData.url,
            status: 'auditing'
          }));
        }
      });

      addLog(`크롤링 완료. ${data.totalPages}개 페이지 발견.`);
      addLog(`진단 완료. ${data.totalViolations}개 위반 사항 발견.`);

      setProgress({
        status: 'completed',
        currentUrl: '',
        totalFound: data.totalPages,
        processed: data.totalPages,
        violations: data.totalViolations,
        message: '진단 완료!',
      });

      setResults({
        pages: data.totalPages,
        violations: data.totalViolations,
      });
      setAuditResult(data);

      localStorage.setItem('auditResult', JSON.stringify(data));
    } catch (error) {
      addLog(`오류 발생: ${error}`);
      setProgress({
        status: 'error',
        currentUrl: '',
        totalFound: 0,
        processed: 0,
        violations: 0,
        message: `오류 발생: ${error}`,
      });
    }
  }, [config, addLog]);

  const exportExcel = async () => {
    const savedResult = localStorage.getItem('auditResult');
    if (!savedResult) {
      alert('먼저 진단을 수행해주세요.');
      return;
    }

    try {
      addLog('엑셀 리포트 생성 중...');
      const result = JSON.parse(savedResult);
      const { getPlatformAuditService } = await import('@/services/platform/factory');
      const service = getPlatformAuditService();
      await service.exportExcel(result);
      addLog('엑셀 리포트 다운로드 완료.');
    } catch (error) {
      alert(`엑셀 다운로드 실패: ${error}`);
      addLog(`엑셀 내보내기 오류: ${error}`);
    }
  };

  const saveToNotion = async () => {
    const savedResult = localStorage.getItem('auditResult');
    if (!savedResult) {
      alert('먼저 진단을 수행해주세요.');
      return;
    }

    try {
      addLog('Notion 저장 중...');
      const result = JSON.parse(savedResult);
      const response = await fetch('/api/history/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(result),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save to Notion');
      }

      addLog('Notion 저장 완료! ✅');
      alert('Notion에 성공적으로 저장되었습니다.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`Notion 저장 오류: ${msg}`);
    }
  };

  const triggerGitHubAudit = async () => {
    if (!config.targetUrl) {
      alert('대상 URL을 입력해주세요.');
      return;
    }

    if (!confirm(`GitHub Actions를 통해 대규모 진단을 시작하시겠습니까?\n\n- 대상: ${config.targetUrl}\n- 제한: 시간 무제한 (최대 6시간)\n- 결과: 완료 시 자동으로 표시됩니다.\n\n진행하시겠습니까?`)) {
      return;
    }

    try {
      setLogs([]);
      addLog('GitHub Actions 워크플로우 트리거 중...');

      setProgress({
        status: 'github_polling',
        currentUrl: config.targetUrl,
        totalFound: 0,
        processed: 0,
        violations: 0,
        message: 'GitHub Actions 진행 중...',
      });

      const response = await fetch('/api/github/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: config.targetUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to dispatch workflow');
      }

      addLog('GitHub Actions 워크플로우가 시작되었습니다! 🚀');

      if (data.runId) {
        addLog(`[GitHub] Run ID: ${data.runId}`);
        addLog('[GitHub] 5초마다 상태를 확인합니다...');
        setGithubRunId(String(data.runId));
        setIsPollingGitHub(true);
      } else {
        addLog(`결과 확인: ${data.workflowUrl}`);
        window.open(data.workflowUrl, '_blank');
      }
    } catch (error: any) {
      const msg = error.message || 'Unknown error';
      addLog(`GitHub 요청 실패: ${msg}`);
      alert(`요청 실패: ${msg}`);
      setProgress(prev => ({ ...prev, status: 'error', message: msg }));
    }
  };

  // 폴링 중지 함수
  const stopGitHubPolling = useCallback(() => {
    setIsPollingGitHub(false);
    setGithubRunId(null);
    addLog('[GitHub] 폴링이 중지되었습니다.');
  }, [addLog]);

  // 최신 리포트 확인 및 이동 (On-demand)
  // 최신 리포트 확인 및 이동 (On-demand)
  const checkAndNavigateToLatestReport = async (router: any) => {
    try {
      addLog('[System] 리포트 결과 확인 중...');

      // 1. 서버(Notion)에서 최신 리포트 확인
      let serverLatestId = null;
      let isServerLatestRecent = false;

      try {
        const res = await fetch('/api/history/list', { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            const latest = data[0];
            const reportDate = new Date(latest.date);
            const now = new Date();

            // 유효한 날짜인지 확인
            if (!isNaN(reportDate.getTime())) {
              // 차이 계산 (분 단위)
              const diffMinutes = (now.getTime() - reportDate.getTime()) / (1000 * 60);

              // 10분 이내에 생성된 리포트만 유효한 것으로 간주
              if (diffMinutes >= 0 && diffMinutes < 10) {
                serverLatestId = latest.id;
                isServerLatestRecent = true;
              } else {
                console.log(`[System] 서버 최신 리포트가 오래됨 (${Math.round(diffMinutes)}분 전). 무시합니다.`);
              }
            }
          }
        }
      } catch (e) {
        console.error('Failed to fetch history:', e);
      }

      // 서버에 최신 리포트가 있으면 이동
      if (isServerLatestRecent && serverLatestId) {
        addLog(`[System] 최신 리포트로 이동합니다.`);
        router.push(`/report/${serverLatestId}`);
        return;
      }

      // 2. 로컬 스토리지 확인 (로컬 진단 수행 결과)
      // GitHub Actions 모드였다면 로컬에 없을 수 있으므로 후순위 체크
      const localResult = localStorage.getItem('auditResult');
      if (localResult) {
        // 로컬 결과가 너무 오래된 건 아닌지 체크할 수도 있지만,
        // 로컬은 사용자가 명시적으로 지우지 않는 한 유지되므로 일단 이동 허용
        addLog(`[System] 로컬 리포트로 이동합니다.`);
        router.push('/report');
        return;
      }

      // 3. 결과 없음
      alert('최신 진단 결과를 찾을 수 없습니다.\n\nGitHub Actions 실행 직후라면 잠시(약 10초) 후에 다시 버튼을 눌러주세요.');

    } catch (error) {
      console.error('Failed to navigate:', error);
      alert('리포트 조회 중 오류가 발생했습니다.');
    }
  };

  return {
    config,
    setConfig,
    progress,
    results,
    logs,
    addLog,
    startAudit,
    triggerGitHubAudit,
    exportExcel,
    saveToNotion,
    auditResult,
    isPollingGitHub,
    stopGitHubPolling,
    // Assuming latestReportId and wasGitHubAudit are defined elsewhere in the scope
    // and should be returned as per the instruction's return object structure.
    latestReportId,
    wasGitHubAudit,
    checkAndNavigateToLatestReport,
  };
}
