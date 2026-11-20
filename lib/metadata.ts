import { getServiceSupabase } from '@/lib/supabase/server';
import type { BidDocument } from '@/lib/types';

/**
 * 串标嫌疑的确定性信号：基于文档元数据与正文中的高度一致项进行比对。
 * 这些信号是「客观事实」，作为 AI 判断的输入依据，避免纯靠模型臆测。
 */

export interface MetaSignal {
  type: string;             // 信号类型
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  docs: string[];           // 涉及的文档/投标人
  evidence: Record<string, unknown>;
}

export interface CollusionSignals {
  bidders: { id: string; name: string; filename: string; meta: Record<string, unknown> }[];
  signals: MetaSignal[];
  contactOverlaps: { kind: string; value: string; docs: string[] }[];
}

const CONTACT_PATTERNS: { kind: string; label: string; re: RegExp }[] = [
  { kind: 'mobile', label: '手机号', re: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  { kind: 'tel', label: '固定电话', re: /(?<!\d)0\d{2,3}-?\d{7,8}(?!\d)/g },
  { kind: 'email', label: '电子邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: 'bank', label: '银行账号', re: /(?<!\d)\d{16,25}(?!\d)/g },
  { kind: 'uscc', label: '统一社会信用代码', re: /(?<!\w)[0-9A-HJ-NPQRTUWXY]{18}(?!\w)/g },
];

/** 从文本中抽取联系方式 / 标识号 */
function extractContacts(text: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const p of CONTACT_PATTERNS) {
    const found = new Set<string>();
    const matches = text.match(p.re);
    if (matches) for (const m of matches) found.add(m);
    if (found.size) out.set(p.kind, found);
  }
  return out;
}

export async function computeCollusionSignals(
  projectId: string
): Promise<CollusionSignals> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('id, bidder_name, filename, meta, content_text')
    .eq('project_id', projectId)
    .eq('role', 'bid');
  if (error) throw new Error(`读取投标文件失败：${error.message}`);

  const docs = (data || []) as Pick<BidDocument, 'id' | 'bidder_name' | 'filename' | 'meta' | 'content_text'>[];

  const bidders = docs.map((d) => ({
    id: d.id,
    name: d.bidder_name || d.filename,
    filename: d.filename,
    meta: (d.meta || {}) as Record<string, unknown>,
  }));

  const signals: MetaSignal[] = [];

  // 1) 元数据字段一致：作者 / 最后修改人 / 公司 / 应用
  const fieldChecks: { key: string; label: string; severity: MetaSignal['severity'] }[] = [
    { key: 'author', label: '文档作者', severity: 'high' },
    { key: 'lastModifiedBy', label: '最后修改人', severity: 'high' },
    { key: 'company', label: '单位/公司', severity: 'high' },
    { key: 'application', label: '创建软件', severity: 'low' },
    { key: 'producer', label: 'PDF 生成器', severity: 'medium' },
    { key: 'creator', label: 'PDF 创建程序', severity: 'medium' },
  ];

  for (const fc of fieldChecks) {
    const groups = new Map<string, string[]>();
    for (const d of docs) {
      const v = d.meta?.[fc.key];
      if (typeof v === 'string' && v.trim()) {
        const key = v.trim();
        const arr = groups.get(key) || [];
        arr.push(d.bidder_name || d.filename);
        groups.set(key, arr);
      }
    }
    for (const [value, who] of groups) {
      if (who.length >= 2) {
        signals.push({
          type: `meta_${fc.key}_same`,
          severity: fc.severity,
          title: `多份投标文件${fc.label}完全相同`,
          detail: `以下投标文件的「${fc.label}」均为「${value}」，存在共用同一文档来源的可能。`,
          docs: who,
          evidence: { field: fc.key, value },
        });
      }
    }
  }

  // 2) 创建/修改时间接近或完全相同
  const times = docs
    .map((d) => ({
      who: d.bidder_name || d.filename,
      created: toTime(d.meta?.createdDate),
      modified: toTime(d.meta?.modifiedDate),
    }))
    .filter((t) => t.created || t.modified);

  for (const t of times) {
    for (const u of times) {
      if (t.who >= u.who) continue;
      if (t.created && u.created && Math.abs(t.created - u.created) < 60_000) {
        signals.push({
          type: 'meta_created_time_close',
          severity: 'medium',
          title: '投标文件创建时间高度接近',
          detail: `「${t.who}」与「${u.who}」的文档创建时间相差不足 1 分钟，可能来自同一批制作。`,
          docs: [t.who, u.who],
          evidence: { createdA: t.created, createdB: u.created },
        });
      }
    }
  }

  // 3) 正文中的联系方式 / 账号重叠
  const contacts = docs.map((d) => ({
    who: d.bidder_name || d.filename,
    map: extractContacts(d.content_text || ''),
  }));

  const contactOverlaps: CollusionSignals['contactOverlaps'] = [];
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      for (const p of CONTACT_PATTERNS) {
        const a = contacts[i].map.get(p.kind);
        const b = contacts[j].map.get(p.kind);
        if (!a || !b) continue;
        for (const v of a) {
          if (b.has(v)) {
            contactOverlaps.push({ kind: p.label, value: v, docs: [contacts[i].who, contacts[j].who] });
          }
        }
      }
    }
  }
  for (const o of contactOverlaps) {
    signals.push({
      type: `contact_overlap_${o.kind}`,
      severity: 'high',
      title: `不同投标文件出现相同的${o.kind}`,
      detail: `「${o.docs[0]}」与「${o.docs[1]}」中出现相同的${o.kind}「${o.value}」，存在关联投标的嫌疑。`,
      docs: o.docs,
      evidence: { kind: o.kind, value: o.value },
    });
  }

  return { bidders, signals, contactOverlaps };
}

function toTime(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isNaN(t) ? null : t;
}
