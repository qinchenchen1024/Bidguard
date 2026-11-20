import { getServiceSupabase } from '@/lib/supabase/server';
import { hasLLM } from '@/lib/ai/openai';
import {
  checkTenderCompleteness,
  checkTenderCompliance,
  checkBidResponsiveness,
  reasonCollusion,
  type CompletenessResult,
  type ComplianceResult,
  type ResponsivenessResult,
  type CollusionResult,
} from '@/lib/ai/agents';
import { analyzeSimilarity, type DocText, type SimilarityReport } from '@/lib/similarity';
import { computeCollusionSignals, type CollusionSignals } from '@/lib/metadata';
import { recallKnowledge, learnFromCitations } from '@/lib/knowledge';
import type { CheckKind, CheckRun, Citation, Severity } from '@/lib/types';

interface NewFinding {
  category: string;
  severity: Severity;
  title: string;
  detail?: string;
  score?: number;
  evidence?: Record<string, unknown>;
  citation?: unknown[];
}

/** 执行一次校验任务：写入 check_runs 与 findings */
export async function runCheck(projectId: string, kind: CheckKind): Promise<CheckRun> {
  const supabase = getServiceSupabase();

  const { data: run, error: runErr } = await supabase
    .from('check_runs')
    .insert({ project_id: projectId, kind, status: 'running' })
    .select('*')
    .single();
  if (runErr || !run) throw new Error(`创建校验任务失败：${runErr?.message}`);

  try {
    let findings: NewFinding[] = [];
    let summary: Record<string, unknown> = {};

    if (kind === 'tender_completeness') {
      const res = await runTenderCompleteness(projectId);
      findings = res.findings;
      summary = res.summary;
    } else if (kind === 'tender_compliance') {
      const res = await runTenderCompliance(projectId);
      findings = res.findings;
      summary = res.summary;
    } else if (kind === 'bid_responsiveness') {
      const res = await runBidResponsiveness(projectId);
      findings = res.findings;
      summary = res.summary;
    } else if (kind === 'bid_similarity') {
      const res = await runBidSimilarity(projectId);
      findings = res.findings;
      summary = res.summary;
    } else if (kind === 'bid_collusion') {
      const res = await runBidCollusion(projectId);
      findings = res.findings;
      summary = res.summary;
    }

    if (findings.length) {
      const rows = findings.map((f) => ({
        run_id: run.id,
        project_id: projectId,
        category: f.category,
        severity: f.severity,
        title: f.title,
        detail: f.detail ?? null,
        score: f.score ?? null,
        evidence: f.evidence ?? {},
        citation: f.citation ?? [],
      }));
      const { error: fErr } = await supabase.from('findings').insert(rows);
      if (fErr) throw new Error(`写入校验结果失败：${fErr.message}`);
    }

    const { data: updated } = await supabase
      .from('check_runs')
      .update({ status: 'done', summary, finished_at: new Date().toISOString() })
      .eq('id', run.id)
      .select('*')
      .single();

    return (updated || { ...run, status: 'done', summary }) as CheckRun;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase
      .from('check_runs')
      .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
      .eq('id', run.id);
    throw new Error(message);
  }
}

async function loadDocs(projectId: string, role: 'tender' | 'bid') {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, bidder_name, content_text, meta')
    .eq('project_id', projectId)
    .eq('role', role);
  if (error) throw new Error(`读取文档失败：${error.message}`);
  return data || [];
}

/* ------------------------ 招标文件完整性 ------------------------ */

async function runTenderCompleteness(projectId: string) {
  if (!hasLLM()) {
    throw new Error('未配置大模型：请点击右上角「模型设置」填写 API Key / Base URL / 模型名（可选用本地 Ollama），或在 .env 中配置默认模型。');
  }
  const docs = await loadDocs(projectId, 'tender');
  if (!docs.length) throw new Error('尚未上传招标文件');

  const text = docs.map((d) => d.content_text || '').join('\n\n');
  const res: CompletenessResult = await checkTenderCompleteness(text);

  const findings: NewFinding[] = [];
  findings.push({
    category: 'completeness_summary',
    severity: scoreSeverity(res.score),
    title: `招标文件完整度评分：${res.score} 分`,
    detail: res.summary,
    score: res.score,
    evidence: { sections: res.sections },
  });
  for (const m of res.missing || []) {
    findings.push({
      category: 'completeness_missing',
      severity: normalizeSeverity(m.severity),
      title: `缺失/缺漏：${m.name}`,
      detail: m.reason,
      evidence: { name: m.name },
    });
  }
  return { findings, summary: { score: res.score, missingCount: (res.missing || []).length, summary: res.summary } };
}

/* ------------------------ 招标文件合规性 ------------------------ */

async function runTenderCompliance(projectId: string) {
  if (!hasLLM()) {
    throw new Error('未配置大模型：请点击右上角「模型设置」填写 API Key / Base URL / 模型名（可选用本地 Ollama），或在 .env 中配置默认模型。');
  }
  const docs = await loadDocs(projectId, 'tender');
  if (!docs.length) throw new Error('尚未上传招标文件');

  const text = docs.map((d) => d.content_text || '').join('\n\n');
  const priorKnowledge = await recallKnowledge(text.slice(0, 6000)).catch(() => []);
  const res: ComplianceResult = await checkTenderCompliance(text, priorKnowledge);

  const findings: NewFinding[] = [];
  findings.push({
    category: 'compliance_summary',
    severity: scoreSeverity(res.score),
    title: `条款合规度评分：${res.score} 分`,
    detail: res.summary,
    score: res.score,
    evidence: { issueCount: (res.issues || []).length },
  });
  for (const it of res.issues || []) {
    findings.push({
      category: 'compliance_issue',
      severity: normalizeSeverity(it.severity),
      title: it.title,
      detail: `${it.reason}\n\n修改建议：${it.suggestion}`,
      evidence: { clause: it.clause },
      citation: it.citation || [],
    });
  }
  // 自我学习：把本次检索/引用的法规案例沉淀入知识库，供后续复用
  const learned = await learnFromCitations(
    (res.issues || []).flatMap((it) => it.citation || []),
    'tender_compliance'
  ).catch(() => 0);
  return {
    findings,
    summary: { score: res.score, issueCount: (res.issues || []).length, learned, summary: res.summary },
  };
}

/* ----------------- 投标响应性核验（招标 ↔ 投标） ----------------- */

async function runBidResponsiveness(projectId: string) {
  if (!hasLLM()) {
    throw new Error('未配置大模型：请点击右上角「模型设置」填写 API Key / Base URL / 模型名（可选用本地 Ollama），或在 .env 中配置默认模型。');
  }
  const tenderDocs = await loadDocs(projectId, 'tender');
  if (!tenderDocs.length) throw new Error('尚未上传招标文件');
  const bidDocs = await loadDocs(projectId, 'bid');
  if (!bidDocs.length) throw new Error('尚未上传投标文件');

  const tenderText = tenderDocs.map((d) => d.content_text || '').join('\n\n');
  const priorKnowledge = await recallKnowledge(tenderText.slice(0, 6000)).catch(() => []);

  const findings: NewFinding[] = [];
  const perBidder: Record<string, unknown>[] = [];

  for (const b of bidDocs) {
    const name = b.bidder_name || b.filename;
    const res: ResponsivenessResult = await checkBidResponsiveness(
      tenderText,
      b.content_text || '',
      name,
      priorKnowledge
    );

    const items = res.items || [];
    const gapItems = items.filter((it) => !it.responded || it.severity === 'high' || it.severity === 'critical');

    // 每个投标人一条汇总（含分条对比明细与整体叙述逻辑性评价）
    findings.push({
      category: 'responsiveness_summary',
      severity: scoreSeverity(res.score),
      title: `「${name}」投标响应性评分：${res.score} 分`,
      detail: `${res.summary}\n\n整体叙述逻辑性评分：${res.narrative?.score ?? '-'} 分。${res.narrative?.comment || ''}`,
      score: res.score,
      evidence: { bidder: name, items, narrative: res.narrative },
    });

    // 分条对比：未响应 / 重大偏离项
    for (const it of gapItems) {
      findings.push({
        category: 'responsiveness_gap',
        severity: normalizeSeverity(it.severity),
        title: `「${name}」${it.responded ? '偏离' : '未响应'}：${it.requirement.slice(0, 40)}`,
        detail: it.gap || (it.responded ? '存在偏离' : '投标文件未见对应响应'),
        evidence: {
          bidder: name,
          category: it.category,
          requirement: it.requirement,
          clause: it.clause,
          matched: it.matched,
        },
      });
    }

    // 整体叙述逻辑性问题
    for (const iss of res.narrative?.issues || []) {
      findings.push({
        category: 'responsiveness_narrative',
        severity: normalizeSeverity(iss.severity),
        title: `「${name}」叙述逻辑性问题：${iss.title}`,
        detail: iss.detail,
        evidence: { bidder: name },
      });
    }

    perBidder.push({
      bidder: name,
      score: res.score,
      narrativeScore: res.narrative?.score ?? null,
      itemCount: items.length,
      gapCount: items.filter((it) => !it.responded).length,
    });
  }

  return {
    findings,
    summary: { bidderCount: bidDocs.length, perBidder },
  };
}

/* ------------------------ 投标文件雷同检测 ------------------------ */

async function runBidSimilarity(projectId: string) {
  const docs = await loadDocs(projectId, 'bid');
  if (docs.length < 2) throw new Error('投标文件少于 2 份，无法进行对比分析');

  const docTexts: DocText[] = docs.map((d) => ({
    id: d.id,
    name: d.bidder_name || d.filename,
    text: d.content_text || '',
  }));
  const report: SimilarityReport = analyzeSimilarity(docTexts);

  const findings: NewFinding[] = [];
  for (const p of report.pairs) {
    const severity: Severity =
      p.overall >= 0.6 || p.duplicateRatio >= 0.5
        ? 'high'
        : p.overall >= 0.4 || p.duplicateRatio >= 0.3
        ? 'medium'
        : 'low';
    findings.push({
      category: 'similarity_pair',
      severity,
      title: `「${p.a.name}」与「${p.b.name}」文本相似度 ${(p.overall * 100).toFixed(1)}%`,
      detail: `整体相似度 ${(p.overall * 100).toFixed(1)}%，包含度 ${(p.containment * 100).toFixed(
        1
      )}%，检出雷同段落 ${p.duplicateParagraphs.length} 处，雷同段落占比约 ${(p.duplicateRatio * 100).toFixed(1)}%。`,
      score: Number((p.overall * 100).toFixed(1)),
      evidence: {
        a: p.a,
        b: p.b,
        duplicateRatio: p.duplicateRatio,
        duplicateParagraphs: p.duplicateParagraphs.slice(0, 20),
      },
    });
  }

  if (!findings.length) {
    findings.push({
      category: 'similarity_pair',
      severity: 'info',
      title: '未发现明显雷同',
      detail: `所有投标文件两两相似度均低于阈值 ${report.threshold}。`,
      evidence: { matrix: report.matrix, docs: report.docs },
    });
  }

  return {
    findings,
    summary: {
      docCount: docs.length,
      pairCount: report.pairs.length,
      maxSimilarity: report.pairs[0]?.overall ?? 0,
      matrix: report.matrix,
      docs: report.docs,
    },
  };
}

/* ------------------------ 串标嫌疑识别 ------------------------ */

async function runBidCollusion(projectId: string) {
  const docs = await loadDocs(projectId, 'bid');
  if (docs.length < 2) throw new Error('投标文件少于 2 份，无法进行串标嫌疑分析');

  const signals: CollusionSignals = await computeCollusionSignals(projectId);

  const docTexts: DocText[] = docs.map((d) => ({
    id: d.id,
    name: d.bidder_name || d.filename,
    text: d.content_text || '',
  }));
  const report = analyzeSimilarity(docTexts);

  const findings: NewFinding[] = [];
  for (const s of signals.signals) {
    findings.push({
      category: `collusion_${s.type}`,
      severity: normalizeSeverity(s.severity),
      title: s.title,
      detail: s.detail,
      evidence: { docs: s.docs, ...s.evidence },
    });
  }

  let summary: Record<string, unknown> = {
    signalCount: signals.signals.length,
    bidderCount: signals.bidders.length,
  };

  if (hasLLM()) {
    const similarPairs = report.pairs.map((p) => ({
      a: { name: p.a.name },
      b: { name: p.b.name },
      overall: p.overall,
      duplicateRatio: p.duplicateRatio,
      sampleParagraphs: p.duplicateParagraphs.slice(0, 5).map((d) => ({
        aText: d.aText.slice(0, 120),
        bText: d.bText.slice(0, 120),
        score: d.score,
      })),
    }));
    const priorKnowledge = await recallKnowledge(
      `串通投标 围标 串标 投标文件雷同 ${signals.signals.map((s) => s.title).join(' ')}`
    ).catch(() => []);
    const result: CollusionResult = await reasonCollusion({
      bidders: signals.bidders.map((b) => ({ name: b.name, meta: b.meta })),
      signals: signals.signals,
      similarPairs,
      priorKnowledge,
    });

    findings.unshift({
      category: 'collusion_summary',
      severity: riskToSeverity(result.riskScore),
      title: `串标风险评分：${result.riskScore} 分（${result.level}）`,
      detail: result.conclusion,
      score: result.riskScore,
      evidence: { indicators: result.indicators, level: result.level },
      citation: result.citations || [],
    });
    for (const ind of result.indicators || []) {
      findings.push({
        category: 'collusion_indicator',
        severity: normalizeSeverity(ind.severity),
        title: ind.title,
        detail: ind.detail,
        evidence: { docs: ind.docs },
      });
    }
    // 自我学习：沉淀串标研判引用的法规与案例
    const learned = await learnFromCitations(result.citations || [], 'bid_collusion').catch(() => 0);
    summary = { ...summary, riskScore: result.riskScore, level: result.level, learned };
  } else {
    findings.unshift({
      category: 'collusion_summary',
      severity: signals.signals.length ? 'medium' : 'info',
      title: `串标客观信号 ${signals.signals.length} 项`,
      detail: '未配置大模型密钥，仅输出确定性信号（元数据一致性、联系方式重叠）。配置 DEEPSEEK_API_KEY 后可获得 AI 综合研判。',
      evidence: {},
    });
    summary = { ...summary, note: 'no_llm' };
  }

  return { findings, summary };
}

/* ------------------------------ 工具 ------------------------------ */

function normalizeSeverity(s: string): Severity {
  const v = (s || '').toLowerCase();
  if (['info', 'low', 'medium', 'high', 'critical'].includes(v)) return v as Severity;
  return 'info';
}

function scoreSeverity(score: number): Severity {
  if (score >= 85) return 'info';
  if (score >= 70) return 'low';
  if (score >= 50) return 'medium';
  if (score >= 30) return 'high';
  return 'critical';
}

function riskToSeverity(score: number): Severity {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 30) return 'medium';
  if (score >= 15) return 'low';
  return 'info';
}
