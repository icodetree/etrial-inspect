const { Client } = require('@notionhq/client');
require('dotenv').config({ path: '.env' });
const notion = new Client({ auth: process.env.NOTION_API_KEY });
async function run() {
  const dbId = process.env.NOTION_DATABASE_ID;
  const res = await notion.databases.query({
    database_id: dbId,
    sorts: [{ property: 'Date', direction: 'descending' }]
  });
  console.log(res.results.slice(0, 3).map(p => ({id: p.id, url: p.properties['Page URL'].title[0].plain_text})));
}
run();
