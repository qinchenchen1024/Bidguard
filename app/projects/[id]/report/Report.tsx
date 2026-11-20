'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Citation, Severity } from '@/lib/types';
import { Button, SeverityBadge } from '@/components/ui';
import { llmHeaders } from '@/lib/llm-client';

interface ReportSection {
  heading: string;
  content: string;
  citations?: Citation[];
}
interface ReportKeyIssue {
  title: string;
  severity: Severity;
  detail: string;
  citation?: Citation[];
}
interface AnalysisReport {
  title: string;
  overallRisk: '低' | '中' | '高';
  overview: string;
  overallConclusion: string;
  sections: ReportSection[];
  keyIssues: ReportKeyIssue[];
  recommendations: string[];
  disclaimer: string;
}

const RISK_CLS: Record<string, string> = {
  高: 'bg-red-100 text-red-700 border-red-200',
  中: 'bg-amber-100 text-amber-700 border-amber-200',
  低: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function Report({ projectId }: { projectId: string }) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, { method: 'POST', headers: { ...llmHeaders() } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '生成报告失败');
      setReport(json.report);
      setGeneratedAt(json.generatedAt || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    generate();
  }, [generate]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/projects/${projectId}`} className="text-xs text-slate-500 hover:text-brand-600">
          ← 返回项目工作台
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled={loading} onClick={generate}>
            {loading ? '生成中…' : report ? '重新生成' : '生成报告'}
          </Button>
          <Button disabled={!report} onClick={() => window.print()}>
            打印 / 导出 PDF
          </Button>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 print:hidden">
          正在汇总各维度校验结果并撰写详细分析报告，请稍候…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {error}
        </div>
      )}

      {report && (
        <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
          <header className="border-b border-slate-200 pb-4">
            <h1 className="text-xl font-bold text-slate-900">{report.title || '招标投标文件智能校验分析报告'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-medium ${RISK_CLS[report.overallRisk] || RISK_CLS['中']}`}>
                总体风险：{report.overallRisk}
              </span>
              {generatedAt && <span>生成时间：{new Date(generatedAt).toLocaleString('zh-CN')}</span>}
            </div>
          </header>

          <section className="mt-5">
            <h2 className="text-base font-semibold text-slate-900">项目概况与校验范围</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.overview}</p>
          </section>

          <section className="mt-5">
            <h2 className="text-base font-semibold text-slate-900">总体结论</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{report.overallConclusion}</p>
          </section>

          {report.sections?.map((s, i) => (
            <section key={i} className="mt-5 break-inside-avoid">
              <h2 className="text-base font-semibold text-slate-900">{s.heading}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{s.content}</p>
              {s.citations && s.citations.length > 0 && <CitationBox citations={s.citations} />}
            </section>
          ))}

          {report.keyIssues && report.keyIssues.length > 0 && (
            <section className="mt-6">
              <h2 className="text-base font-semibold text-slate-900">关键问题清单</h2>
              <ul className="mt-3 space-y-3">
                {report.keyIssues.map((k, i) => (
                  <li key={i} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium text-slate-800">{k.title}</span>
                      <SeverityBadge severity={k.severity} />
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">{k.detail}</p>
                    {k.citation && k.citation.length > 0 && <CitationBox citations={k.citation} />}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {report.recommendations && report.recommendations.length > 0 && (
            <section className="mt-6">
              <h2 className="text-base font-semibold text-slate-900">整改与处理建议</h2>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
                {report.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            </section>
          )}

          {report.disclaimer && (
            <footer className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-400">{report.disclaimer}</footer>
          )}
        </article>
      )}
    </div>
  );
}

function CitationBox({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 p-2 print:bg-white">
      <div className="text-xs font-medium text-blue-700">法律法规 / 案例依据</div>
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
  );
}
