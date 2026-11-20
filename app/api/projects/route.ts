import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 获取项目列表
export async function GET() {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return NextResponse.json({ projects: data || [] });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

// 新建项目
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name || '').trim();
    if (!name) return NextResponse.json({ error: '项目名称不能为空' }, { status: 400 });

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('projects')
      .insert({
        name,
        description: body?.description ? String(body.description) : null,
        tenderer: body?.tenderer ? String(body.tenderer) : null,
        project_no: body?.project_no ? String(body.project_no) : null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ project: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
