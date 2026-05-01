const { Client } = require('@notionhq/client');
const fs = require('fs');
require('dotenv').config({ path: '.env' });

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const dbId = process.env.NOTION_DATABASE_ID;
const jsonPath = '/Users/codetree/Downloads/01_work/00_etribe/배달의민족/배민아카데미/kwcag-audit-2026-05-01.json';

function safeSubstring(str, start, maxLength) {
  let end = start + maxLength;
  if (end >= str.length) return str.substring(start);
  
  // Check if we are splitting a surrogate pair
  // A high surrogate is \uD800-\uDBFF
  // A low surrogate is \uDC00-\uDFFF
  const lastCharCode = str.charCodeAt(end - 1);
  if (lastCharCode >= 0xD800 && lastCharCode <= 0xDBFF) {
    end -= 1;
  }
  return str.substring(start, end);
}

function createRichTextChunks(content) {
  const output = [];
  const maxLength = 2000;
  let i = 0;
  while (i < content.length) {
    const chunkStr = safeSubstring(content, i, maxLength);
    output.push({ text: { content: chunkStr } });
    i += chunkStr.length;
  }
  return output;
}

async function run() {
  console.log('Fetching latest page...');
  const res = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: 'Date', direction: 'descending' }]
  });
  const latestPage = res.results[0];
  const pageId = latestPage.id;
  console.log('Latest Page ID:', pageId);

  // 1. Fetch blocks
  let hasMore = true;
  let startCursor = undefined;
  const blocksToDelete = [];
  while (hasMore) {
    const blocksRes = await notion.blocks.children.list({ block_id: pageId, start_cursor: startCursor });
    for (const block of blocksRes.results) {
      if (block.type === 'code' && block.code.language === 'json') {
        blocksToDelete.push(block.id);
      }
    }
    hasMore = blocksRes.has_more;
    startCursor = blocksRes.next_cursor;
  }
  console.log(`Deleting ${blocksToDelete.length} existing JSON code blocks...`);
  for (const bid of blocksToDelete) {
    await notion.blocks.delete({ block_id: bid });
  }

  console.log('Reading JSON...');
  const rawData = fs.readFileSync(jsonPath, 'utf8');
  console.log('JSON length:', rawData.length);
  
  const jsonChunks = createRichTextChunks(rawData);
  console.log('Total rich text chunks:', jsonChunks.length);
  
  const codeBlocks = [];
  const richTextLimit = 100;
  for (let i = 0; i < jsonChunks.length; i += richTextLimit) {
    const chunkBatch = jsonChunks.slice(i, i + richTextLimit);
    codeBlocks.push({
      object: 'block',
      type: 'code',
      code: {
        language: 'json',
        rich_text: chunkBatch,
        caption: i > 0 ? [{ text: { content: `(Part ${Math.floor(i / richTextLimit) + 1})` } }] : [],
      },
    });
  }

  console.log(`Appending ${codeBlocks.length} code blocks...`);
  // Append 1 by 1 to avoid PayloadTooLarge
  for (const block of codeBlocks) {
    try {
      await notion.blocks.children.append({
        block_id: pageId,
        children: [block],
      });
      console.log('Appended block successfully');
    } catch (e) {
      console.error('Failed to append block:', e.message);
    }
  }
  console.log('Done!');
}
run();
