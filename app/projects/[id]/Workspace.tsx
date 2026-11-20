'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { BidDocument, CheckKind, CheckRun, Citation, Finding, Project } from '@/lib/types';
import { CHECK_KIND_LABEL } from '@/lib/types';
import { Button, Card, SeverityBadge } from '@/components/ui';
import { llmHeaders } from '@/lib/llm-client';

const CHECK_KINDS: CheckKind[] = [
  'tender_completeness',
  'tender_compliance',
  'bid_responsiveness',
  'bid_similarity',
  'bid_collusion',
];

const CHECK_HINT: Record<CheckKind, string> = {
  tender_completeness: '依据必备章节清单核对招标文件完整性',
  tender_compliance: '依据现行法规审查条款合规性并给出法规引用',
  bid_responsiveness: '分条对比 + 整体叙述逻辑性对比，核验投标文件是否满足招标文件需求',
  bid_similarity: '多份投标文件两两比对，定位雷同段落（确定性算法）',
  bid_collusion: '元数据一致性 + 联系方式重叠 + 文本雷同，结合法规与案例综合研判',
};

type UploadRow = { id: string; file: File; role: 'tender' | 'bid'; bidderName: string };

export default function Workspace({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [documents, setDocuments] = useState<BidDocument[]>([]);
  const [runs, setRuns] = useState<CheckRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [role, setRole] = useState<'tender' | 'bid'>('tender');
  const [bidderName, setBidderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [queue, setQueue] = useState<UploadRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [runningKind, setRunningKind] = useState<CheckKind | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runFindings, setRunFindings] = useState<Finding[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(false);

  const loadProject = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载失败');
      setProject(json.project);
      setDocuments(json.documents || []);
      setRuns(json.runs || []);
      if (!selectedRunId && json.runs?.[0]) setSelectedRunId(json.runs[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedRunId]);

  useEffect(() => {
    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const loadFindings = useCallback(async (runId: string) => {
    setFindingsLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载结果失败');
      setRunFindings(json.findings || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFindingsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRunId) loadFindings(selectedRunId);
  }, [selectedRunId, loadFindings]);

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const rows: UploadRow[] = Array.from(files).map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      role,
      bidderName: role === 'bid' ? bidderName.trim() : '',
    }));
    setQueue((q) => [...q, ...rows]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function updateRow(id: string, patch: Partial<UploadRow>) {
    setQueue((q) => q.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setQueue((q) => q.filter((r) => r.id !== id));
  }

  async function uploadAll() {
    if (queue.length === 0) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    const failed: string[] = [];
    let ok = 0;
    for (let i = 0; i < queue.length; i++) {
      const row = queue[i];
      setProgress(`上传中 ${i + 1}/${queue.length}：${row.file.name}`);
      try {
        const fd = new FormData();
        fd.append('file', row.file);
        fd.append('role', row.role);
        if (row.role === 'bid' && row.bidderName.trim()) fd.append('bidderName', row.bidderName.trim());
        const res = await fetch(`/api/projects/${projectId}/documents`, { method: 'POST', body: fd });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || '上传失败');
        ok++;
      } catch (e) {
        failed.push(`${row.file.name}：${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setUploading(false);
    setProgress('');
    setQueue([]);
    if (failed.length === 0) {
      setNotice(`已上传并解析 ${ok} 个文件`);
    } else {
      setNotice(`成功 ${ok} 个，失败 ${failed.length} 个`);
      setError(failed.join('；'));
    }
    await loadProject();
  }

  async function removeDoc(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/documents?docId=${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '删除失败');
      await loadProject();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function runCheck(kind: CheckKind) {
    setRunningKind(kind);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...llmHeaders() },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '校验失败');
      setNotice(`${CHECK_KIND_LABEL[kind]} 已完成`);
      await loadProject();
      setSelectedRunId(json.run.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunningKind(null);
    }
  }

  const tenderDocs = documents.filter((d) => d.role === 'tender');
  const bidDocs = documents.filter((d) => d.role === 'bid');

  if (loading) return <p className="text-sm text-slate-500">加载中…</p>;
  if (!project) return <p className="text-sm text-red-600">{error || '项目不存在'}</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="text-xs text-slate-500 hover:text-brand-600">
            ← 返回项目列表
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">{project.name}</h1>
          <p className="text-xs text-slate-500">
            {[project.tenderer, project.project_no].filter(Boolean).join(' · ') || '未填写招标人/编号'}
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/report`}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-brand-600 bg-white px-3 py-2 text-sm font-medium text-brand-600 transition hover:bg-brand-50"
        >
          生成分析报告
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-6">
          <Card title="上传文件">
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={role === 'tender'} onChange={() => setRole('tender')} />
                  招标文件
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={role === 'bid'} onChange={() => setRole('bid')} />
                  投标文件
                </label>
              </div>
              {role === 'bid' && (
                <input
                  className="input"
                  placeholder="默认投标人名称（可对每个文件单独修改）"
                  value={bidderName}
                  onChange={(e) => setBidderName(e.target.value)}
                />
              )}
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => addFiles(e.target.files)}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700"
              />
              <p className="text-xs text-slate-400">
                支持 PDF / Word(docx) / Excel / CSV / TXT，可一次多选；单文件 ≤ 200MB
              </p>

              {queue.length > 0 && (
                <div className="space-y-2 rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500">待上传（{queue.length}）</span>
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:underline"
                      onClick={() => setQueue([])}
                    >
                      清空
                    </button>
                  </div>
                  <ul className="space-y-2">
                    {queue.map((r) => (
                      <li key={r.id} className="rounded-md bg-slate-50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                            {r.file.name}
                          </span>
                          <button
                            type="button"
                            className="text-xs text-red-600 hover:underline"
                            onClick={() => removeRow(r.id)}
                          >
                            移除
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <select
                            className="input h-8 py-0 text-xs"
                            value={r.role}
                            onChange={(e) => updateRow(r.id, { role: e.target.value as 'tender' | 'bid' })}
                          >
                            <option value="tender">招标文件</option>
                            <option value="bid">投标文件</option>
                          </select>
                          {r.role === 'bid' && (
                            <input
                              className="input h-8 py-0 text-xs"
                              placeholder="投标人名称"
                              value={r.bidderName}
                              onChange={(e) => updateRow(r.id, { bidderName: e.target.value })}
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                type="button"
                disabled={uploading || queue.length === 0}
                className="w-full"
                onClick={uploadAll}
              >
                {uploading ? progress || '上传解析中…' : `上传全部（${queue.length}）`}
              </Button>
            </div>
          </Card>

          <Card title={`招标文件（${tenderDocs.length}）`}>
            <DocList docs={tenderDocs} onRemove={removeDoc} />
          </Card>

          <Card title={`投标文件（${bidDocs.length}）`}>
            <DocList docs={bidDocs} onRemove={removeDoc} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="智能校验">
            <div className="grid gap-3 sm:grid-cols-2">
              {CHECK_KINDS.map((k) => (
                <div key={k} className="rounded-lg border border-slate-200 p-3">
                  <div className="text-sm font-medium text-slate-800">{CHECK_KIND_LABEL[k]}</div>
                  <p className="mt-1 text-xs text-slate-500">{CHECK_HINT[k]}</p>
                  <Button
                    className="mt-3 w-full"
                    variant="ghost"
                    disabled={runningKind !== null}
                    onClick={() => runCheck(k)}
                  >
                    {runningKind === k ? '校验中…' : '开始校验'}
                  </Button>
                </div>
              ))}
            </div>
          </Card>

          <Card title="校验记录">
            {runs.length === 0 ? (
              <p className="text-sm text-slate-500">暂无校验记录</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {runs.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <button
                      className={`text-left text-sm ${
                        selectedRunId === r.id ? 'font-semibold text-brand-600' : 'text-slate-700'
                      }`}
                      onClick={() => setSelectedRunId(r.id)}
                    >
                      {CHECK_KIND_LABEL[r.kind]}
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(r.created_at).toLocaleString('zh-CN')}
                      </span>
                    </button>
                    <RunStatus run={r} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="校验结果">
            {!selectedRunId ? (
              <p className="text-sm text-slate-500">请选择一条校验记录查看结果</p>
            ) : findingsLoading ? (
              <p className="text-sm text-slate-500">加载结果中…</p>
            ) : runFindings.length === 0 ? (
              <p className="text-sm text-slate-500">该记录暂无可展示的结果</p>
            ) : (
              <div className="space-y-3">
                {runFindings.map((f) => (
                  <FindingItem key={f.id} finding={f} />
                ))}
              </div>
            )}
          </Card>

          <RegulationSearchCard />

          <KnowledgeCard />
        </div>
      </div>
    </div>
  );
}

function DocList({ docs, onRemove }: { docs: BidDocument[]; onRemove: (id: string) => void }) {
  if (!docs.length) return <p className="text-sm text-slate-500">暂无文件</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {docs.map((d) => (
        <li key={d.id} className="flex items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm text-slate-800">{d.bidder_name || d.filename}</div>
            <div className="truncate text-xs text-slate-400">
              {d.filename} · {fmtSize(d.size_bytes)}
            </div>
          </div>
          <Button variant="danger" onClick={() => onRemove(d.id)}>
            删除
          </Button>
        </li>
      ))}
    </ul>
  );
}

function RunStatus({ run }: { run: CheckRun }) {
  const map: Record<CheckRun['status'], { label: string; cls: string }> = {
    pending: { label: '待执行', cls: 'text-slate-500' },
    running: { label: '执行中', cls: 'text-amber-600' },
    done: { label: '已完成', cls: 'text-emerald-600' },
    failed: { label: '失败', cls: 'text-red-600' },
  };
  const m = map[run.status];
  return <span className={`text-xs ${m.cls}`}>{m.label}</span>;
}

function FindingItem({ finding }: { finding: Finding }) {
  const ev = (finding.evidence || {}) as Record<string, any>;
  const citations = (finding.citation || []) as Citation[];
  const paragraphs: { aText: string; bText: string; score: number }[] = ev.duplicateParagraphs || [];
  const indicators: { title: string; severity: string; detail: string; docs: string[] }[] = ev.indicators || [];
  const sections: { name: string; required: boolean; present: boolean; note?: string }[] = ev.sections || [];
  const items: {
    requirement: string;
    category?: string;
    clause?: string;
    responded: boolean;
    matched?: string;
    gap?: string;
    severity?: string;
  }[] = ev.items || [];
  const narrative: { score?: number; issues?: { title: string; detail: string }[]; comment?: string } | undefined =
    ev.narrative;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="font-medium text-slate-900">{finding.title}</div>
        <SeverityBadge severity={finding.severity} />
      </div>

      {finding.detail && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{finding.detail}</p>}

      {ev.clause && (
        <blockquote className="mt-2 border-l-2 border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          原文：{ev.clause}
        </blockquote>
      )}

      {typeof finding.score === 'number' && (
        <div className="mt-2 text-xs text-slate-500">分值/风险分：{finding.score}</div>
      )}

      {sections.length > 0 && (
        <div className="mt-3 grid gap-1 text-xs sm:grid-cols-2">
          {sections.map((s, i) => (
            <div key={i} className={s.present ? 'text-slate-600' : 'font-medium text-red-600'}>
              {s.present ? '✓' : '✗'} {s.name}
            </div>
          ))}
        </div>
      )}

      {narrative && (narrative.comment || narrative.score !== undefined) && (
        <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-800">
          <div className="font-medium">
            整体叙述逻辑性{narrative.score !== undefined ? `评分：${narrative.score} 分` : ''}
          </div>
          {narrative.comment && <div className="mt-1 text-indigo-700">{narrative.comment}</div>}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-xs font-medium text-slate-500">
            分条对比（招标要求 → 投标响应）：共 {items.length} 条
          </div>
          <div className="space-y-1">
            {items.map((it, i) => (
              <div key={i} className="rounded-md border border-slate-200 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {it.category ? `[${it.category}] ` : ''}
                    {it.requirement}
                  </span>
                  <span className={it.responded ? 'shrink-0 text-emerald-600' : 'shrink-0 text-red-600'}>
                    {it.responded ? '已响应' : '未响应'}
                  </span>
                </div>
                {it.clause && (
                  <div className="mt-1 text-slate-500">
                    <span className="text-slate-400">招标依据：</span>
                    {it.clause}
                  </div>
                )}
                {it.matched && (
                  <div className="mt-1 text-slate-600">
                    <span className="text-slate-400">投标响应：</span>
                    {it.matched}
                  </div>
                )}
                {it.gap && (
                  <div className="mt-1 text-red-600">
                    <span className="text-red-400">偏离/缺漏：</span>
                    {it.gap}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {paragraphs.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="text-xs font-medium text-slate-500">雷同段落（按相似度降序）</div>
          {paragraphs.slice(0, 8).map((p, i) => (
            <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs">
              <div className="mb-1 font-medium text-amber-800">相似度 {(p.score * 100).toFixed(1)}%</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded bg-white p-2 text-slate-600">{p.aText}</div>
                <div className="rounded bg-white p-2 text-slate-600">{p.bText}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {indicators.length > 0 && (
        <ul className="mt-3 space-y-2">
          {indicators.map((ind, i) => (
            <li key={i} className="rounded-md bg-slate-50 p-2 text-xs text-slate-600">
              <span className="font-medium text-slate-800">{ind.title}</span>
              {ind.docs?.length ? `（${ind.docs.join('、')}）` : ''}
              <div>{ind.detail}</div>
            </li>
          ))}
        </ul>
      )}

      {citations.length > 0 && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-2">
          <div className="text-xs font-medium text-blue-700">法规 / 案例引用</div>
          <ul className="mt-1 space-y-1 text-xs text-blue-800">
            {citations.map((c, i) => (
              <li key={i}>
                {c.code ? `【${c.code}】` : ''}
                {c.title}
                {c.category ? ` · ${c.category}` : ''}
                {c.excerpt ? `：${c.excerpt}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RegulationSearchCard() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ items: Citation[]; analysis: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/regulations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...llmHeaders() },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '检索失败');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card title="法规 / 案例智能检索">
      <form onSubmit={search} className="space-y-2">
        <textarea
          className="input h-20 resize-none"
          placeholder="例如：招标文件中限定本地企业是否合规？相关法规与案例依据？"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? '检索中…' : '检索法规与案例'}
        </Button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          {result.analysis && <p className="text-sm text-slate-700">{result.analysis}</p>}
          <ul className="space-y-1 text-xs text-slate-600">
            {(result.items || []).map((c, i) => (
              <li key={i} className="rounded-md bg-slate-50 p-2">
                <span className="font-medium text-slate-800">
                  {c.code ? `【${c.code}】` : ''}
                  {c.title}
                </span>
                {c.category ? ` · ${c.category}` : ''}
                {c.excerpt ? <div className="mt-0.5">{c.excerpt}</div> : null}
                {c.url ? (
                  <a className="mt-0.5 block text-brand-600 underline" href={c.url} target="_blank" rel="noreferrer">
                    {c.url}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function KnowledgeCard() {
  const [items, setItems] = useState<
    { id: string; code?: string; title: string; category?: string; excerpt?: string; url?: string; source?: string | null; usage_count?: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/regulations');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载失败');
      setItems(json.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card title={`法规/案例知识库 · 自学习（${items.length}）`}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          智能体在合规性与串标研判中检索引用的法规与案例会自动沉淀于此，供后续校验复用。
        </p>
        <Button variant="ghost" disabled={loading} onClick={load}>
          {loading ? '刷新中…' : '刷新'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && items.length === 0 ? (
        <p className="text-sm text-slate-500">暂无学习记录，执行「条款合规性校验」或「串标嫌疑识别」后自动积累。</p>
      ) : (
        <ul className="space-y-1 text-xs text-slate-600">
          {items.map((c) => (
            <li key={c.id} className="rounded-md bg-slate-50 p-2">
              <span className="font-medium text-slate-800">
                {c.code ? `【${c.code}】` : ''}
                {c.title}
              </span>
              {c.category ? ` · ${c.category}` : ''}
              {typeof c.usage_count === 'number' ? (
                <span className="ml-2 text-slate-400">引用 {c.usage_count} 次</span>
              ) : null}
              {c.excerpt ? <div className="mt-0.5 text-slate-500">{c.excerpt}</div> : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function fmtSize(n: number | null): string {
  if (!n) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
