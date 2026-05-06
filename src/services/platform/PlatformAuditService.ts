import { AuditConfig, AuditResult } from '@/types';

export interface IPlatformAuditService {
  startAudit(
    config: AuditConfig,
    onProgress?: (data: unknown) => void,
    signal?: AbortSignal
  ): Promise<AuditResult>;
  exportExcel(result: AuditResult): Promise<void>;
}

// WebAuditService: SSE 스트리밍으로 실시간 진행률 수신
export class WebAuditService implements IPlatformAuditService {
  async startAudit(
    config: AuditConfig,
    onProgress?: (data: unknown) => void,
    signal?: AbortSignal
  ): Promise<AuditResult> {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Audit failed' }));
      throw new Error(err.details || err.error || 'Audit failed');
    }

    // SSE 스트리밍 파싱
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result: AuditResult | null = null;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE 이벤트 블록 파싱 (이벤트는 빈 줄로 구분)
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || ''; // 마지막 미완성 블록은 버퍼에 보관

      for (const block of blocks) {
        if (!block.trim()) continue;

        const eventMatch = block.match(/^event:\s*(\w+)\ndata:\s*([\s\S]+)$/);
        if (!eventMatch) continue;

        const [, eventType, dataStr] = eventMatch;
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(dataStr);
        } catch {
          continue;
        }

        if (eventType === 'progress') {
          onProgress?.({ type: 'progress', ...parsed });
        } else if (eventType === 'log') {
          onProgress?.({ type: 'log', message: parsed.message });
        } else if (eventType === 'result') {
          result = parsed as unknown as AuditResult;
        } else if (eventType === 'error') {
          if (parsed.aborted) {
            throw new DOMException('Audit aborted', 'AbortError');
          }
          throw new Error(String(parsed.message || 'Audit failed'));
        }
      }
    }

    if (!result) {
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
      } as AuditResult;
    }

    return result;
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
