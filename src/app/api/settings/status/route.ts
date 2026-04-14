import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    notion: {
      configured: !!(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID),
    },
    github: {
      configured: !!(process.env.GITHUB_API_TOKEN),
    },
  });
}
