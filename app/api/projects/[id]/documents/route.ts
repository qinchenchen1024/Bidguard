import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { extractDocument } from '@/lib/parsers/extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 单文件上限（MB），可通过 MAX_UPLOAD_MB 覆盖，默认 200MB
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 200);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

// 上传文档：解析文本 + 提取元数据 + 入库（不归档原文件，避免 Supabase Storage 单文件 50MB 限制）
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
    }
    const role = String(form.get('role') || 'bid');
    if (!['tender', 'bid'].includes(role)) {
      return NextResponse.json({ error: 'role 必须为 tender 或 bid' }, { status: 400 });
    }
    const bidderName = form.get('bidderName') ? String(form.get('bidderName')) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `文件超过 ${MAX_UPLOAD_MB}MB 限制` }, { status: 413 });
    }

    const { text, meta } = await extractDocument(buffer, file.name, file.type);

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from('documents')
      .insert({
        project_id: projectId,
        role,
        bidder_name: role === 'bid' ? bidderName : null,
        filename: file.name,
        mime_type: file.type || null,
        size_bytes: buffer.byteLength,
        content_text: text,
        meta,
      })
      .select('id, project_id, role, bidder_name, filename, mime_type, size_bytes, meta, created_at')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json(
      { document: data, textLength: text.length },
      { status: 201 }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// 删除文档
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get('docId');
    if (!docId) return NextResponse.json({ error: '缺少 docId' }, { status: 400 });

    const supabase = getServiceSupabase();
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', docId)
      .eq('project_id', params.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
