import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 获取某次校验任务的详情与全部发现
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getServiceSupabase();
    const [runRes, findingsRes] = await Promise.all([
      supabase.from('check_runs').select('*').eq('id', params.id).single(),
      supabase
        .from('findings')
        .select('*')
        .eq('run_id', params.id)
        .order('severity', { ascending: true })
        .order('created_at', { ascending: true }),
    ]);
    if (runRes.error) throw new Error(runRes.error.message);
    return NextResponse.json({ run: runRes.data, findings: findingsRes.data || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
