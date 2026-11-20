import { NextResponse } from 'next/server';
import { runCheck } from '@/lib/checks/engine';
import { readLLMConfig, withLLMConfig } from '@/lib/ai/openai';
import type { CheckKind } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const KINDS: CheckKind[] = [
  'tender_completeness',
  'tender_compliance',
  'bid_responsiveness',
  'bid_similarity',
  'bid_collusion',
];

// 触发一次校验
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    const kind = body?.kind as CheckKind;
    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: `kind 必须为 ${KINDS.join(' / ')}` }, { status: 400 });
    }
    const run = await withLLMConfig(readLLMConfig(req), () => runCheck(params.id, kind));
    return NextResponse.json({ run }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
