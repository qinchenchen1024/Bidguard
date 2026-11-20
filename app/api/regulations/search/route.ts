import { NextResponse } from 'next/server';
import { searchRegulationsAndCases } from '@/lib/ai/agents';
import { readLLMConfig, withLLMConfig } from '@/lib/ai/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// 法规 / 案例检索智能体
export async function POST(req: Request) {
  try {
    const llm = readLLMConfig(req);
    if (!llm) {
      return NextResponse.json(
        { error: '未配置大模型：请点击右上角「模型设置」填写 API Key / Base URL / 模型名（可选用本地 Ollama）。' },
        { status: 400 }
      );
    }
    const body = await req.json();
    const query = String(body?.query || '').trim();
    if (!query) return NextResponse.json({ error: '检索问题不能为空' }, { status: 400 });

    const result = await withLLMConfig(llm, () =>
      searchRegulationsAndCases(query, body?.context ? String(body.context) : undefined)
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
