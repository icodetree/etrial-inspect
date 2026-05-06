/**
 * Notion 에 저장된 violation 축소판(compact) 에서 누락 필드를 KWCAG 매핑으로 복원.
 *
 * saveAuditResult 가 violation 을 compact 형태로 직렬화할 때 description/help 등은
 * KWCAG_MAPPING 으로 복구 가능하므로 제외해 페이로드를 줄인다.
 * getAuditResult 가 다시 읽을 때 이 함수를 통해 원래 형태로 복원한다.
 *
 * 라운드트립 toEqual 일치를 위해 backfill 기본값은 기존 NotionService.enrichViolation 와
 * bit-exact 으로 동일해야 한다 — 변경 시 contract 테스트가 빨간색이 된다.
 */

import { KWCAG_MAPPING } from '@/lib/kwcag-mapping';
import type { Violation } from '@/types';

export function enrichViolation(v: Partial<Violation>): Violation {
  const kwcagItem = KWCAG_MAPPING.find((item) => item.id === v.kwcagId);
  return {
    ...v,
    description: v.description || kwcagItem?.description || '',
    help: v.help || kwcagItem?.help || '',
    kwcagName: v.kwcagName || kwcagItem?.checkItem || '',
    principle: v.principle || kwcagItem?.principle || '',
    pageTitle: v.pageTitle || '',
    affectedCode: v.affectedCode || '',
    axeRuleId: v.axeRuleId || '',
    helpUrl: v.helpUrl || '',
    depth1: v.depth1 || '',
    depth2: v.depth2 || '',
    depth3: v.depth3 || '',
    depth4: v.depth4 || '',
    platform: v.platform || 'PC',
    inspector: v.inspector || '시스템',
    inspectionDate: v.inspectionDate || '',
    violationNumber: v.violationNumber || 0,
  } as Violation;
}
