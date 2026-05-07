import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

const ENV_LOCAL_PATH = path.resolve(process.cwd(), '.env.local');

/**
 * .env.local 파일을 읽어 key=value 쌍으로 파싱한다.
 * 파일이 없으면 빈 맵을 반환한다.
 */
function readEnvLocal(): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(ENV_LOCAL_PATH)) return map;

  const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    map.set(key, value);
  }
  return map;
}

/**
 * key=value 맵을 .env.local 파일로 직렬화한다.
 */
function writeEnvLocal(map: Map<string, string>): void {
  const lines: string[] = [];
  for (const [key, value] of map) {
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(ENV_LOCAL_PATH, lines.join('\n') + '\n', 'utf-8');
}

/**
 * API 키를 마스킹한다: "sk-ant-api03-xxxx...yyyy" -> "sk-ant-...yyyy"
 */
function maskKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  return NextResponse.json({
    hasKey: !!apiKey,
    masked: apiKey ? maskKey(apiKey) : null,
  });
}

export async function POST(request: NextRequest) {
  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const apiKey = body.apiKey ?? '';

  const envMap = readEnvLocal();

  if (apiKey) {
    envMap.set('ANTHROPIC_API_KEY', apiKey);
    // 런타임에도 즉시 반영 (서버 재시작 불필요)
    process.env.ANTHROPIC_API_KEY = apiKey;
  } else {
    envMap.delete('ANTHROPIC_API_KEY');
    delete process.env.ANTHROPIC_API_KEY;
  }

  writeEnvLocal(envMap);

  return NextResponse.json({
    success: true,
    hasKey: !!apiKey,
    masked: apiKey ? maskKey(apiKey) : null,
  });
}

export async function DELETE() {
  const envMap = readEnvLocal();
  envMap.delete('ANTHROPIC_API_KEY');
  writeEnvLocal(envMap);

  delete process.env.ANTHROPIC_API_KEY;

  return NextResponse.json({ success: true, hasKey: false });
}
