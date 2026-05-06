import { NotionService } from './NotionService';
import { Client } from '@notionhq/client';
import { AuditResult } from '@/types';
import { KWCAG_MAPPING } from '@/lib/kwcag-mapping';

// Mock Client
jest.mock('@notionhq/client');

describe('NotionService', () => {
  let notionService: NotionService;
  let mockNotionClient: any;

  // enrichViolation 이 backfill 하는 기본 필드 — 라운드트립 toEqual 일치를 위해 fixture 도 동일하게 채운다.
  const kwcagItem111 = KWCAG_MAPPING.find(item => item.id === '1.1.1');

  const mockAuditResult: AuditResult = {
    startTime: '2024-01-01',
    endTime: '2024-01-01',
    totalPages: 1,
    totalViolations: 150, // Force many violations to create > 100 blocks
    pages: [{ url: 'http://example.com' } as any], // Cast to any to avoid exhaustive mock
    violations: Array(150).fill(null).map((_, i) => ({
      id: `v-${i}`,
      impact: 'critical',
      kwcagId: '1.1.1',
      kwcagName: `Violation ${i}`,
      description: `Desc ${i}`,
      pageUrl: 'http://example.com',
      help: kwcagItem111?.help || '',
      principle: kwcagItem111?.principle || '',
      pageTitle: '',
      affectedCode: '',
      axeRuleId: '',
      helpUrl: '',
      depth1: '',
      depth2: '',
      depth3: '',
      depth4: '',
      platform: 'PC',
      inspector: '시스템',
      inspectionDate: '',
      violationNumber: 0,
    } as any)),
    summary: { byPrinciple: {}, byImpact: {}, byKwcagItem: {} }
  };

  beforeEach(() => {
    mockNotionClient = {
      pages: { create: jest.fn().mockResolvedValue({ id: 'page-id' }), update: jest.fn() },
      blocks: { children: { list: jest.fn(), append: jest.fn().mockResolvedValue({}) } },
      databases: { query: jest.fn() }
    };
    (Client as unknown as jest.Mock).mockImplementation(() => mockNotionClient);
    notionService = new NotionService('fake-key', 'fake-db');
  });

  describe('saveAuditResult (Chunking)', () => {
    it('should split blocks into chunks if they exceed 100', async () => {
      // Mock create response
      mockNotionClient.pages.create.mockResolvedValue({ id: 'new-page-id' });

      // Run save
      await notionService.saveAuditResult(mockAuditResult);

      // Verify create was called with <= 100 blocks
      expect(mockNotionClient.pages.create).toHaveBeenCalled();
      const createArgs = mockNotionClient.pages.create.mock.calls[0][0];
      expect(createArgs.children.length).toBeLessThanOrEqual(100);

      // Verify append was called for remaining blocks
      expect(mockNotionClient.blocks.children.append).toHaveBeenCalled();
      const appendArgs = mockNotionClient.blocks.children.append.mock.calls[0][0];
      expect(appendArgs.block_id).toBe('new-page-id');
      expect(appendArgs.children.length).toBeGreaterThan(0);
    });

    it('should split large JSON content into multiple rich_text objects', async () => {
      // Create a large result
      const largeResult = { ...mockAuditResult, violations: Array(500).fill(mockAuditResult.violations[0]) };
      mockNotionClient.pages.create.mockResolvedValue({ id: 'page-id' });

      await notionService.saveAuditResult(largeResult);

      // Collect all children blocks sent to Notion
      const sentBlocks: any[] = [];

      // From pages.create
      if (mockNotionClient.pages.create.mock.calls.length > 0) {
        sentBlocks.push(...mockNotionClient.pages.create.mock.calls[0][0].children);
      }

      // From blocks.children.append
      mockNotionClient.blocks.children.append.mock.calls.forEach((call: any[]) => {
        sentBlocks.push(...call[0].children);
      });

      // Find the code block
      const codeBlock = sentBlocks.find((b: any) => b.type === 'code');

      expect(codeBlock).toBeDefined();

      // Verify parsing and splitting logic
      const richTexts = codeBlock.code.rich_text;
      const fullText = richTexts.map((t: any) => t.text.content).join('');

      // It should be roughly valid JSON (length might vary due to formatting)
      expect(fullText.length).toBeGreaterThan(2000);

      // If length > 2000, it MUST be split into multiple rich_text objects
      if (fullText.length > 2000) {
        expect(richTexts.length).toBeGreaterThan(1);
      }
    });

    it('should split into multiple code blocks if rich_text items exceed 100', async () => {
      // Mock a huge result that generates > 100 chunks ( > 200,000 chars)
      const hugeResult = { ...mockAuditResult, violations: [] };
      // Force JSON.stringify to return hugeString by mocking it or just passing a specific object if I mocked createRichTextChunks logic, 
      // but simpler to just trust the logic flows.
      // Instead, I will spy on the private method or just rely on the output check.

      // Let's actually override the JSON.stringify behavior or just create a huge object.
      // A huge object is expensive in test.
      // Let's just create an object that we know creates a large string stringify.
      // Use a custom toJSON? No.

      // Actually, createRichTextChunks is private.
      // Let's mock the internal implementation details or just pass a very large description.
      const largeDescription = 'a'.repeat(202000);
      hugeResult.summary = { huge: largeDescription } as any;

      mockNotionClient.pages.create.mockResolvedValue({ id: 'page-id' });

      await notionService.saveAuditResult(hugeResult);

      const sentBlocks: any[] = [];
      if (mockNotionClient.pages.create.mock.calls.length > 0) {
        sentBlocks.push(...mockNotionClient.pages.create.mock.calls[0][0].children);
      }
      mockNotionClient.blocks.children.append.mock.calls.forEach((call: any[]) => {
        sentBlocks.push(...call[0].children);
      });

      // Find all code blocks
      const codeBlocks = sentBlocks.filter((b: any) => b.type === 'code');

      // Should be at least 2 code blocks
      expect(codeBlocks.length).toBeGreaterThanOrEqual(2);

      // Each code block should have <= 100 rich_text items
      codeBlocks.forEach((block: any) => {
        expect(block.code.rich_text.length).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('getAuditResult (Pagination)', () => {
    it('should paginate until JSON block is found', async () => {
      // Mock list response with pagination
      mockNotionClient.blocks.children.list
        .mockResolvedValueOnce({
          results: [{ type: 'paragraph' }],
          has_more: true,
          next_cursor: 'cursor-1'
        })
        .mockResolvedValueOnce({
          results: [{
            type: 'code',
            code: { language: 'json', rich_text: [{ plain_text: JSON.stringify(mockAuditResult) }] }
          }],
          has_more: false
        });

      const result = await notionService.getAuditResult('page-id');

      // Verify pagination
      expect(mockNotionClient.blocks.children.list).toHaveBeenCalledTimes(2);
      expect(mockNotionClient.blocks.children.list).toHaveBeenNthCalledWith(2, {
        block_id: 'page-id',
        start_cursor: 'cursor-1'
      });

      // Verify result parsing
      expect(result).not.toBeNull();
      expect(result?.totalViolations).toBe(150);
    });

    it('should assemble JSON from multiple code blocks', async () => {
      // Mock list response with multiple code blocks
      const part1 = JSON.stringify(mockAuditResult).substring(0, 10);
      const part2 = JSON.stringify(mockAuditResult).substring(10);

      mockNotionClient.blocks.children.list.mockResolvedValue({
        results: [
          {
            type: 'code',
            code: { language: 'json', rich_text: [{ plain_text: part1 }] }
          },
          {
            type: 'code',
            code: { language: 'json', rich_text: [{ plain_text: part2 }] }
          }
        ],
        has_more: false
      });

      const result = await notionService.getAuditResult('page-id');

      // Should correctly parse the full JSON
      expect(result).toEqual(mockAuditResult);
    });

    it('should assemble JSON from code blocks split across paginated responses', async () => {
      // This reproduces the real-world scenario: saveAuditResult creates multiple
      // code blocks (due to 100 rich_text limit), and those blocks may span across
      // different paginated API responses.
      const fullJson = JSON.stringify(mockAuditResult);
      const splitPoint = Math.floor(fullJson.length / 3);
      const part1 = fullJson.substring(0, splitPoint);
      const part2 = fullJson.substring(splitPoint, splitPoint * 2);
      const part3 = fullJson.substring(splitPoint * 2);

      mockNotionClient.blocks.children.list
        .mockResolvedValueOnce({
          results: [
            { type: 'heading_2', heading_2: { rich_text: [{ plain_text: 'Summary' }] } },
            {
              type: 'code',
              code: { language: 'json', rich_text: [{ plain_text: part1 }] }
            }
          ],
          has_more: true,
          next_cursor: 'cursor-1'
        })
        .mockResolvedValueOnce({
          results: [
            {
              type: 'code',
              code: { language: 'json', rich_text: [{ plain_text: part2 }] }
            }
          ],
          has_more: true,
          next_cursor: 'cursor-2'
        })
        .mockResolvedValueOnce({
          results: [
            {
              type: 'code',
              code: { language: 'json', rich_text: [{ plain_text: part3 }] }
            }
          ],
          has_more: false
        });

      const result = await notionService.getAuditResult('page-id');

      expect(mockNotionClient.blocks.children.list).toHaveBeenCalledTimes(3);
      expect(result).not.toBeNull();
      expect(result).toEqual(mockAuditResult);
    });

    it('should handle code blocks with multiple rich_text items (2000-char chunking)', async () => {
      // saveAuditResult splits JSON into 2000-char rich_text chunks.
      // A single code block can have up to 100 rich_text items.
      const fullJson = JSON.stringify(mockAuditResult);
      const chunkSize = 2000;
      const richTextChunks = [];
      for (let i = 0; i < fullJson.length; i += chunkSize) {
        richTextChunks.push({ plain_text: fullJson.substring(i, i + chunkSize) });
      }

      mockNotionClient.blocks.children.list.mockResolvedValue({
        results: [
          {
            type: 'code',
            code: { language: 'json', rich_text: richTextChunks }
          }
        ],
        has_more: false
      });

      const result = await notionService.getAuditResult('page-id');

      expect(result).not.toBeNull();
      expect(result).toEqual(mockAuditResult);
    });

    it('should ignore non-JSON code blocks interspersed between JSON blocks', async () => {
      const fullJson = JSON.stringify(mockAuditResult);
      const splitPoint = Math.floor(fullJson.length / 2);
      const part1 = fullJson.substring(0, splitPoint);
      const part2 = fullJson.substring(splitPoint);

      mockNotionClient.blocks.children.list.mockResolvedValue({
        results: [
          {
            type: 'code',
            code: { language: 'json', rich_text: [{ plain_text: part1 }] }
          },
          {
            // This JavaScript code block should be ignored
            type: 'code',
            code: { language: 'javascript', rich_text: [{ plain_text: 'console.log("not json");' }] }
          },
          {
            type: 'code',
            code: { language: 'json', rich_text: [{ plain_text: part2 }] }
          }
        ],
        has_more: false
      });

      const result = await notionService.getAuditResult('page-id');

      // Should only collect JSON code blocks, ignoring the JavaScript block
      expect(result).toEqual(mockAuditResult);
    });

    it('should return null when no JSON code blocks exist', async () => {
      mockNotionClient.blocks.children.list.mockResolvedValue({
        results: [
          { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'No JSON here' }] } },
          {
            type: 'code',
            code: { language: 'javascript', rich_text: [{ plain_text: 'const x = 1;' }] }
          }
        ],
        has_more: false
      });

      const result = await notionService.getAuditResult('page-id');

      expect(result).toBeNull();
    });

    it('should return null when JSON is malformed even after reassembly', async () => {
      mockNotionClient.blocks.children.list.mockResolvedValue({
        results: [
          {
            type: 'code',
            code: { language: 'json', rich_text: [{ plain_text: '{"broken": ' }] }
          }
        ],
        has_more: false
      });

      const result = await notionService.getAuditResult('page-id');

      expect(result).toBeNull();
    });
  });

  describe('getAuditHistory', () => {
    it('should query database with Deleted=false filter and sort by Date', async () => {
      // The actual implementation uses this.notion.request() instead of databases.query
      mockNotionClient.request = jest.fn().mockResolvedValue({
        results: [
          {
            id: 'page-1',
            properties: {
              'Page URL': { title: [{ plain_text: 'http://test.com' }] },
              'Date': { date: { start: '2024-01-01' } },
              'Score (Total)': { number: 90 },
              'Violations': { number: 5 },
              'Report Link': { url: 'http://link' }
            }
          }
        ]
      });

      const history = await notionService.getAuditHistory();

      expect(mockNotionClient.request).toHaveBeenCalledWith({
        path: `databases/fake-db/query`,
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
      });

      expect(history).toHaveLength(1);
      expect(history[0].id).toBe('page-1');
      expect(history[0].url).toBe('http://test.com');
    });
  });

  describe('softDeletePage', () => {
    it('should update page property Deleted to true', async () => {
      mockNotionClient.pages.update.mockResolvedValue({});

      await notionService.softDeletePage('page-id');

      expect(mockNotionClient.pages.update).toHaveBeenCalledWith({
        page_id: 'page-id',
        properties: {
          'Deleted': {
            checkbox: true,
          },
        },
      });
    });
  });
});
