export type DocRole = 'tender' | 'bid';

export type CheckKind =
  | 'tender_completeness'
  | 'tender_compliance'
  | 'bid_responsiveness'
  | 'bid_similarity'
  | 'bid_collusion';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  tenderer: string | null;
  project_no: string | null;
  created_at: string;
}

export interface BidDocument {
  id: string;
  project_id: string;
  role: DocRole;
  bidder_name: string | null;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  content_text: string | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface CheckRun {
  id: string;
  project_id: string;
  kind: CheckKind;
  status: 'pending' | 'running' | 'done' | 'failed';
  summary: Record<string, unknown>;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export interface Finding {
  id: string;
  run_id: string;
  project_id: string;
  category: string;
  severity: Severity;
  title: string;
  detail: string | null;
  score: number | null;
  evidence: Record<string, unknown>;
  citation: Citation[];
  created_at: string;
}

export interface Citation {
  code?: string;
  title: string;
  category?: string;
  excerpt?: string;
  url?: string;
}

export const CHECK_KIND_LABEL: Record<CheckKind, string> = {
  tender_completeness: '① 招标文件完整性校验',
  tender_compliance: '② 招标文件条款合规性校验',
  bid_responsiveness: '③ 投标响应性核验（招标 ↔ 投标）',
  bid_similarity: '④ 投标文件雷同检测（投标 ↔ 投标）',
  bid_collusion: '⑤ 串标嫌疑识别（投标 ↔ 投标）',
};
