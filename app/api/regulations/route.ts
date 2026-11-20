import { NextResponse } from 'next/server';
import { listKnowledge } from '@/lib/knowledge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 法规 / 案例知识库（智能体自学习成果）查询
export async function GET() {
  try {
    const items = await listKnowledge(100);
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
