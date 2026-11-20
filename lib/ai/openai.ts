import OpenAI from 'openai';
import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * 大模型接入层（支持"用户自带密钥 / 本地免费智能体"）。
 *
 * 配置来源优先级：
 *   1) 请求头（用户在界面「模型设置」中填写，浏览器 localStorage 保存后随请求透传）
 *   2) 环境变量（自托管部署时预置，作为默认兜底）
 *
 * 通过 AsyncLocalStorage 把"本次请求的模型配置"透传到任意深层调用，
 * 无需修改各智能体函数的签名。
 */
export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  model: string;
  /** 仅用于界面展示与提示，如 ollama / deepseek / openai / custom */
  provider?: string;
}

const storage = new AsyncLocalStorage<LLMConfig>();

/** 从环境变量构造默认配置（自托管兜底），无则返回 null */
function envConfig(): LLMConfig | null {
  const base = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  const provider = process.env.LLM_PROVIDER;
  const key = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;

  // 显式指定 provider 或 baseURL（例如本地 Ollama、第三方 OpenAI 兼容端点）
  if (provider || base) {
    const p = provider || 'custom';
    const defaultBase = p === 'deepseek' ? 'https://api.deepseek.com' : undefined;
    return {
      apiKey: key || 'ollama',
      baseURL: base || defaultBase,
      model: model || (p === 'ollama' ? 'qwen2.5:7b' : 'gpt-4o'),
      provider: p,
    };
  }
  if (process.env.DEEPSEEK_API_KEY) {
    return { apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com', model: model || 'deepseek-chat', provider: 'deepseek' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { apiKey: process.env.OPENAI_API_KEY, model: model || process.env.OPENAI_MODEL || 'gpt-4o', provider: 'openai' };
  }
  return null;
}

/** 从请求头读取用户自带配置；未提供则回退到环境变量。本地 Ollama 允许空密钥 */
export function readLLMConfig(req: Request): LLMConfig | null {
  const h = req.headers;
  const key = (h.get('x-llm-key') || '').trim();
  const base = (h.get('x-llm-base') || '').trim();
  const model = (h.get('x-llm-model') || '').trim();
  const provider = (h.get('x-llm-provider') || '').trim() || undefined;
  if (model && (key || base)) {
    return { apiKey: key || 'ollama', baseURL: base || undefined, model, provider };
  }
  return envConfig();
}

/** 在指定模型配置的上下文中执行（配置透传到新建的所有异步调用链） */
export function withLLMConfig<T>(cfg: LLMConfig | null, fn: () => Promise<T>): Promise<T> {
  return cfg ? storage.run(cfg, fn) : fn();
}

/** 当前请求生效的模型配置：上下文优先，其次环境变量 */
export function currentLLMConfig(): LLMConfig | null {
  return storage.getStore() || envConfig();
}

export function hasLLM(): boolean {
  return Boolean(currentLLMConfig());
}

export function getLLMModel(): string {
  return currentLLMConfig()?.model || 'gpt-4o';
}

// 按 (baseURL, apiKey) 缓存客户端，支持多用户各自密钥并发
const clients = new Map<string, OpenAI>();

export function getOpenAI(): OpenAI {
  const cfg = currentLLMConfig();
  if (!cfg) {
    throw new Error(
      '未配置大模型：请点击右上角「模型设置」填写 API Key / Base URL / 模型名，或在 .env 中配置 LLM_PROVIDER / LLM_BASE_URL / LLM_MODEL。'
    );
  }
  const cacheKey = `${cfg.baseURL || ''}||${cfg.apiKey}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
    clients.set(cacheKey, client);
  }
  return client;
}
