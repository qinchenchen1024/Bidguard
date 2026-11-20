import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 获取项目详情（含文档、校验任务）
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getServiceSupabase();
    const { id } = params;

    const [projectRes, docsRes, runsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase
        .from('documents')
        .select('id, project_id, role, bidder_name, filename, mime_type, size_bytes, meta, created_at')
        .eq('project_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('check_runs')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
    ]);

    if (projectRes.error) throw new Error(projectRes.error.message);
    return NextResponse.json({
      project: projectRes.data,
      documents: docsRes.data || [],
      runs: runsRes.data || [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 删除项目
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = getServiceSupabase();
    const { error } = await supabase.from('projects').delete().eq('id', params.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
