import { getServiceSupabase } from '@/lib/supabase/server';
import { charShingles, containment } from '@/lib/similarity';
import type { Citation } from '@/lib/types';

/**
 * 法规 / 案例知识库（智能体的「扩展搜索 + 自我学习」能力）。
 * - recallKnowledge：每次校验前，先从历次校验积累的法规/案例库中召回相关知识，作为模型的先验参考（扩展搜索）。
 * - learnFromCitations：把本次校验中新检索/引用到的法规与案例沉淀入库，供后续校验复用（自我学习）。
 */

export interface KnowledgeItem extends Citation {
  id: string;
  source?: string | null;
  usage_count?: number;
  last_used_at?: string | null;
}

/** 清洗：仅保留用于相似度比较的字符 */
function clean(text: string): string {
  return (text || '').replace(/[\s，。；：！？、"'（）《》【】()<>.,;:!?"'\[\]]/g, '').toLowerCase();
}

/** 从知识库召回与当前文本相关的法规/案例（确定性：n-gram 重合度排序） */
export async function recallKnowledge(text: string, limit = 8): Promise<Citation[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('regulations')
    .select('code,title,category,content,source_url,usage_count')
    .order('usage_count', { ascending: false })
    .limit(500);
  if (error || !data?.length) return [];

  const q = clean(text).slice(0, 6000);
  if (q.length < 6) return [];
  const qGrams = charShingles(q, 3);

  const scored = data
    .map((r) => {
      const hay = clean(`${r.title || ''}${r.code || ''}${r.content || ''}`);
      const hayGrams = charShingles(hay, 3);
      // 用「查询文本有多少比例出现在该条法规中」衡量相关性，并对标题命中加权
      let score = containment(qGrams, hayGrams);
      const title = clean(r.title || '');
      if (title && q.includes(title.slice(0, Math.min(title.length, 12)))) score += 0.3;
      score += Math.min((r.usage_count || 0), 10) * 0.005; // 复用度轻微加权
      return { r, score };
    })
    .filter((x) => x.score >= 0.08)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((x) => ({
    code: x.r.code || undefined,
    title: x.r.title,
    category: x.r.category || undefined,
    excerpt: (x.r.content || '').slice(0, 300),
    url: x.r.source_url || undefined,
  }));
}

/**
 * 自我学习：把本次校验引用到的法规/案例写入知识库。
 * 以 title 去重：已存在则累加复用次数并刷新时间，不存在则新增。
 * 返回本次新增的条目数。
 */
export async function learnFromCitations(citations: Citation[], source: string): Promise<number> {
  const items = (citations || []).filter((c) => c && c.title && c.title.trim());
  if (!items.length) return 0;

  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  let learned = 0;

  // 同一批内按「条款号 + 法规名称」去重（同一部法律的不同条款需分别保留）
  const seen = new Set<string>();
  for (const it of items) {
    const title = it.title.trim().slice(0, 500);
    const code = (it.code || '').trim();
    const key = `${code}||${title}`;
    if (seen.has(key)) continue;
    seen.add(key);

    let query = supabase.from('regulations').select('id,usage_count').eq('title', title);
    query = code ? query.eq('code', code) : query.is('code', null);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      await supabase
        .from('regulations')
        .update({
          usage_count: (existing.usage_count || 0) + 1,
          last_used_at: now,
          updated_at: now,
        })
        .eq('id', existing.id);
    } else {
      const { error } = await supabase.from('regulations').insert({
        code: code || null,
        title,
        category: it.category || null,
        content: it.excerpt || it.title,
        source_url: it.url || null,
        source,
        usage_count: 1,
        last_used_at: now,
      });
      if (!error) learned++;
    }
  }
  return learned;
}

/** 列出知识库条目（供界面展示学习成果） */
export async function listKnowledge(limit = 100): Promise<KnowledgeItem[]> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('regulations')
    .select('id,code,title,category,content,source_url,source,usage_count,last_used_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`读取知识库失败：${error.message}`);
  return (data || []).map((r) => ({
    id: r.id,
    code: r.code || undefined,
    title: r.title,
    category: r.category || undefined,
    excerpt: (r.content || '').slice(0, 300),
    url: r.source_url || undefined,
    source: r.source,
    usage_count: r.usage_count,
    last_used_at: r.last_used_at,
  }));
}
