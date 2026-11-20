'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import {
  LLM_PRESETS,
  clearLlmSettings,
  getPreset,
  headersOf,
  loadLlmSettings,
  saveLlmSettings,
  type LlmSettings,
} from '@/lib/llm-client';

/** 顶部「模型设置」入口：用户自带密钥 / 本地免费智能体的配置面板 */
const DISMISS_KEY = 'bidguard.llm.guideDismissed';

export default function LlmSettingsButton() {
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const [form, setForm] = useState<LlmSettings>({ provider: 'ollama', apiKey: '', baseURL: '', model: '' });
  const [configured, setConfigured] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const saved = loadLlmSettings();
    if (saved) {
      setForm(saved);
      setConfigured(true);
      return;
    }
    const p = getPreset('ollama');
    setForm({ provider: p.id, apiKey: '', baseURL: p.baseURL, model: p.model });

    // 未配置且服务端也无默认模型时，首次进入自动弹出引导（同一会话关闭后不再打扰）
    if (window.sessionStorage.getItem(DISMISS_KEY)) return;
    fetch('/api/llm/status')
      .then((r) => r.json())
      .then((j) => {
        if (!j.serverConfigured) {
          setGuide(true);
          setOpen(true);
        }
      })
      .catch(() => {});
  }, []);

  function close() {
    setOpen(false);
    if (!configured) window.sessionStorage.setItem(DISMISS_KEY, '1');
  }

  const preset = getPreset(form.provider);

  function switchProvider(id: string) {
    const p = getPreset(id);
    setForm({ provider: p.id, apiKey: '', baseURL: p.baseURL, model: p.model });
    setTestMsg(null);
  }

  function buildHeaders(): Record<string, string> {
    return { 'Content-Type': 'application/json', ...headersOf(form) };
  }

  async function test() {
    if (!form.model) {
      setTestMsg({ ok: false, text: '请先填写模型名' });
      return;
    }
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await fetch('/api/llm/test', { method: 'POST', headers: buildHeaders() });
      const json = await res.json();
      if (json.ok) {
        setTestMsg({ ok: true, text: `连接成功（${json.model}，${json.latencyMs}ms）` });
      } else {
        setTestMsg({ ok: false, text: json.error || '连接失败' });
      }
    } catch (e) {
      setTestMsg({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  function save() {
    if (!form.model) {
      setTestMsg({ ok: false, text: '请先填写模型名' });
      return;
    }
    saveLlmSettings({ ...form, apiKey: form.apiKey.trim(), baseURL: form.baseURL.trim(), model: form.model.trim() });
    setConfigured(true);
    setGuide(false);
    window.sessionStorage.removeItem(DISMISS_KEY);
    setOpen(false);
  }

  function clear() {
    clearLlmSettings();
    setConfigured(false);
    const p = getPreset('ollama');
    setForm({ provider: p.id, apiKey: '', baseURL: p.baseURL, model: p.model });
    setTestMsg(null);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
      >
        <span className={`h-2 w-2 rounded-full ${configured ? 'bg-emerald-500' : 'bg-amber-400'}`} />
        模型设置
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 print:hidden">
          <div className="mt-12 w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">模型设置</h2>
              <button onClick={close} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>

            {guide && !configured && (
              <div className="mb-4 rounded-lg border border-brand-200 bg-brand-50 p-3 text-xs leading-5 text-brand-800">
                <div className="mb-1 font-semibold text-brand-800">首次使用，请先配置大模型</div>
                推荐选择「本地 Ollama」——免费且数据不出本地；也可直接填入你自己的 API Key（如 DeepSeek）。
                配置仅保存在本机浏览器，随请求透传给服务端，不会上传或落库。
              </div>
            )}

            <p className="mb-4 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">
              配置仅保存在本机浏览器，随请求透传给服务端，不会上传或落库。留空则使用服务端默认模型。
            </p>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-slate-700">提供方</span>
              <select className="input" value={form.provider} onChange={(e) => switchProvider(e.target.value)}>
                {LLM_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-slate-700">API Key</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                placeholder={preset.keyPlaceholder}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
            </label>

            <label className="mb-3 block text-sm">
              <span className="mb-1 block text-slate-700">Base URL（服务端需可访问）</span>
              <input
                className="input"
                placeholder="https://api.deepseek.com"
                value={form.baseURL}
                onChange={(e) => setForm({ ...form, baseURL: e.target.value })}
              />
            </label>

            <label className="mb-2 block text-sm">
              <span className="mb-1 block text-slate-700">模型名</span>
              <input
                className="input"
                placeholder="deepseek-chat"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </label>

            <p className="mb-4 text-xs text-slate-400">{preset.hint}</p>

            {testMsg && (
              <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${testMsg.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                {testMsg.text}
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" disabled={testing} onClick={test}>
                {testing ? '测试中…' : '测试连接'}
              </Button>
              <div className="flex items-center gap-2">
                <Button variant="danger" onClick={clear}>清除</Button>
                <Button onClick={save}>保存</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
