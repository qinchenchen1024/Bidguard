#!/usr/bin/env node
/**
 * 生成 BidGuard 自托管所需的密钥，并把一份可用的 .env 输出到标准输出。
 *
 * 首次使用：
 *     node deploy/gen-keys.mjs > .env
 *     docker compose up -d
 *
 * 说明：
 *  - JWT_SECRET 用于以 HS256 给 ANON_KEY / SERVICE_ROLE_KEY 签名；内置 PostgREST 用同一密钥校验，
 *    supabase-js 用 ANON_KEY / SERVICE_ROLE_KEY 作为 Bearer Token 访问。
 *  - ANON_KEY / SERVICE_ROLE_KEY 是标准 JWT，role 分别为 anon / service_role（与数据库角色对应）。
 */
import crypto from 'node:crypto';

const POSTGRES_PASSWORD = crypto.randomBytes(16).toString('hex');
const JWT_SECRET = crypto.randomBytes(32).toString('hex');

const b64url = (input) => Buffer.from(input).toString('base64url');

function makeKey(role) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: 'bidguard',
    ref: 'self-hosted',
    role,
    iat: now,
    exp: now + 60 * 60 * 24 * 365 * 10, // 10 年（本地自托管，无需轮换）
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

process.stdout.write(`# 由 deploy/gen-keys.mjs 自动生成于 ${new Date().toISOString()}

# ---- 内置数据库 ----
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

# ---- API 鉴权密钥（HS256 JWT）----
JWT_SECRET=${JWT_SECRET}
ANON_KEY=${makeKey('anon')}
SERVICE_ROLE_KEY=${makeKey('service_role')}

# ---- 单文件上传上限（MB）----
MAX_UPLOAD_MB=200

# ---- 服务端默认大模型 ----
# 默认使用 compose 内置的 Ollama（免费）；如需云端模型，改这里或在网页右上角「模型设置」中配置
LLM_PROVIDER=ollama
LLM_BASE_URL=http://ollama:11434/v1
LLM_MODEL=qwen2.5:7b
`);
