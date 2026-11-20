-- 为内置 PostgREST 创建 API 角色（对应 Supabase 的 anon / authenticated / service_role）
-- 该文件随内置数据库首次初始化执行，之后由 10-schema / 20-grants / 30-learning 建表授权。

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;
