'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Project } from '@/lib/types';
import { Button, Card } from '@/components/ui';

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', tenderer: '', project_no: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/projects');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '加载项目失败');
      setProjects(json.projects || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '创建失败');
      setForm({ name: '', tenderer: '', project_no: '', description: '' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-6">
        <Card title="校验项目">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
          {loading ? (
            <p className="text-sm text-slate-500">加载中…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-slate-500">暂无项目，请在右侧新建一个校验项目。</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {p.name}
                    </Link>
                    <div className="mt-0.5 truncate text-xs text-slate-500">
                      {[p.tenderer, p.project_no, new Date(p.created_at).toLocaleString('zh-CN')]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <Link href={`/projects/${p.id}`}>
                    <Button variant="ghost">进入</Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="新建校验项目">
        <form onSubmit={createProject} className="space-y-3">
          <Field label="项目名称" required>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="如：XX工程建设项目招标"
            />
          </Field>
          <Field label="招标人">
            <input
              className="input"
              value={form.tenderer}
              onChange={(e) => setForm({ ...form, tenderer: e.target.value })}
              placeholder="招标单位名称"
            />
          </Field>
          <Field label="项目编号">
            <input
              className="input"
              value={form.project_no}
              onChange={(e) => setForm({ ...form, project_no: e.target.value })}
              placeholder="可空"
            />
          </Field>
          <Field label="说明">
            <textarea
              className="input h-20 resize-none"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="可空"
            />
          </Field>
          <Button type="submit" disabled={submitting || !form.name.trim()} className="w-full">
            {submitting ? '创建中…' : '创建项目'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}
