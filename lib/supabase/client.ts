import { createClient } from '@supabase/supabase-js';

/**
 * 浏览器端 Supabase 客户端：使用 anon key，用于只读查询等前端场景。
 */
export function getBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, anonKey);
}
