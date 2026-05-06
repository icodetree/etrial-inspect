'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { AuditConfig, AuditResult } from '@/types';

export interface ProgressState {
  status:
    | 'idle'
    | 'crawling'
    | 'auditing'
    | 'completed'
    | 'error'
    | 'github_polling'
    | 'cancelling'
    | 'cancelled';
  currentUrl: string;
  totalFound: number;
  processed: number;
  violations: number;
  message: string;
  startTime?: number;          // 진단 시작 시각 (Date.now())
  estimatedRemaining?: number; // 예상 잔여 시간 (초)
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
    inspector: '이트라이브',
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

  // 진단 abort 컨트롤러 — 정지 버튼 / 새로고침 / 탭 닫기 시 서버 작업까지 중단
  const abortControllerRef = useRef<AbortController | null>(null);

  // GitHub Actions 폴링 상태
  const [githubRunId, setGithubRunId] = useState<string | null>(null);
  const [isPollingGitHub, setIsPollingGitHub] = useState(false);
  const [latestReportId, setLatestReportId] = useState<string | null>(null);
  const [wasGitHubAudit, setWasGitHubAudit] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 페이지 새로고침/탭 닫기 시 진행 중인 진단을 명시적으로 abort
  useEffect(() => {
    const handler = () => {
      abortControllerRef.current?.abort();
    };
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
      // 컴포넌트 언마운트 시에도 abort
      abortControllerRef.current?.abort();
    };
  }, []);

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

  // 잔여 시간 추정: 처리 속도 기반 ETA 계산
  useEffect(() => {
    if (
      (progress.status === 'crawling' || progress.status === 'auditing') &&
      progress.startTime &&
      progress.processed > 0 &&
      progress.totalFound > 0
    ) {
      const elapsed = (Date.now() - progress.startTime) / 1000; // 초
      const rate = progress.processed / elapsed; // 페이지/초
      const remaining = Math.max(0, (progress.totalFound - progress.processed) / rate);
      setProgress(prev => ({ ...prev, estimatedRemaining: Math.round(remaining) }));
    }
  }, [progress.status, progress.processed, progress.totalFound, progress.startTime]);

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
      startTime: Date.now(),
      estimatedRemaining: undefined,
    });

    // 새 진단을 시작할 때마다 새 AbortController. 직전 컨트롤러는 startAudit 중복 호출 시 정리.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const { requestAudit } = await import('@/lib/audit-client');

      const data = await requestAudit(
        config,
        (progressData: any) => {
          if (progressData.type === 'log') {
            addLog(progressData.message);
          } else if (progressData.type === 'progress') {
            setProgress((prev) => {
              // 크롤링→진단 단계 자동 전환: total이 확정되고 current가 0이 아닌 시점
              const isAuditing = prev.status === 'auditing' ||
                (prev.totalFound > 0 && progressData.current !== undefined && prev.status === 'crawling' && progressData.total === prev.totalFound);
              return {
                ...prev,
                processed: progressData.current ?? prev.processed,
                totalFound: progressData.total ?? prev.totalFound,
                currentUrl: progressData.url ?? prev.currentUrl,
                status: isAuditing ? 'auditing' : prev.status,
              };
            });
          }
        },
        controller.signal
      );

      addLog(`크롤링 완료. ${data.totalPages}개 페이지 발견.`);
      addLog(`진단 완료. ${data.totalViolations}개 위반 사항 발견.`);

      setProgress({
        status: 'completed',
        currentUrl: '',
        totalFound: data.totalPages,
        processed: data.totalPages,
        violations: data.totalViolations,
        message: '진단 완료! (Notion 자동 저장 중...)',
      });

      setResults({
        pages: data.totalPages,
        violations: data.totalViolations,
      });
      setAuditResult(data);

      localStorage.setItem('auditResult', JSON.stringify(data));

      // Auto-save to Notion
      try {
        addLog('Notion 자동 저장 진행 중...');
        const response = await fetch('/api/history/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to auto-save to Notion');
        }

        addLog('Notion 자동 저장 완료! ✅');
        setProgress(prev => ({
          ...prev,
          message: '진단 및 Notion 저장 완료!',
        }));
        if (onHistoryRefresh) {
          onHistoryRefresh();
        }
      } catch (saveError) {
        const msg = saveError instanceof Error ? saveError.message : String(saveError);
        addLog(`Notion 자동 저장 오류: ${msg}`);
        setProgress(prev => ({
          ...prev,
          message: '진단 완료 (Notion 저장 실패)',
        }));
      }
    } catch (error) {
      // AbortError 는 정상 흐름 — 사용자/탭 닫기 등으로 정지된 경우
      const isAbort =
        (error as Error)?.name === 'AbortError' || controller.signal.aborted;
      if (isAbort) {
        addLog('🛑 진단이 취소되었습니다.');
        setProgress({
          status: 'cancelled',
          currentUrl: '',
          totalFound: 0,
          processed: 0,
          violations: 0,
          message: '진단이 취소되었습니다.',
        });
      } else {
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
    } finally {
      // 진단이 끝났으면 컨트롤러는 더 이상 의미 없음
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [config, addLog]);

  /** 진행 중인 진단을 정지한다. 새로고침/탭 닫기와 동일한 abort 신호를 보낸다. */
  const cancelAudit = useCallback(() => {
    if (!abortControllerRef.current) return;
    setProgress((prev) => ({
      ...prev,
      status: 'cancelling',
      message: '진단을 정지하는 중...',
    }));
    addLog('🛑 사용자 요청으로 진단을 정지합니다.');
    abortControllerRef.current.abort();
  }, [addLog]);

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
    cancelAudit,
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
