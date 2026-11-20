-- BidGuard 初始化结构：项目 / 文档 / 校验任务 / 问题发现 / 法规库

create extension if not exists "pgcrypto";

-- 项目：一次招投标活动
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  tenderer text,          -- 招标人
  project_no text,        -- 项目编号
  created_at timestamptz not null default now()
);

-- 文档：招标文件或投标文件
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  role text not null check (role in ('tender', 'bid')), -- tender=招标文件, bid=投标文件
  bidder_name text,       -- 投标人名称（role=bid 时）
  filename text not null,
  mime_type text,
  size_bytes bigint,
  storage_path text,      -- Supabase Storage 路径
  content_text text,      -- 解析出的纯文本
  meta jsonb not null default '{}'::jsonb, -- 文档元数据（作者/创建时间/生产者等）
  created_at timestamptz not null default now()
);

-- 校验任务
create table if not exists check_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  kind text not null check (kind in (
    'tender_completeness',
    'tender_compliance',
    'bid_similarity',
    'bid_collusion'
  )),
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 校验发现的问题
create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references check_runs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  category text not null,                       -- 问题类别
  severity text not null default 'info' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  title text not null,
  detail text,
  score numeric,                                -- 相似度 / 风险分 0-100
  evidence jsonb not null default '{}'::jsonb,  -- 证据：原文片段、位置、对比对象
  citation jsonb not null default '[]'::jsonb,  -- 法规 / 案例引用
  created_at timestamptz not null default now()
);

-- 法规 / 案例知识库（供检索智能体引用）
create table if not exists regulations (
  id uuid primary key default gen_random_uuid(),
  code text,            -- 法规编号 / 条款号
  title text not null,
  category text,        -- 法律 / 行政法规 / 部门规章 / 地方规定 / 案例
  content text not null,
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_documents_project on documents(project_id);
create index if not exists idx_documents_role on documents(project_id, role);
create index if not exists idx_runs_project on check_runs(project_id);
create index if not exists idx_findings_run on findings(run_id);
create index if not exists idx_findings_project on findings(project_id);
create index if not exists idx_regulations_category on regulations(category);

-- 存储桶：存放上传的原始文档
-- 仅当环境启用了 Supabase Storage（存在 storage schema）时创建；
-- 自托管内置数据库不含 Storage，此处自动跳过（应用不依赖 Storage）。
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('documents', 'documents', false)
    on conflict (id) do nothing;
  end if;
end
$$;
