/**
 * NotionService — 호환성 facade.
 *
 * Phase 3-3 리팩토링 (2026-05) 에서 Audit / Alt-text 도메인을 분리했다:
 *   - {@link NotionAuditWriter}: AuditResult 저장/조회/이력
 *   - {@link NotionAltTextWriter}: AltTextAuditResult 저장/조회/이력
 *   - {@link ./notion-blocks}: 청킹/블록 빌더 공통 함수
 *   - {@link ./enrich}: violation 축소판 → 원본 복원
 *
 * 호출처 (`src/app/api/**`, `src/app/report/[id]/page.tsx`, `src/app/alttext/[id]/page.tsx`,
 * contract test, 단위 테스트) 들은 기존 그대로 `new NotionService(apiKey, databaseId)` 를
 * 사용한다. 이 facade 가 내부적으로 두 writer 를 인스턴스화하고 메서드를 위임한다.
 *
 * 주의: 두 writer 가 같은 databaseId 를 받는다. Audit DB / Alt-text DB 는
 * 호출 측이 NotionService 인스턴스를 분리해 만들므로 각 인스턴스 안에서는 한 종류만 의미를 갖는다.
 */

import { Client } from '@notionhq/client';
import type { AuditResult } from '@/types';
import type { AltTextAuditResult, AltTextHistoryItem } from '@/types/alt-text';
import { NotionAuditWriter } from './NotionAuditWriter';
import { NotionAltTextWriter } from './NotionAltTextWriter';

export class NotionService {
  private readonly notion: Client;
  private readonly databaseId: string;
  private readonly auditWriter: NotionAuditWriter;
  private readonly altTextWriter: NotionAltTextWriter;

  constructor(apiKey: string, databaseId: string) {
    this.notion = new Client({ auth: apiKey });
    this.databaseId = databaseId;
    this.auditWriter = new NotionAuditWriter(this.notion, this.databaseId);
    this.altTextWriter = new NotionAltTextWriter(this.notion, this.databaseId);
  }

  // ─── Audit 도메인 ────────────────────────────────────────────────────

  saveAuditResult(result: AuditResult, reportUrl?: string): Promise<string> {
    return this.auditWriter.saveAuditResult(result, reportUrl);
  }

  getAuditResult(pageId: string): Promise<AuditResult | null> {
    return this.auditWriter.getAuditResult(pageId);
  }

  updatePageProperty(
    pageId: string,
    properties: Parameters<Client['pages']['update']>[0]['properties'],
  ): Promise<void> {
    return this.auditWriter.updatePageProperty(pageId, properties);
  }

  getAuditHistory() {
    return this.auditWriter.getAuditHistory();
  }

  softDeletePage(pageId: string): Promise<boolean> {
    return this.auditWriter.softDeletePage(pageId);
  }

  // ─── Alt-text 도메인 ─────────────────────────────────────────────────

  saveAltTextAuditResult(
    result: AltTextAuditResult,
    reportUrl?: string,
  ): Promise<string> {
    return this.altTextWriter.saveAltTextAuditResult(result, reportUrl);
  }

  getAltTextAuditResult(pageId: string): Promise<AltTextAuditResult | null> {
    return this.altTextWriter.getAltTextAuditResult(pageId);
  }

  getAltTextHistory(): Promise<AltTextHistoryItem[]> {
    return this.altTextWriter.getAltTextHistory();
  }
}
