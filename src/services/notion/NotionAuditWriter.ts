/**
 * Audit 도메인 전용 Notion 라이터 / 리더.
 *
 * 책임:
 *  - saveAuditResult: AuditResult → Notion 페이지 생성 (요약 블록 + JSON code block 청킹)
 *  - getAuditResult: Notion 페이지의 JSON code block 들을 페이지네이션으로 모두 모아 재조립
 *  - getAuditHistory: Audit DB 의 활성 항목 리스트
 *  - softDeletePage: Deleted=true 마킹
 *  - updatePageProperty: 임의 속성 업데이트 (Report Link 등)
 *
 * 청킹 / 블록 생성은 `notion-blocks.ts` 의 순수 함수를 호출,
 * violation 축소판 복원은 `enrich.ts` 의 enrichViolation 을 호출한다.
 */

import { Client } from '@notionhq/client';
import type {
  QueryDatabaseResponse,
  PageObjectResponse,
} from '@notionhq/client/build/src/api-endpoints';
import type { AuditResult } from '@/types';
import {
  chunkRichText,
  buildJsonCodeBlocks,
  chunkBlocksForApi,
  assembleJsonFromCodeBlocks,
  buildHeading2,
  buildHeading3,
  buildParagraph,
  buildBullet,
  buildBulletLink,
  buildToggle,
  type NotionBlock,
  type NotionListBlock,
} from './notion-blocks';
import { enrichViolation } from './enrich';

// Notion property 타입 가드 (audit + alt-text 양쪽에서 공유) — `index.ts` 등으로 추가 추출하지 않고
// 여기서 한 번 정의한 뒤 alt-text writer 가 가져다 쓴다.
type PageProperties = PageObjectResponse['properties'];
type PageProperty = PageProperties[string];

export function isFullPage(
  page: QueryDatabaseResponse['results'][number],
): page is PageObjectResponse {
  return 'properties' in page;
}

export function getProp(props: PageProperties, key: string): PageProperty | undefined {
  return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : undefined;
}

export function readTitleText(prop: PageProperty | undefined): string {
  if (!prop) return '';
  if ('type' in prop ? prop.type === 'title' : 'title' in prop) {
    const arr = (prop as { title: Array<{ plain_text: string }> }).title;
    return arr?.[0]?.plain_text ?? '';
  }
  return '';
}

export function readRichText(prop: PageProperty | undefined): string | null {
  if (!prop) return null;
  if ('type' in prop ? prop.type === 'rich_text' : 'rich_text' in prop) {
    const arr = (prop as { rich_text: Array<{ plain_text: string }> }).rich_text;
    return arr?.[0]?.plain_text ?? null;
  }
  return null;
}

export function readNumber(prop: PageProperty | undefined): number {
  if (!prop) return 0;
  if ('type' in prop ? prop.type === 'number' : 'number' in prop) {
    return (prop as { number: number | null }).number ?? 0;
  }
  return 0;
}

export function readDateStart(prop: PageProperty | undefined): string {
  if (!prop) return '';
  if ('type' in prop ? prop.type === 'date' : 'date' in prop) {
    const date = (prop as { date: { start: string } | null }).date;
    return date?.start ?? '';
  }
  return '';
}

export function readUrl(prop: PageProperty | undefined): string | null {
  if (!prop) return null;
  if ('type' in prop ? prop.type === 'url' : 'url' in prop) {
    return (prop as { url: string | null }).url ?? null;
  }
  return null;
}

/** UUID 32자 → 8-4-4-4-12 포매팅 (Notion 의 일부 path 가 dashed UUID 만 받음) */
export function formatUUID(id: string): string {
  if (id.length === 32) {
    return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
  }
  return id;
}

// ───────────────────────────────────────────────────────────────────────

const FIRST_BATCH_SIZE = 50;
const MAX_JSON_SIZE = 100_000;

export class NotionAuditWriter {
  constructor(
    private readonly notion: Client,
    private readonly databaseId: string,
  ) {}

  /**
   * 진단 결과를 Notion 데이터베이스에 저장. 반환값은 생성된 Notion page id.
   *
   * 저장 형태:
   *  - 본문: 요약 블록 + Impact 별 토글 + JSON code block(2000자/100rich_text 청킹)
   *  - 속성: Page URL / Date / Score / Violations / Report Link (+ optional)
   *  - 첫 호출은 children 50개로 잘라 보내고 나머지는 blocks.children.append(100/call)
   *
   * 청킹/축소 동작은 contract test 에 의해 회귀 보호된다.
   */
  async saveAuditResult(result: AuditResult, reportUrl?: string): Promise<string> {
    try {
      // 1) Impact 별로 violation 그룹핑
      const groupedViolations = (result.violations || []).reduce(
        (acc, v) => {
          const impact = v.impact || 'minor';
          if (!acc[impact]) acc[impact] = {};

          const key = `${v.kwcagId} ${v.kwcagName}`;
          if (!acc[impact][key]) {
            acc[impact][key] = {
              count: 0,
              description: v.description,
              pages: new Set<string>(),
            };
          }
          acc[impact][key].count++;
          acc[impact][key].pages.add(v.pageUrl);
          return acc;
        },
        {} as Record<
          string,
          Record<string, { count: number; description: string; pages: Set<string> }>
        >,
      );

      // 2) 요약 블록
      const children: NotionBlock[] = [
        buildHeading2('📊 진단 결과 요약'),
        buildBullet(`총 페이지 수: ${result.pages.length}개`),
        buildBullet(`발견된 총 위반: ${result.totalViolations}건`),
        buildBullet(`SEO 점수: ${result.seoResult?.score || 0}점`),
        buildHeading2('🚨 상세 위반 사항 (Impact별 정렬)'),
      ];

      // 3) Impact 별 토글
      const impactOrder = ['critical', 'serious', 'moderate', 'minor'];
      const impactLabels: Record<string, string> = {
        critical: '🔴 치명적 (Critical)',
        serious: '🟠 중요 (Serious)',
        moderate: '🟡 보통 (Moderate)',
        minor: '⚪ 낮음 (Minor)',
      };

      impactOrder.forEach((impact) => {
        const violations = groupedViolations[impact];
        if (violations && Object.keys(violations).length > 0) {
          const total = Object.values(violations).reduce((sum, v) => sum + v.count, 0);
          children.push(buildHeading3(`${impactLabels[impact]} - ${total}건`));

          Object.entries(violations).forEach(([title, data]) => {
            const toggleChildren: NotionBlock[] = [
              buildParagraph(`설명: ${data.description.substring(0, 100)}...`),
              buildParagraph(`발견된 페이지 (${data.pages.size}개):`),
              ...Array.from(data.pages)
                .slice(0, 5)
                .map((url) => buildBulletLink(url)),
            ];
            if (data.pages.size > 5) {
              toggleChildren.push(buildParagraph(`...외 ${data.pages.size - 5}개 페이지`));
            }
            children.push(buildToggle(`[${data.count}건] ${title}`, toggleChildren));
          });
        }
      });

      // 4) JSON 축소판 — description/help 등 매핑 복구 가능 필드 제외 + 100KB cap 까지 trim
      children.push(buildHeading2('💾 원본 데이터 (JSON 요약)'));

      const compactViolations = result.violations.map((v) => ({
        kwcagId: v.kwcagId,
        kwcagName: v.kwcagName,
        impact: v.impact,
        principle: v.principle,
        pageUrl: v.pageUrl,
        pageTitle: v.pageTitle,
        selector: v.selector,
        occurrenceCount: v.occurrenceCount,
        axeRuleId: v.axeRuleId,
        affectedCode: v.affectedCode ? v.affectedCode.substring(0, 300) : '',
        screenshotPath: v.screenshotPath,
        boundingBox: v.boundingBox,
      }));

      let violationsToSave = compactViolations;
      let jsonString: string;
      while (true) {
        const compactResult = {
          startTime: result.startTime,
          endTime: result.endTime,
          totalPages: result.totalPages,
          totalViolations: result.totalViolations,
          pages: result.pages,
          summary: result.summary,
          seoResult: result.seoResult
            ? { score: result.seoResult.score, url: result.seoResult.url }
            : undefined,
          violations: violationsToSave,
          _truncated:
            violationsToSave.length < compactViolations.length
              ? `${violationsToSave.length}/${compactViolations.length} violations shown`
              : undefined,
        };
        jsonString = JSON.stringify(compactResult, null, 2);
        if (jsonString.length <= MAX_JSON_SIZE || violationsToSave.length <= 10) break;
        violationsToSave = violationsToSave.slice(
          0,
          Math.max(10, Math.floor(violationsToSave.length * 0.8)),
        );
      }

      const richTextChunks = chunkRichText(jsonString);
      const codeBlocks = buildJsonCodeBlocks(richTextChunks);
      children.push(...codeBlocks);

      // 5) Notion DB 속성
      const properties: Record<string, unknown> = {
        'Page URL': {
          title: [{ text: { content: result.pages[0]?.url || 'Unknown URL' } }],
        },
        Date: { date: { start: new Date().toISOString() } },
        'Score (Total)': { number: result.seoResult?.score ?? 0 },
        Violations: { number: result.totalViolations ?? 0 },
        'Report Link': { url: reportUrl || null },
      };

      if (result.artifactName) {
        properties['Artifact Name'] = {
          rich_text: [{ text: { content: result.artifactName } }],
        };
      }
      if (result.screenshotUrl) {
        properties['Screenshot URL'] = { url: result.screenshotUrl };
      }

      // 6) 첫 호출은 50 블록까지, 나머지는 100/call append (413 회피)
      const response = await this.notion.pages.create({
        parent: { database_id: this.databaseId },
        properties: properties as Parameters<Client['pages']['create']>[0]['properties'],
        children: children.slice(0, FIRST_BATCH_SIZE) as Parameters<
          Client['pages']['create']
        >[0]['children'],
      });

      const pageId = response.id;

      if (children.length > FIRST_BATCH_SIZE) {
        const remaining = children.slice(FIRST_BATCH_SIZE);
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
    } catch (error) {
      console.error('Error saving to Notion:', error);
      throw error;
    }
  }

  /**
   * Notion 페이지 ID 로 진단 결과(JSON) 조회. JSON code block 들을 모두 모아
   * 재조립한 뒤 enrichViolation 으로 violation 축소판을 원본 형태로 복원.
   */
  async getAuditResult(pageId: string): Promise<AuditResult | null> {
    try {
      let jsonContent = '';
      let hasMore = true;
      let startCursor: string | undefined = undefined;

      while (hasMore) {
        const response = await this.notion.blocks.children.list({
          block_id: pageId,
          start_cursor: startCursor,
        });

        // 응답 results 는 union type — assembleJsonFromCodeBlocks 가 안전하게 좁힌다.
        jsonContent += assembleJsonFromCodeBlocks(
          response.results as unknown as NotionListBlock[],
        );

        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;
      }

      if (!jsonContent) {
        console.error('No JSON block found in Notion page:', pageId);
        return null;
      }

      try {
        const parsed = JSON.parse(jsonContent) as AuditResult;
        if (parsed.violations) {
          parsed.violations = parsed.violations.map((v) => enrichViolation(v));
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse reassembled JSON from Notion:', e);
        console.error('JSON content length:', jsonContent.length);
        return null;
      }
    } catch (error) {
      console.error('Error fetching from Notion:', error);
      return null;
    }
  }

  /**
   * 페이지 속성 업데이트 (예: Report Link 추가). 실패는 로깅 후 swallow.
   */
  async updatePageProperty(
    pageId: string,
    properties: Parameters<Client['pages']['update']>[0]['properties'],
  ): Promise<void> {
    try {
      await this.notion.pages.update({ page_id: pageId, properties });
    } catch (error) {
      console.error('Error updating Notion page:', error);
    }
  }

  /**
   * 진단 이력 리스트 (Deleted=false 만, Date 내림차순).
   */
  async getAuditHistory() {
    console.log('getAuditHistory - databaseId:', this.databaseId);
    console.log('Notion Client keys:', Object.keys(this.notion));

    const formattedDbId = formatUUID(this.databaseId);
    console.log('Formatted DB ID:', formattedDbId);

    try {
      // databases.query 가 일부 번들러/버전에서 누락되는 이슈가 있어 raw request 사용.
      const response = await this.notion.request<QueryDatabaseResponse>({
        path: `databases/${formattedDbId}/query`,
        method: 'post',
        body: {
          filter: { property: 'Deleted', checkbox: { equals: false } },
          sorts: [{ property: 'Date', direction: 'descending' }],
        },
      });

      if (!response || !response.results) {
        console.error('Invalid Notion response:', response);
        return [];
      }

      return response.results.filter(isFullPage).map((page) => {
        const props = page.properties;
        return {
          id: page.id,
          url: readTitleText(getProp(props, 'Page URL')),
          date: readDateStart(getProp(props, 'Date')),
          score: readNumber(getProp(props, 'Score (Total)')),
          violationCount: readNumber(getProp(props, 'Violations')),
          reportLink: readUrl(getProp(props, 'Report Link')),
          artifactName: readRichText(getProp(props, 'Artifact Name')),
          screenshotUrl: readUrl(getProp(props, 'Screenshot URL')),
        };
      });
    } catch (error) {
      console.error('Error fetching audit history:', error);
      return [];
    }
  }

  /**
   * Soft delete — Deleted=true 마킹.
   */
  async softDeletePage(pageId: string): Promise<boolean> {
    try {
      await this.notion.pages.update({
        page_id: pageId,
        properties: { Deleted: { checkbox: true } },
      });
      return true;
    } catch (error) {
      console.error('Error soft deleting page:', error);
      return false;
    }
  }
}
