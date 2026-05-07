/**
 * Alt-text(이미지 진단) 도메인 전용 Notion 라이터 / 리더.
 *
 * 책임:
 *  - saveAltTextAuditResult: AltTextAuditResult → Notion 페이지 (요약 + 페이지별 toggle + JSON code block)
 *  - getAltTextAuditResult: Notion 페이지의 JSON code block 들을 페이지네이션으로 재조립 (enrich 없음)
 *  - getAltTextHistory: Alt-text DB 의 활성 항목 리스트
 *
 * NotionAuditWriter 와 동일하게 `notion-blocks.ts` 의 청킹 헬퍼를 사용한다.
 * Audit 과 별개의 DB 를 대상으로 한다 (NOTION_ALTTEXT_DATABASE_ID).
 */

import { Client } from '@notionhq/client';
import type { QueryDatabaseResponse } from '@notionhq/client/build/src/api-endpoints';
import type { AltTextAuditResult, AltTextHistoryItem } from '@/types/alt-text';
import {
  chunkRichText,
  buildJsonCodeBlocks,
  chunkBlocksForApi,
  assembleJsonFromCodeBlocks,
  buildHeading2,
  buildHeading3,
  buildParagraph,
  buildBullet,
  buildToggle,
  type NotionBlock,
  type NotionListBlock,
} from './notion-blocks';
import {
  isFullPage,
  getProp,
  readTitleText,
  readRichText,
  readNumber,
  readDateStart,
  readUrl,
  formatUUID,
} from './NotionAuditWriter';

const FIRST_BATCH_SIZE_ALTTEXT = 100;

export class NotionAltTextWriter {
  private readonly formattedDbId: string;

  constructor(
    private readonly notion: Client,
    private readonly databaseId: string,
  ) {
    this.formattedDbId = formatUUID(databaseId);
  }

  async saveAltTextAuditResult(
    result: AltTextAuditResult,
    reportUrl?: string,
  ): Promise<string> {
    const counts = result.countsByJudgment ?? {};
    const targetUrls = result.targetUrls ?? [];
    const titleText =
      targetUrls.length === 1
        ? targetUrls[0]
        : `이미지 진단 - URL ${targetUrls.length}개`;

    const children: NotionBlock[] = [
      buildHeading2('🖼️ 이미지 진단 요약'),
      buildBullet(`대상 URL: ${result.totalUrls}개`),
      buildBullet(`OCR 실행 이미지: ${result.totalImagesScanned}장`),
      buildBullet(`불일치(pass 제외): ${result.totalMismatches}건`),
      buildHeading3('판정별 카운트'),
      buildBullet(`✅ pass: ${counts.pass ?? 0}`),
      buildBullet(`🔴 missing_alt: ${counts.missing_alt ?? 0}`),
      buildBullet(`🟠 decorative_mismatch: ${counts.decorative_mismatch ?? 0}`),
      buildBullet(`🟠 text_mismatch: ${counts.text_mismatch ?? 0}`),
      buildBullet(`🟡 review_needed: ${counts.review_needed ?? 0}`),
      buildHeading2('🚨 페이지별 상세'),
    ];

    // 페이지별 toggle — pass 제외 항목만 50건 까지
    for (const scan of result.scans ?? []) {
      const items = scan.items ?? [];
      const mismatches = items.filter((i) => i.judgment !== 'pass');
      const detailChildren: NotionBlock[] =
        mismatches.length === 0
          ? [buildParagraph('불일치 없음 (모든 이미지 pass)')]
          : mismatches
              .slice(0, 50)
              .map((item) =>
                buildParagraph(
                  `[${item.judgment}] alt="${item.currentAlt ?? '(없음)'}" / OCR="${(item.extractedText ?? '').substring(0, 80)}" / ${item.reason ?? ''}`,
                ),
              );
      children.push(buildToggle(`[${mismatches.length}건] ${scan.pageUrl ?? '(URL 없음)'}`, detailChildren));
    }

    // 원본 JSON code block 들 — alt-text 는 별도 축소판 없이 원본 그대로 직렬화
    children.push(buildHeading2('💾 원본 데이터 (JSON)'));
    const jsonString = JSON.stringify(result, null, 2);
    const richTextChunks = chunkRichText(jsonString);
    children.push(...buildJsonCodeBlocks(richTextChunks));

    // Notion DB 속성
    const properties: Record<string, unknown> = {
      'Page URL': { title: [{ text: { content: titleText } }] },
      Date: { date: { start: result.endTime || new Date().toISOString() } },
      'Total URLs': { number: result.totalUrls },
      'Total Images': { number: result.totalImagesScanned },
      Mismatches: { number: result.totalMismatches },
      Pass: { number: counts.pass ?? 0 },
      'Missing Alt': { number: counts.missing_alt ?? 0 },
      'Decorative Mismatch': { number: counts.decorative_mismatch ?? 0 },
      'Text Mismatch': { number: counts.text_mismatch ?? 0 },
      'Review Needed': { number: counts.review_needed ?? 0 },
      'Report Link': { url: reportUrl || null },
      Deleted: { checkbox: false },
    };
    if (result.inspector) {
      properties['Inspector'] = {
        rich_text: [{ text: { content: result.inspector } }],
      };
    }

    // 첫 호출에 100블록까지, 나머지 100/call
    const response = await this.notion.pages.create({
      parent: { database_id: this.formattedDbId },
      properties: properties as Parameters<Client['pages']['create']>[0]['properties'],
      children: children.slice(0, FIRST_BATCH_SIZE_ALTTEXT) as Parameters<
        Client['pages']['create']
      >[0]['children'],
    });
    const pageId = response.id;

    if (children.length > FIRST_BATCH_SIZE_ALTTEXT) {
      const remaining = children.slice(FIRST_BATCH_SIZE_ALTTEXT);
      const batches = chunkBlocksForApi(remaining);
      for (const batch of batches) {
        await this.notion.blocks.children.append({
          block_id: pageId,
          children: batch as Parameters<
            Client['blocks']['children']['append']
          >[0]['children'],
        });
      }
    }

    return pageId;
  }

  async getAltTextAuditResult(pageId: string): Promise<AltTextAuditResult | null> {
    try {
      let jsonContent = '';
      let hasMore = true;
      let startCursor: string | undefined = undefined;

      while (hasMore) {
        const response = await this.notion.blocks.children.list({
          block_id: pageId,
          start_cursor: startCursor,
        });
        jsonContent += assembleJsonFromCodeBlocks(
          response.results as unknown as NotionListBlock[],
        );
        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;
      }

      if (!jsonContent) {
        console.error('No JSON block found in Notion alt-text page:', pageId);
        return null;
      }

      try {
        return JSON.parse(jsonContent) as AltTextAuditResult;
      } catch (e) {
        console.error('Failed to parse alt-text JSON from Notion:', e);
        return null;
      }
    } catch (error) {
      console.error('Error fetching alt-text result from Notion:', error);
      return null;
    }
  }

  async getAltTextHistory(): Promise<AltTextHistoryItem[]> {
    try {
      const response = await this.notion.request<QueryDatabaseResponse>({
        path: `databases/${this.formattedDbId}/query`,
        method: 'post',
        body: {
          filter: { property: 'Deleted', checkbox: { equals: false } },
          sorts: [{ property: 'Date', direction: 'descending' }],
        },
      });

      if (!response || !response.results) {
        console.error('Invalid Notion response (alt-text history):', response);
        return [];
      }

      return response.results.filter(isFullPage).map((page): AltTextHistoryItem => {
        const props = page.properties;
        return {
          id: page.id,
          title: readTitleText(getProp(props, 'Page URL')),
          date: readDateStart(getProp(props, 'Date')),
          totalUrls: readNumber(getProp(props, 'Total URLs')),
          totalImages: readNumber(getProp(props, 'Total Images')),
          mismatches: readNumber(getProp(props, 'Mismatches')),
          inspector: readRichText(getProp(props, 'Inspector')),
          reportLink: readUrl(getProp(props, 'Report Link')),
        };
      });
    } catch (error) {
      console.error('Error fetching alt-text history:', error);
      return [];
    }
  }
}
