import { createClient } from '@supabase/supabase-js';

/**
 * 服务端 Supabase 客户端：使用 service_role key，仅在服务端 API 路由中调用。
 * 绝不能把这个客户端暴露到浏览器端。
 */
export function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error('缺少 Supabase 环境变量：NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
