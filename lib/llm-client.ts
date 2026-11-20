'use client';

/**
 * 浏览器端「模型设置」存取：配置保存在 localStorage，随请求头透传给服务端，
 * 服务端不落库、不保管用户密钥。
 */
export interface LlmSettings {
  provider: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface LlmPreset {
  id: string;
  label: string;
  baseURL: string;
  model: string;
  needKey: boolean;
  keyPlaceholder: string;
  hint: string;
}

export const LLM_PRESETS: LlmPreset[] = [
  {
    id: 'ollama',
    label: '本地 Ollama（免费）',
    baseURL: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    needKey: false,
    keyPlaceholder: '本地模型无需密钥',
    hint: '零成本、数据不出本地。需先安装并运行 Ollama（ollama pull qwen2.5:7b），且该地址需能被本应用服务端访问（Docker 部署用 http://ollama:11434/v1）。',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    needKey: true,
    keyPlaceholder: 'sk-...',
    hint: '按量计费、性价比高，推荐 deepseek-chat（支持 JSON 结构化输出）。',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseURL: '',
    model: 'gpt-4o',
    needKey: true,
    keyPlaceholder: 'sk-...',
    hint: '使用 OpenAI 官方接口。',
  },
  {
    id: 'custom',
    label: '自定义（OpenAI 兼容）',
    baseURL: '',
    model: '',
    needKey: true,
    keyPlaceholder: '按需填写',
    hint: '任意 OpenAI 兼容端点，如 Groq、OpenRouter、硅基流动等；需支持 response_format=json_object。',
  },
];

export function getPreset(id: string): LlmPreset {
  return LLM_PRESETS.find((p) => p.id === id) || LLM_PRESETS[0];
}

const STORAGE_KEY = 'bidguard.llm.settings';

export function loadLlmSettings(): LlmSettings | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as LlmSettings;
    return s && s.model ? s : null;
  } catch {
    return null;
  }
}

export function saveLlmSettings(s: LlmSettings): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function clearLlmSettings(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

/** 生成请求头，供本应用 API 调用时透传当前模型配置 */
export function llmHeaders(): Record<string, string> {
  const s = loadLlmSettings();
  if (!s || !s.model) return {};
  const h: Record<string, string> = { 'x-llm-model': s.model };
  if (s.apiKey) h['x-llm-key'] = s.apiKey;
  if (s.baseURL) h['x-llm-base'] = s.baseURL;
  if (s.provider) h['x-llm-provider'] = s.provider;
  return h;
}

/** 由设置对象直接生成请求头（用于保存前的「测试连接」） */
export function headersOf(s: LlmSettings): Record<string, string> {
  const h: Record<string, string> = { 'x-llm-model': s.model };
  if (s.apiKey) h['x-llm-key'] = s.apiKey;
  if (s.baseURL) h['x-llm-base'] = s.baseURL;
  if (s.provider) h['x-llm-provider'] = s.provider;
  return h;
}
