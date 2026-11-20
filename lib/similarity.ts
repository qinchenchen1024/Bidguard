/**
 * 文本相似度工具：用于投标文件之间的雷同检测。
 * 采用「字符 n-gram 集合 + Jaccard / 包含度」的确定性算法，
 * 不依赖 LLM，速度快、可复现，适合定位雷同段落。
 */

/** 归一化：去空白、去标点噪声、统一半角 */
export function normalize(text: string): string {
  return text
    .replace(/\r/g, '')
    .replace(/[ \t\u3000]+/g, '')
    .replace(/[，。；：！？、"'（）《》【】()<>.,;:!?"'\[\]]/g, '')
    .toLowerCase();
}

/** 按段落切分（空行 / 换行 / 中英文句末标点） */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\r\n\r\n|\n(?=\s*[（(【\[]?\d+[）).、])|\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 15); // 过滤过短片段，避免噪声
}

/** 生成字符 n-gram 集合 */
export function charShingles(text: string, k = 5): Set<string> {
  const s = normalize(text);
  const grams = new Set<string>();
  if (s.length < k) {
    if (s.length) grams.add(s);
    return grams;
  }
  for (let i = 0; i + k <= s.length; i++) {
    grams.add(s.slice(i, i + k));
  }
  return grams;
}

/** Jaccard 相似度 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const g of small) if (large.has(g)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 包含度（重叠系数）：衡量较短文本有多少比例出现在较长文本中。
 * 对「整段抄袭」场景比 Jaccard 更敏感。
 */
export function containment(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const g of small) if (large.has(g)) inter++;
  return inter / small.size;
}

/** 文本整体相似度（0-1），取 Jaccard 与包含度的加权 */
export function textSimilarity(a: string, b: string): number {
  const sa = charShingles(a);
  const sb = charShingles(b);
  const j = jaccard(sa, sb);
  const c = containment(sa, sb);
  return Math.max(j, c * 0.85);
}

export interface ParagraphMatch {
  aIndex: number;
  bIndex: number;
  aText: string;
  bText: string;
  score: number;
}

/** 找出两份文档间雷同的段落对 */
export function findDuplicateParagraphs(
  textA: string,
  textB: string,
  threshold = 0.62
): ParagraphMatch[] {
  const pa = splitParagraphs(textA);
  const pb = splitParagraphs(textB);
  const gramsA = pa.map((p) => charShingles(p));
  const gramsB = pb.map((p) => charShingles(p));

  const matches: ParagraphMatch[] = [];
  for (let i = 0; i < pa.length; i++) {
    let best = { score: 0, j: -1 };
    for (let j = 0; j < pb.length; j++) {
      const s = Math.max(jaccard(gramsA[i], gramsB[j]), containment(gramsA[i], gramsB[j]) * 0.9);
      if (s > best.score) best = { score: s, j };
    }
    if (best.j >= 0 && best.score >= threshold) {
      matches.push({
        aIndex: i,
        bIndex: best.j,
        aText: pa[i],
        bText: pb[best.j],
        score: Number(best.score.toFixed(4)),
      });
    }
  }
  return matches.sort((x, y) => y.score - x.score);
}

export interface DocText {
  id: string;
  name: string;
  text: string;
}

export interface PairResult {
  a: { id: string; name: string };
  b: { id: string; name: string };
  overall: number;                 // 整体相似度 0-1
  containment: number;             // 包含度 0-1
  duplicateParagraphs: ParagraphMatch[];
  duplicateRatio: number;          // 雷同段落占较短文档比例
}

export interface SimilarityReport {
  docs: { id: string; name: string }[];
  matrix: number[][];              // 两两整体相似度
  pairs: PairResult[];             // 有嫌疑的文档对（按相似度降序）
  threshold: number;
}

/** 两两文档相似度分析 */
export function analyzeSimilarity(docs: DocText[], threshold = 0.25): SimilarityReport {
  const n = docs.length;
  const grams = docs.map((d) => charShingles(d.text));
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const pairs: PairResult[] = [];

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const jac = jaccard(grams[i], grams[j]);
      const con = containment(grams[i], grams[j]);
      const overall = Math.max(jac, con * 0.85);
      matrix[i][j] = Number(overall.toFixed(4));
      matrix[j][i] = matrix[i][j];

      if (overall >= threshold) {
        const dup = findDuplicateParagraphs(docs[i].text, docs[j].text);
        const shorterLen = Math.min(splitParagraphs(docs[i].text).length, splitParagraphs(docs[j].text).length) || 1;
        pairs.push({
          a: { id: docs[i].id, name: docs[i].name },
          b: { id: docs[j].id, name: docs[j].name },
          overall: Number(overall.toFixed(4)),
          containment: Number(con.toFixed(4)),
          duplicateParagraphs: dup.slice(0, 30),
          duplicateRatio: Number((dup.length / shorterLen).toFixed(4)),
        });
      }
    }
  }

  pairs.sort((x, y) => y.overall - x.overall);
  return {
    docs: docs.map((d) => ({ id: d.id, name: d.name })),
    matrix,
    pairs,
    threshold,
  };
}
