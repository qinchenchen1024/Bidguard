import { NextResponse } from 'next/server';
import { readLLMConfig } from '@/lib/ai/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 查询服务端是否已预置默认模型（用于前端决定是否需要弹出配置引导）
export async function GET(req: Request) {
  const cfg = readLLMConfig(req);
  return NextResponse.json({
    serverConfigured: Boolean(cfg),
    provider: cfg?.provider || null,
    model: cfg?.model || null,
  });
}
