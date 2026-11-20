import { NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase/server';
import { readLLMConfig, withLLMConfig } from '@/lib/ai/openai';
import { writeAnalysisReport } from '@/lib/ai/agents';
import { recallKnowledge, learnFromCitations } from '@/lib/knowledge';
import { CHECK_KIND_LABEL, type CheckKind, type Citation } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const NO_KEY = '未配置大模型：请点击右上角「模型设置」填写 API Key / Base URL / 模型名（可选用本地 Ollama），或在 .env 中配置默认模型。';

interface ReportFinding {
  category: string;
  severity: string;
  title: string;
  detail: string;
  score: number | null;
  citation: Citation[];
}

// 生成项目级详细分析报告（汇总该项目下全部校验结果）
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const llm = readLLMConfig(req);
    if (!llm) return NextResponse.json({ error: NO_KEY }, { status: 400 });

    const supabase = getServiceSupabase();
    const pid = params.id;

    const [projRes, docsRes, runsRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', pid).single(),
      supabase
        .from('documents')
        .select('role, bidder_name, filename')
        .eq('project_id', pid)
        .order('created_at', { ascending: true }),
      supabase
        .from('check_runs')
        .select('*')
        .eq('project_id', pid)
        .order('created_at', { ascending: true }),
    ]);
    if (projRes.error) throw new Error(projRes.error.message);
    if (!projRes.data) return NextResponse.json({ error: '项目不存在' }, { status: 404 });

    const project = projRes.data;
    const docs = docsRes.data || [];
    const runs = (runsRes.data || []) as { id: string; kind: CheckKind; status: string; summary: Record<string, unknown> }[];
    if (!runs.length) {
      return NextResponse.json({ error: '该项目尚未执行任何校验，请先完成校验后再生成报告' }, { status: 400 });
    }

    const runIds = runs.map((r) => r.id);
    const { data: findingRows } = await supabase
      .from('findings')
      .select('run_id, category, severity, title, detail, score, citation')
      .in('run_id', runIds);

    const byRun = new Map<string, ReportFinding[]>();
    for (const f of findingRows || []) {
      const arr = byRun.get(f.run_id) || [];
      if (arr.length < 60) {
        arr.push({
          category: f.category,
          severity: f.severity,
          title: f.title,
          detail: (f.detail || '').slice(0, 400),
          score: f.score,
          citation: f.citation || [],
        });
      }
      byRun.set(f.run_id, arr);
    }

    const runsPayload = runs.map((r) => ({
      kind: CHECK_KIND_LABEL[r.kind] || r.kind,
      status: r.status,
      summary: r.summary || {},
      findings: byRun.get(r.id) || [],
    }));

    const tenderDocs = docs.filter((d) => d.role === 'tender');
    const bidDocs = docs.filter((d) => d.role === 'bid');

    // 扩展搜索：从知识库召回与本次问题相关的法规/案例作为先验参考
    const recallText = runsPayload
      .flatMap((r) => r.findings as { title: string; detail?: string }[])
      .map((f) => `${f.title} ${f.detail || ''}`)
      .join('\n')
      .slice(0, 8000);
    const priorKnowledge = await recallKnowledge(recallText).catch(() => []);

    const report = await withLLMConfig(llm, () =>
      writeAnalysisReport({
        project: {
          name: project.name,
          tenderer: project.tenderer,
          project_no: project.project_no,
          description: project.description,
        },
        documents: {
          tenderCount: tenderDocs.length,
          bidderCount: bidDocs.length,
          bidders: bidDocs.map((d) => d.bidder_name || d.filename),
          tenderFiles: tenderDocs.map((d) => d.filename),
        },
        runs: runsPayload,
        priorKnowledge,
      })
    );

    // 自我学习：沉淀报告引用的法规与案例
    const citations = [
      ...(report.sections || []).flatMap((s) => s.citations || []),
      ...(report.keyIssues || []).flatMap((k) => k.citation || []),
    ];
    const learned = await learnFromCitations(citations, 'report').catch(() => 0);

    return NextResponse.json({ report, generatedAt: new Date().toISOString(), learned });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
