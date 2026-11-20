import { NextResponse } from 'next/server';
import { getLLMModel, getOpenAI, readLLMConfig, withLLMConfig } from '@/lib/ai/openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 模型连通性自检：验证密钥 / Base URL / 模型名可用，且支持 JSON 结构化输出
export async function POST(req: Request) {
  const llm = readLLMConfig(req);
  if (!llm) {
    return NextResponse.json({ ok: false, error: '未配置模型：请填写模型名与（密钥或 Base URL）' });
  }
  const t0 = Date.now();
  try {
    const sample = await withLLMConfig(llm, async () => {
      const res = await getOpenAI().chat.completions.create({
        model: getLLMModel(),
        temperature: 0,
        max_tokens: 32,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你是连通性测试助手，只输出 JSON。' },
          { role: 'user', content: '仅返回 {"ok":true}' },
        ],
      });
      return res.choices[0]?.message?.content || '';
    });
    return NextResponse.json({
      ok: true,
      provider: llm.provider || '',
      model: llm.model,
      latencyMs: Date.now() - t0,
      sample: sample.slice(0, 120),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
