import { AuditConfig, AuditResult } from '@/types';

export interface IPlatformAuditService {
  startAudit(
    config: AuditConfig,
    onProgress?: (data: unknown) => void,
    signal?: AbortSignal
  ): Promise<AuditResult>;
  exportExcel(result: AuditResult): Promise<void>;
}

// WebAuditService: Simplified for Web-only architecture
export class WebAuditService implements IPlatformAuditService {
  async startAudit(
    config: AuditConfig,
    onProgress?: (data: unknown) => void,
    signal?: AbortSignal
  ): Promise<AuditResult> {
    // Web implementation: simple fetch — signal 을 그대로 전달해 새로고침/탭닫기/정지버튼 시 서버까지 abort 가 전파된다.
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal,
    });

    if (!response.ok) {
      const err = await response.json();
      console.error('SERVER ERROR DETAILS:', err); // Log for debugging
      // Throw error with detailed message if available
      const errorMessage = err.details || err.error || 'Audit failed';
      // Append stack for developer visibility in console if needed, or just rely on console.error above
      throw new Error(errorMessage + (err.stack ? `\nStack: ${err.stack}` : ''));
    }

    const data = await response.json();

    // Handling async/pending response
    if (data.message && !data.violations) {
      // Return a dummy result structure for now
      return {
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        totalPages: 0,
        totalViolations: 0,
        pages: [],
        violations: [],
        summary: {
          byPrinciple: {},
          byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 },
          byKwcagItem: {}
        },
        // Ideally we would notify user of async start
      } as AuditResult;
    }

    return data;
  }

  async exportExcel(result: AuditResult): Promise<void> {
    const response = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kwcag-audit-${new Date().toISOString().split('T')[0]}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
}
