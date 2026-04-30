import { AuditConfig, AuditResult } from '@/types';
import { getPlatformAuditService } from '@/services/platform/factory';

export async function requestAudit(
  config: AuditConfig,
  onProgress?: (data: any) => void,
  signal?: AbortSignal
): Promise<AuditResult> {
  const service = getPlatformAuditService();
  return service.startAudit(config, onProgress, signal);
}
