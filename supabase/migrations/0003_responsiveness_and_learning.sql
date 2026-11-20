-- 0003: 新增「投标响应性核验」校验类型，并为法规/案例知识库增加自学习字段

-- 1) check_runs.kind 允许 bid_responsiveness（投标文件 ↔ 招标文件 交叉响应性核验）
alter table check_runs drop constraint if exists check_runs_kind_check;
alter table check_runs add constraint check_runs_kind_check check (kind in (
  'tender_completeness',
  'tender_compliance',
  'bid_responsiveness',
  'bid_similarity',
  'bid_collusion'
));

-- 2) 法规 / 案例知识库：支持「扩展搜索 + 自我学习」——记录复用次数与来源
alter table regulations add column if not exists usage_count integer not null default 0;
alter table regulations add column if not exists last_used_at timestamptz;
alter table regulations add column if not exists updated_at timestamptz not null default now();
alter table regulations add column if not exists source text;   -- 学习来源：校验类型 / 项目

create index if not exists idx_regulations_title on regulations(title);
create index if not exists idx_regulations_usage on regulations(usage_count);
