import { getOpenAI, getLLMModel } from './openai';
import type { Citation, Severity } from '@/lib/types';

const MAX_CHARS = 60000;

function truncate(text: string, max = MAX_CHARS): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max) + '\n\n[……文档过长，后续内容已截断……]';
}

async function jsonChat<T = unknown>(system: string, user: string): Promise<T> {
  const openai = getOpenAI();
  const res = await openai.chat.completions.create({
    model: getLLMModel(),
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const content = res.choices[0]?.message?.content || '{}';
  return JSON.parse(content) as T;
}

/** 把知识库召回的历史法规/案例格式化为提示词片段（扩展搜索的先验参考） */
function knowledgeBlock(prior?: Citation[]): string {
  if (!prior || !prior.length) return '';
  const lines = prior
    .slice(0, 12)
    .map((c, i) => `${i + 1}. ${c.code ? `【${c.code}】` : ''}${c.title}${c.excerpt ? `：${c.excerpt}` : ''}`)
    .join('\n');
  return `\n\n【历史校验积累的法规/案例知识库（供参考，请核验准确性，可据此扩展检索相关条款）】\n${lines}`;
}

/* ------------------------- 招标文件完整性 ------------------------- */

export interface CompletenessSection {
  name: string;
  required: boolean;
  present: boolean;
  note?: string;
}

export interface CompletenessResult {
  score: number;                 // 0-100 完整度评分
  sections: CompletenessSection[];
  missing: { name: string; severity: Severity; reason: string }[];
  summary: string;
}

const COMPLETENESS_CHECKLIST = [
  '招标公告或投标邀请书',
  '投标人须知（含前附表）',
  '评标办法（评分标准与方法）',
  '合同条款及合同格式',
  '采购需求 / 技术规格 / 工程量清单',
  '投标文件格式',
  '资格审查办法 / 合格投标人条件',
  '投标保证金与履约保证金要求',
  '投标有效期与投标截止时间、开标时间地点',
  '否决投标（废标）条款',
  '招标控制价或最高投标限价（如适用）',
  '图纸、技术资料等附件清单',
  '答疑、澄清与修改说明',
];

export async function checkTenderCompleteness(text: string): Promise<CompletenessResult> {
  const system = `你是资深招投标合规审查专家，熟悉《招标投标法》《招标投标法实施条例》《政府采购法》及其实施条例、《评标委员会和评标方法暂行规定》等。
请审查给定的招标文件正文，判断其章节与必备条款是否完整。
必须严格输出 JSON，格式：
{
  "score": 0-100 的完整度评分,
  "sections": [{"name": "章节名", "required": true|false, "present": true|false, "note": "说明"}],
  "missing": [{"name": "缺失或缺漏项", "severity": "info|low|medium|high|critical", "reason": "原因"}],
  "summary": "总体结论（150字内）"
}
要求：逐项核对下列必备章节，name 使用下列同名项；present 依据文件正文实际内容判断，不得臆测。`;

  const user = `【必备章节清单】
${COMPLETENESS_CHECKLIST.map((s, i) => `${i + 1}. ${s}`).join('\n')}

【招标文件正文】
${truncate(text)}`;

  return jsonChat<CompletenessResult>(system, user);
}

/* ------------------------- 招标文件条款合规性 ------------------------- */

export interface ComplianceIssue {
  title: string;
  severity: Severity;
  clause: string;        // 原文片段
  reason: string;        // 违规原因
  suggestion: string;    // 修改建议
  citation: Citation[];
}

export interface ComplianceResult {
  score: number;         // 合规度 0-100
  issues: ComplianceIssue[];
  summary: string;
}

export async function checkTenderCompliance(text: string, priorKnowledge?: Citation[]): Promise<ComplianceResult> {
  const system = `你是资深招投标合规审查专家，依据中华人民共和国现行法律法规审查招标文件条款的合规性。
重点检查以下常见违规：
1. 以不合理条件限制或排斥潜在投标人（指定品牌/原产地/特定专利、地域限制、所有制歧视）；
2. 以特定行业业绩、奖项、资质作为加分或中标条件，且与合同履行无实质关联；
3. 投标保证金超额（工程施工类一般不超过招标控制价的 2%，货物/服务类不超过预算金额的 1%）；
4. 评标标准与方法不明确、评分因素未量化；
5. 将资格审查与评标混同、对投标人设置歧视性门槛；
6. 要求中标人承担不合理的费用或风险；
7. 约定的废标/否决投标条款缺乏依据；
8. 违反公开、公平、公正与诚实信用原则的其他条款。
在此基础上，请主动扩展检索与本项目直接相关的现行法律法规与部门规章，逐条给出准确的法规依据。
必须严格输出 JSON：
{
  "score": 0-100 的合规度评分,
  "issues": [{
    "title": "问题标题",
    "severity": "info|low|medium|high|critical",
    "clause": "涉及的原文片段（须摘自正文，不得编造）",
    "reason": "违规或风险说明",
    "suggestion": "修改建议",
    "citation": [{"code": "法条编号，如《招标投标法》第十八条", "title": "法规名称", "category": "法律|行政法规|部门规章", "excerpt": "相关条文要点"}]
  }],
  "summary": "总体结论（200字内）"
}
注意：citation 只引用你确有把握的现行法律法规条文；无法确定时不要编造条号，可将 code 留空。`;

  const user = `【招标文件正文】
${truncate(text)}${knowledgeBlock(priorKnowledge)}`;

  return jsonChat<ComplianceResult>(system, user);
}

/* --------------------- 法规 / 案例检索智能体 --------------------- */

export interface RegulationSearchResult {
  items: Citation[];
  analysis: string;
}

export async function searchRegulationsAndCases(
  query: string,
  context?: string
): Promise<RegulationSearchResult> {
  const system = `你是招投标法规与案例检索助手。根据用户的问题，检索并整理相关的现行法律法规条文、部门规章以及典型司法/行政案例要点。
必须严格输出 JSON：
{
  "items": [{
    "code": "法条编号",
    "title": "法规名称或案例名称",
    "category": "法律|行政法规|部门规章|地方规定|案例",
    "excerpt": "条文要点或案例裁判要点",
    "url": "可选的权威来源链接"
  }],
  "analysis": "结合问题给出的分析结论"
}
要求：只引用你确有把握的现行法律法规与真实案例，不确定的宁可少列，绝不编造法条编号或案例。`;

  const user = `问题：${query}${context ? `\n\n相关背景：${truncate(context, 8000)}` : ''}`;

  return jsonChat<RegulationSearchResult>(system, user);
}

/* ------------------- 投标响应性核验（招标 ↔ 投标） ------------------- */

export interface ResponsivenessItem {
  requirement: string;   // 招标文件的单条要求（分条拆解）
  category?: string;     // 要求类别：资格/商务/技术/工期/报价/服务等
  clause?: string;       // 招标文件中的对应依据（原文片段）
  responded: boolean;    // 投标文件是否有对应响应
  matched?: string;      // 投标文件中的对应响应内容（原文片段）
  gap?: string;          // 未响应 / 偏离 / 缺漏的具体说明
  severity: Severity;    // 该项不响应的严重程度
}

export interface ResponsivenessNarrative {
  score: number;         // 整体叙述逻辑性评分 0-100
  issues: { title: string; severity: Severity; detail: string }[];
  comment: string;       // 对整体叙述逻辑性（结构、条理、自洽性、前后一致）的评价
}

export interface ResponsivenessResult {
  score: number;         // 响应性综合评分 0-100
  items: ResponsivenessItem[];
  narrative: ResponsivenessNarrative;
  summary: string;
}

export async function checkBidResponsiveness(
  tenderText: string,
  bidText: string,
  bidderName: string,
  priorKnowledge?: Citation[]
): Promise<ResponsivenessResult> {
  const system = `你是资深评标专家，负责核验投标文件对招标文件的响应性与整体叙述逻辑性。请按以下两个层次交叉比对：

【第一层：分条对比（Requirement → Response）】
1) 把招标文件的关键要求逐条拆解为可核验的条目（资格要求、商务要求、技术要求、工期/交付、报价、服务承诺、社保/财务/业绩等）；
2) 到投标文件中逐条查找是否有对应响应；responded=true 时必须给出投标文件中的对应原文（matched），responded=false 或存在偏离时给出 gap 说明；
3) 严格依据文件实际内容，不得臆测；投标文件确实没有的，判为未响应。

【第二层：整体叙述逻辑性对比】
评估投标文件在整体上是否逻辑自洽、结构完整、前后一致，包括：
- 是否覆盖招标文件要求的全部章节与响应格式；
- 技术方案/施工组织/服务方案是否完整、可执行，是否出现自相矛盾或与招标要求冲突；
- 是否出现明显「答非所问」「复制粘贴与项目无关内容」「前后数据/口径不一致」等逻辑性问题。

必须严格输出 JSON：
{
  "score": 0-100 的响应性综合评分,
  "items": [{
    "requirement": "招标文件要求（分条）",
    "category": "资格|商务|技术|工期|报价|服务|其他",
    "clause": "招标文件依据原文片段",
    "responded": true|false,
    "matched": "投标文件对应内容原文（若有）",
    "gap": "未响应或偏离的说明（若 responded=false 或有偏离）",
    "severity": "info|low|medium|high|critical"
  }],
  "narrative": {
    "score": 0-100 的整体叙述逻辑性评分,
    "issues": [{"title": "逻辑性问题标题", "severity": "info|low|medium|high|critical", "detail": "说明"}],
    "comment": "对整体叙述逻辑性的评价（200字内）"
  },
  "summary": "该投标人响应性核验结论（200字内）"
}
注意：severity 应反映对招标实质性要求的偏离程度——影响中标资格或实质性要求的判 high/critical。`;

  const user = `【投标人】${bidderName}

【招标文件正文】
${truncate(tenderText, 45000)}

【投标文件正文】
${truncate(bidText, 45000)}${knowledgeBlock(priorKnowledge)}`;

  return jsonChat<ResponsivenessResult>(system, user);
}

/* ------------------------- 串标嫌疑研判 ------------------------- */

export interface CollusionIndicator {
  title: string;
  severity: Severity;
  detail: string;
  docs: string[];
}

export interface CollusionResult {
  riskScore: number;     // 0-100 风险分
  level: '低' | '中' | '高';
  indicators: CollusionIndicator[];
  citations: Citation[]; // 引用的法律法规与典型案例
  conclusion: string;
}

export async function reasonCollusion(payload: {
  bidders: { name: string; meta: Record<string, unknown> }[];
  signals: { type: string; severity: string; title: string; detail: string; docs: string[] }[];
  similarPairs: {
    a: { name: string };
    b: { name: string };
    overall: number;
    duplicateRatio: number;
    sampleParagraphs: { aText: string; bText: string; score: number }[];
  }[];
  priorKnowledge?: Citation[];
}): Promise<CollusionResult> {
  const system = `你是招投标围标串标行为研判专家。基于给定的客观信号（元数据一致性、联系方式重叠、文本雷同），研判是否存在串通投标（围标/串标）嫌疑。
要求：
1) 逐一分析客观信号与文本雷同，给出嫌疑点，并说明其法律意义；
2) 引用与串通投标相关的现行法律法规条文（如《招标投标法》第三十二条、第五十三条，《招标投标法实施条例》第三十九条、第四十条等），以及现实中的典型查处/司法案例要点，作为研判依据；
3) 明确区分「客观事实」与「推断」，不得臆造证据；证据不足时给出低风险结论并说明局限。
必须严格输出 JSON：
{
  "riskScore": 0-100 的综合风险分,
  "level": "低|中|高",
  "indicators": [{"title": "嫌疑点", "severity": "info|low|medium|high|critical", "detail": "结合证据与法律的说明", "docs": ["涉及的投标人"]}],
  "citations": [{"code": "法条编号或案例编号", "title": "法规名称或案例名称", "category": "法律|行政法规|部门规章|案例", "excerpt": "条文要点或裁判要点", "url": "可选权威来源链接"}],
  "conclusion": "综合研判结论与建议（200字内）"
}
注意：citations 只引用你确有把握的现行法律法规与真实案例，不确定的宁可少列，绝不编造条号或案例。`;

  const user = `【投标人及其文档元数据】
${JSON.stringify(payload.bidders, null, 2)}

【客观信号】
${JSON.stringify(payload.signals, null, 2)}

【文本雷同分析】
${JSON.stringify(payload.similarPairs, null, 2)}${knowledgeBlock(payload.priorKnowledge)}`;

  return jsonChat<CollusionResult>(system, user);
}

/* --------------------- 项目汇总分析报告 --------------------- */

export interface ReportSection {
  heading: string;
  content: string;
  citations?: Citation[];
}

export interface ReportKeyIssue {
  title: string;
  severity: Severity;
  detail: string;
  citation?: Citation[];
}

export interface AnalysisReport {
  title: string;
  overallRisk: '低' | '中' | '高';
  overview: string;
  overallConclusion: string;
  sections: ReportSection[];
  keyIssues: ReportKeyIssue[];
  recommendations: string[];
  disclaimer: string;
}

export async function writeAnalysisReport(payload: {
  project: { name: string; tenderer?: string | null; project_no?: string | null; description?: string | null };
  documents: { tenderCount: number; bidderCount: number; bidders: string[]; tenderFiles: string[] };
  runs: {
    kind: string;
    status: string;
    summary: Record<string, unknown>;
    findings: {
      category: string;
      severity: string;
      title: string;
      detail?: string | null;
      score?: number | null;
      citation?: Citation[];
    }[];
  }[];
  priorKnowledge?: Citation[];
}): Promise<AnalysisReport> {
  const system = `你是招投标合规与评标分析报告撰写专家（资深评标专家 + 法律顾问）。请依据给定的项目信息、各维度校验结论与问题清单，撰写一份结构完整、论证充分的《招标投标文件智能校验分析报告》。

要求：
1) 语言专业、客观、条理清晰，面向招标人 / 招标代理机构阅读；
2) 报告须分维度展开：招标文件完整性、招标文件条款合规性、投标响应性（招标↔投标）、投标文件雷同（投标↔投标）、串标嫌疑（投标↔投标）。每个维度都要给出：结论、关键证据、潜在影响；
3) 【重要】涉及合规性、响应性、串标判断时，尽量引用现行法律法规条文（如《招标投标法》《招标投标法实施条例》《政府采购法》等）与现实中的典型查处 / 司法案例要点，以辅助阅读者理解判断依据；引用必须真实准确，不确定的宁可留空，绝不编造条号或案例；
4) 给出总体风险等级（低/中/高）并说明分级理由，提出可操作的整改与处理建议；
5) 严格区分「客观事实」与「分析推断」，不得臆造材料中没有的事实。

必须严格输出 JSON：
{
  "title": "报告标题（含项目名称）",
  "overallRisk": "低|中|高",
  "overview": "项目概况与校验范围概述（300字内）",
  "overallConclusion": "总体结论（400字内）",
  "sections": [{
    "heading": "章节标题，如：一、招标文件完整性分析",
    "content": "该维度的详细分析（依据结论与证据展开，300-800字）",
    "citations": [{"code":"法条编号","title":"法规名称或案例名称","category":"法律|行政法规|部门规章|案例","excerpt":"条文要点或裁判要点"}]
  }],
  "keyIssues": [{"title":"关键问题","severity":"info|low|medium|high|critical","detail":"问题说明与依据","citation":[{"code":"","title":"","category":"","excerpt":""}]}],
  "recommendations": ["整改 / 处理建议1", "建议2"],
  "disclaimer": "免责声明：本报告由智能体辅助生成，供决策参考，最终以人工复核为准。"
}`;

  const user = `【项目信息】
${JSON.stringify(payload.project, null, 2)}

【文档情况】
${JSON.stringify(payload.documents, null, 2)}

【各维度校验结论与问题清单】
${JSON.stringify(payload.runs, null, 2)}${knowledgeBlock(payload.priorKnowledge)}`;

  return jsonChat<AnalysisReport>(system, user);
}
