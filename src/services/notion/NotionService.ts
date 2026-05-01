import { Client } from '@notionhq/client';
import { AuditResult } from '@/types';
import type {
  AltTextAuditResult,
  AltTextHistoryItem,
} from '@/types/alt-text';

export class NotionService {
  private notion: Client;
  private databaseId: string;

  constructor(apiKey: string, databaseId: string) {
    this.notion = new Client({ auth: apiKey });
    this.databaseId = databaseId;
  }

  /**
   * Notion 페이지 ID로 진단 결과(JSON)를 조회
   *
   * saveAuditResult는 JSON을 2000자 rich_text 청크로 분할하고,
   * 100개 rich_text 항목마다 별도의 Code Block으로 저장한다.
   * 따라서 이 메서드는 페이지 내 모든 JSON Code Block을 순서대로
   * 수집하여 하나의 문자열로 합친 뒤 파싱한다.
   */
  async getAuditResult(pageId: string): Promise<AuditResult | null> {
    try {
      let jsonContent = '';
      let hasMore = true;
      let startCursor: string | undefined = undefined;

      // 페이지의 모든 블록을 순회하며 JSON Code Block을 찾아 합침
      // (saveAuditResult가 여러 Code Block으로 분할 저장하므로 break 금지)
      while (hasMore) {
        const response = await this.notion.blocks.children.list({
          block_id: pageId,
          start_cursor: startCursor,
        });

        for (const block of response.results) {
          if ('type' in block && block.type === 'code' && block.code.language === 'json') {
            // 각 Code Block 내의 rich_text 항목들을 모두 합침 (2000자 청킹 대응)
            const chunk = block.code.rich_text.map((t: any) => t.plain_text).join('');
            jsonContent += chunk;
          }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;
      }

      if (!jsonContent) {
        console.error('No JSON block found in Notion page:', pageId);
        return null;
      }

      // JSON 파싱
      try {
        return JSON.parse(jsonContent);
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
   * 진단 결과를 Notion 데이터베이스에 저장
   */
  async saveAuditResult(result: AuditResult, reportUrl?: string) {
    try {
      // 1. 위반 사항을 Impact 별로 정렬 및 그룹화 (중복 제거)
      const groupedViolations = (result.violations || []).reduce((acc, v) => {
        const impact = v.impact || 'minor';
        if (!acc[impact]) acc[impact] = {};

        // KWCAG ID와 이름으로 유니크 키 생성
        const key = `${v.kwcagId} ${v.kwcagName}`;
        if (!acc[impact][key]) {
          acc[impact][key] = {
            count: 0,
            description: v.description,
            pages: new Set<string>()
          };
        }
        acc[impact][key].count++;
        acc[impact][key].pages.add(v.pageUrl);
        return acc;
      }, {} as Record<string, Record<string, { count: number; description: string; pages: Set<string> }>>);

      // Notion Block 생성
      const children: any[] = [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '📊 진단 결과 요약' } }] },
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `총 페이지 수: ${result.pages.length}개` } }] },
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `발견된 총 위반: ${result.totalViolations}건` } }] },
        },
        {
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: { rich_text: [{ text: { content: `SEO 점수: ${result.seoResult?.score || 0}점` } }] },
        },
        {
          object: 'block',
          type: 'heading_2',
          heading_2: { rich_text: [{ text: { content: '🚨 상세 위반 사항 (Impact별 정렬)' } }] },
        },
      ];

      // Impact 순서: Critical -> Serious -> Moderate -> Minor
      const impactOrder = ['critical', 'serious', 'moderate', 'minor'];
      const impactLabels: Record<string, string> = {
        critical: '🔴 치명적 (Critical)',
        serious: '🟠 중요 (Serious)',
        moderate: '🟡 보통 (Moderate)',
        minor: '⚪ 낮음 (Minor)'
      };

      impactOrder.forEach(impact => {
        const violations = groupedViolations[impact];
        if (violations && Object.keys(violations).length > 0) {
          // Impact Heading
          children.push({
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [{ text: { content: `${impactLabels[impact]} - ${Object.values(violations).reduce((sum, v) => sum + v.count, 0)}건` } }]
            },
          });

          // Violation Items
          Object.entries(violations).forEach(([title, data]) => {
            children.push({
              object: 'block',
              type: 'toggle',
              toggle: {
                rich_text: [{ text: { content: `[${data.count}건] ${title}` } }],
                children: [
                  {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ text: { content: `설명: ${data.description.substring(0, 100)}...` } }] }
                  },
                  {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ text: { content: `발견된 페이지 (${data.pages.size}개):` } }] }
                  },
                  ...Array.from(data.pages).slice(0, 5).map(url => ({
                    object: 'block',
                    type: 'bulleted_list_item',
                    bulleted_list_item: {
                      rich_text: [{
                        text: { content: url, link: { url: url } }
                      }]
                    }
                  })),
                  data.pages.size > 5 ? {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: { rich_text: [{ text: { content: `...외 ${data.pages.size - 5}개 페이지` } }] }
                  } : null
                ].filter(Boolean)
              }
            });
          });
        }
      });

      // JSON 데이터 — 요약 + 축소판만 저장 (413 PayloadTooLarge 방지)
      // 전체 JSON은 로컬 localStorage / 엑셀 다운로드로 보존
      children.push({
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '💾 원본 데이터 (JSON 요약)' } }] },
      });

      // violations에서 screenshot/html 등 대용량 필드를 제거한 축소판
      // violations 수를 줄여가며 항상 유효한 JSON이 되도록 보장
      const MAX_JSON_SIZE = 78000;
      const compactViolations = result.violations.map(v => ({
        kwcagId: v.kwcagId,
        kwcagName: v.kwcagName,
        impact: v.impact,
        principle: v.principle,
        pageUrl: v.pageUrl,
        selector: v.selector,
        occurrenceCount: v.occurrenceCount,
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
          seoResult: result.seoResult ? { score: result.seoResult.score, url: result.seoResult.url } : undefined,
          violations: violationsToSave,
          _truncated: violationsToSave.length < compactViolations.length
            ? `${violationsToSave.length}/${compactViolations.length} violations shown`
            : undefined,
        };
        jsonString = JSON.stringify(compactResult, null, 2);
        if (jsonString.length <= MAX_JSON_SIZE || violationsToSave.length <= 10) break;
        // 20%씩 줄이기
        violationsToSave = violationsToSave.slice(0, Math.max(10, Math.floor(violationsToSave.length * 0.8)));
      }
      const jsonChunks = this.createRichTextChunks(jsonString!);

      const richTextLimit = 100;
      for (let i = 0; i < jsonChunks.length; i += richTextLimit) {
        const chunkBatch = jsonChunks.slice(i, i + richTextLimit);
        children.push({
          object: 'block',
          type: 'code',
          code: {
            language: 'json',
            rich_text: chunkBatch,
            caption: i > 0 ? [{ text: { content: `(Part ${Math.floor(i / richTextLimit) + 1})` } }] : [],
          },
        });
      }

      // 필수 속성만 포함 (DB에 반드시 있어야 하는 속성)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const properties: Record<string, any> = {
        'Page URL': {
          title: [{ text: { content: result.pages[0]?.url || 'Unknown URL' } }],
        },
        'Date': {
          date: { start: new Date().toISOString() },
        },
        'Score (Total)': {
          number: result.seoResult?.score ?? 0,
        },
        'Violations': {
          number: result.totalViolations ?? 0,
        },
        'Report Link': {
          url: reportUrl || null,
        },
      };

      // 선택적 속성 (데이터가 있을 때만 포함, DB에 해당 속성이 없어도 에러 없음)
      if (result.artifactName) {
        properties['Artifact Name'] = {
          rich_text: [{ text: { content: result.artifactName } }],
        };
      }
      if (result.screenshotUrl) {
        properties['Screenshot URL'] = { url: result.screenshotUrl };
      }

      // 첫 호출은 속성 + 최대 50블록만 (413 PayloadTooLarge 방지)
      const firstBatchSize = 50;
      const response = await this.notion.pages.create({
        parent: { database_id: this.databaseId },
        properties,
        children: children.slice(0, firstBatchSize),
      });

      const pageId = response.id;

      // 나머지 블록 추가 저장 (Chunking)
      if (children.length > firstBatchSize) {
        const remainingBlocks = children.slice(firstBatchSize);
        const chunkSize = 100;
        for (let i = 0; i < remainingBlocks.length; i += chunkSize) {
          const chunk = remainingBlocks.slice(i, i + chunkSize);
          await this.notion.blocks.children.append({
            block_id: pageId,
            children: chunk,
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
   * 페이지 속성 업데이트 (예: Report Link 추가)
   */
  async updatePageProperty(pageId: string, properties: any) {
    try {
      await this.notion.pages.update({
        page_id: pageId,
        properties: properties,
      });
    } catch (error) {
      console.error('Error updating Notion page:', error);
      // 업데이트 실패는 전체 실패로 간주하지 않음 (로깅만)
    }
  }

  /**
   * Notion Rich Text 제한(2000자) 처리 헬퍼
   */
  private createRichTextChunks(content: string): any[] {
    const output = [];
    const maxLength = 2000;

    let i = 0;
    while (i < content.length) {
      let end = i + maxLength;
      if (end < content.length) {
        // High surrogate ranges from \uD800 to \uDBFF
        const lastCharCode = content.charCodeAt(end - 1);
        if (lastCharCode >= 0xD800 && lastCharCode <= 0xDBFF) {
          end -= 1;
        }
      }
      output.push({
        text: {
          content: content.substring(i, end)
        }
      });
      i = end;
    }
    return output;
  }

  /**
   * 히스토리 목록 조회 (Deleted=false 인 항목만)
   */
  /**
   * 히스토리 목록 조회 (Deleted=false 인 항목만)
   */
  async getAuditHistory() {
    console.log('getAuditHistory - databaseId:', this.databaseId);
    console.log('Notion Client keys:', Object.keys(this.notion));

    // UUID Format Helper
    const formatUUID = (id: string) => {
      if (id.length === 32) {
        return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
      }
      return id;
    };

    const formattedDbId = formatUUID(this.databaseId);
    console.log('Formatted DB ID:', formattedDbId);

    try {
      /* 
         Fallback: Using 'request' method explicitly.
         'databases.query' might be missing at runtime due to bundling/version issues.
      */
      const response = await this.notion.request({
        path: `databases/${formattedDbId}/query`,
        method: 'post',
        body: {
          filter: {
            property: 'Deleted',
            checkbox: {
              equals: false,
            },
          },
          sorts: [
            {
              property: 'Date',
              direction: 'descending',
            },
          ],
        },
      }) as any;

      if (!response || !response.results) {
        console.error('Invalid Notion response:', response);
        return [];
      }

      return response.results.map((page: any) => {
        const props = page.properties;
        return {
          id: page.id,
          url: props['Page URL']?.title[0]?.plain_text || '',
          date: props['Date']?.date?.start || '',
          score: props['Score (Total)']?.number || 0,
          violationCount: props['Violations']?.number || 0,
          reportLink: props['Report Link']?.url || null,
          artifactName: props['Artifact Name']?.rich_text?.[0]?.plain_text || null,
          screenshotUrl: props['Screenshot URL']?.url || null,
        };
      });
    } catch (error) {
      console.error('Error fetching audit history:', error);
      return [];
    }
  }

  /**
   * 페이지 Soft Delete (Deleted=true 업데이트)
   */
  async softDeletePage(pageId: string) {
    try {
      await this.notion.pages.update({
        page_id: pageId,
        properties: {
          'Deleted': {
            checkbox: true,
          },
        },
      });
      return true;
    } catch (error) {
      console.error('Error soft deleting page:', error);
      return false;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 이미지 진단(alt-text) 전용 — 별도 Notion DB(NOTION_ALTTEXT_DATABASE_ID) 대상
  // ───────────────────────────────────────────────────────────────────────

  /**
   * 이미지 진단 결과를 Notion 데이터베이스에 저장
   */
  async saveAltTextAuditResult(result: AltTextAuditResult, reportUrl?: string): Promise<string> {
    const counts = result.countsByJudgment;
    const titleText = result.targetUrls.length === 1
      ? result.targetUrls[0]
      : `이미지 진단 - URL ${result.targetUrls.length}개`;

    // 본문 블록 구성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '🖼️ 이미지 진단 요약' } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `대상 URL: ${result.totalUrls}개` } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `OCR 실행 이미지: ${result.totalImagesScanned}장` } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `불일치(pass 제외): ${result.totalMismatches}건` } }] },
      },
      {
        object: 'block',
        type: 'heading_3',
        heading_3: { rich_text: [{ text: { content: '판정별 카운트' } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `✅ pass: ${counts.pass ?? 0}` } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `🔴 missing_alt: ${counts.missing_alt ?? 0}` } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `🟠 decorative_mismatch: ${counts.decorative_mismatch ?? 0}` } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `🟠 text_mismatch: ${counts.text_mismatch ?? 0}` } }] },
      },
      {
        object: 'block',
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: [{ text: { content: `🟡 review_needed: ${counts.review_needed ?? 0}` } }] },
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: { rich_text: [{ text: { content: '🚨 페이지별 상세' } }] },
      },
    ];

    // 페이지별 toggle 블록 — pass 제외 항목만 표시
    for (const scan of result.scans) {
      const mismatches = scan.items.filter(i => i.judgment !== 'pass');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const detailChildren: any[] = mismatches.length === 0
        ? [{
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: '불일치 없음 (모든 이미지 pass)' } }] },
          }]
        : mismatches.slice(0, 50).map(item => ({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                text: {
                  content: `[${item.judgment}] alt="${item.currentAlt ?? '(없음)'}" / OCR="${item.extractedText.substring(0, 80)}" / ${item.reason}`,
                },
              }],
            },
          }));

      children.push({
        object: 'block',
        type: 'toggle',
        toggle: {
          rich_text: [{ text: { content: `[${mismatches.length}건] ${scan.pageUrl}` } }],
          children: detailChildren,
        },
      });
    }

    // 원본 JSON
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: { rich_text: [{ text: { content: '💾 원본 데이터 (JSON)' } }] },
    });
    const jsonString = JSON.stringify(result, null, 2);
    const jsonChunks = this.createRichTextChunks(jsonString);
    const richTextLimit = 100;
    for (let i = 0; i < jsonChunks.length; i += richTextLimit) {
      const chunkBatch = jsonChunks.slice(i, i + richTextLimit);
      children.push({
        object: 'block',
        type: 'code',
        code: {
          language: 'json',
          rich_text: chunkBatch,
          caption: i > 0 ? [{ text: { content: `(Part ${Math.floor(i / richTextLimit) + 1})` } }] : [],
        },
      });
    }

    // DB 속성
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const properties: Record<string, any> = {
      'Page URL': {
        title: [{ text: { content: titleText } }],
      },
      'Date': {
        date: { start: result.endTime || new Date().toISOString() },
      },
      'Total URLs': { number: result.totalUrls },
      'Total Images': { number: result.totalImagesScanned },
      'Mismatches': { number: result.totalMismatches },
      'Pass': { number: counts.pass ?? 0 },
      'Missing Alt': { number: counts.missing_alt ?? 0 },
      'Decorative Mismatch': { number: counts.decorative_mismatch ?? 0 },
      'Text Mismatch': { number: counts.text_mismatch ?? 0 },
      'Review Needed': { number: counts.review_needed ?? 0 },
      'Report Link': { url: reportUrl || null },
    };

    if (result.inspector) {
      properties['Inspector'] = {
        rich_text: [{ text: { content: result.inspector } }],
      };
    }

    const response = await this.notion.pages.create({
      parent: { database_id: this.databaseId },
      properties,
      children: children.slice(0, 100),
    });
    const pageId = response.id;

    // 100개 초과 블록은 추가 append
    if (children.length > 100) {
      const remainingBlocks = children.slice(100);
      const chunkSize = 100;
      for (let i = 0; i < remainingBlocks.length; i += chunkSize) {
        const chunk = remainingBlocks.slice(i, i + chunkSize);
        await this.notion.blocks.children.append({
          block_id: pageId,
          children: chunk,
        });
      }
    }

    return pageId;
  }

  /**
   * 이미지 진단 결과 단건 조회 — JSON code block 재조립 후 파싱
   */
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

        for (const block of response.results) {
          if ('type' in block && block.type === 'code' && block.code.language === 'json') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chunk = block.code.rich_text.map((t: any) => t.plain_text).join('');
            jsonContent += chunk;
          }
        }

        hasMore = response.has_more;
        startCursor = response.next_cursor || undefined;
      }

      if (!jsonContent) {
        console.error('No JSON block found in Notion alt-text page:', pageId);
        return null;
      }

      try {
        return JSON.parse(jsonContent);
      } catch (e) {
        console.error('Failed to parse alt-text JSON from Notion:', e);
        return null;
      }
    } catch (error) {
      console.error('Error fetching alt-text result from Notion:', error);
      return null;
    }
  }

  /**
   * 이미지 진단 이력 리스트 (Deleted=false)
   */
  async getAltTextHistory(): Promise<AltTextHistoryItem[]> {
    const formatUUID = (id: string) => {
      if (id.length === 32) {
        return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
      }
      return id;
    };
    const formattedDbId = formatUUID(this.databaseId);

    try {
      const response = await this.notion.request({
        path: `databases/${formattedDbId}/query`,
        method: 'post',
        body: {
          filter: {
            property: 'Deleted',
            checkbox: { equals: false },
          },
          sorts: [
            { property: 'Date', direction: 'descending' },
          ],
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any;

      if (!response || !response.results) {
        console.error('Invalid Notion response (alt-text history):', response);
        return [];
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return response.results.map((page: any): AltTextHistoryItem => {
        const props = page.properties;
        return {
          id: page.id,
          title: props['Page URL']?.title?.[0]?.plain_text || '',
          date: props['Date']?.date?.start || '',
          totalUrls: props['Total URLs']?.number ?? 0,
          totalImages: props['Total Images']?.number ?? 0,
          mismatches: props['Mismatches']?.number ?? 0,
          inspector: props['Inspector']?.rich_text?.[0]?.plain_text || null,
          reportLink: props['Report Link']?.url || null,
        };
      });
    } catch (error) {
      console.error('Error fetching alt-text history:', error);
      return [];
    }
  }
}
