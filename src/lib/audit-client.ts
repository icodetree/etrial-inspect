import { AuditConfig, AuditResult, ProgressEvent } from '@/types';
import { getPlatformAuditService } from '@/services/platform/factory';

export async function requestAudit(
  config: AuditConfig,
  onProgress?: (data: ProgressEvent) => void,
  signal?: AbortSignal
): Promise<AuditResult> {
  const service = getPlatformAuditService();
  return service.startAudit(config, onProgress, signal);
}
