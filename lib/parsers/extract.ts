import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface ExtractResult {
  text: string;
  meta: Record<string, unknown>;
}

export interface DocumentMeta {
  author?: string;
  lastModifiedBy?: string;
  application?: string;
  appVersion?: string;
  company?: string;
  createdDate?: string;
  modifiedDate?: string;
  producer?: string;
  creator?: string;
  title?: string;
  pages?: number;
  [key: string]: unknown;
}

function getExt(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : '';
}

/** 提取文档纯文本与元数据 */
export async function extractDocument(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ExtractResult> {
  const ext = getExt(filename);
  const mime = (mimeType || '').toLowerCase();

  if (ext === 'pdf' || mime === 'application/pdf') {
    return extractPdf(buffer);
  }
  if (ext === 'docx' || mime.includes('wordprocessingml')) {
    return extractDocx(buffer);
  }
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return extractSpreadsheet(buffer, ext);
  }
  if (['txt', 'md', 'json'].includes(ext) || mime.startsWith('text/')) {
    return { text: buffer.toString('utf-8'), meta: {} };
  }
  if (ext === 'doc') {
    // .doc 为二进制格式，尽力而为地提取可见文本
    return { text: buffer.toString('utf-8').replace(/[^\u4e00-\u9fa5A-Za-z0-9，。；：、（）()\s]/g, ' '), meta: {} };
  }

  // 其它未知类型：尝试按 UTF-8 读取
  return { text: buffer.toString('utf-8'), meta: {} };
}

async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const pdfParse = (await import('pdf-parse')).default as unknown as (
    b: Buffer
  ) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
  const data = await pdfParse(buffer);
  const info = (data.info || {}) as Record<string, unknown>;
  const meta: DocumentMeta = {
    author: str(info.Author),
    creator: str(info.Creator),
    producer: str(info.Producer),
    title: str(info.Title),
    createdDate: str(info.CreationDate),
    modifiedDate: str(info.ModDate),
    pages: data.numpages,
  };
  return { text: data.text || '', meta: compact(meta) };
}

async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const result = await mammoth.extractRawText({ buffer });
  let meta: DocumentMeta = {};
  try {
    const zip = await JSZip.loadAsync(buffer);
    const core = zip.file('docProps/core.xml');
    const app = zip.file('docProps/app.xml');
    if (core) {
      const xml = await core.async('text');
      meta.author = pick(xml, 'dc:creator');
      meta.lastModifiedBy = pick(xml, 'cp:lastModifiedBy');
      meta.createdDate = pick(xml, 'dcterms:created');
      meta.modifiedDate = pick(xml, 'dcterms:modified');
    }
    if (app) {
      const xml = await app.async('text');
      meta.application = pick(xml, 'Application');
      meta.appVersion = pick(xml, 'AppVersion');
      meta.company = pick(xml, 'Company');
    }
  } catch {
    // 某些 docx 可能缺少元数据，忽略
  }
  return { text: result.value || '', meta: compact(meta) };
}

function extractSpreadsheet(buffer: Buffer, ext: string): ExtractResult {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellText: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    parts.push(`# 工作表：${name}`);
    parts.push(XLSX.utils.sheet_to_csv(sheet));
  }
  const p = (wb.Props || {}) as Record<string, unknown>;
  const meta: DocumentMeta = {
    title: str(p.Title),
    author: str(p.Author),
    lastModifiedBy: str(p.LastAuthor),
    company: str(p.Company),
    application: str(p.Creator) ? `Excel/${str(p.Creator)}` : 'Excel',
    createdDate: dateStr(p.CreatedDate),
    modifiedDate: dateStr(p.ModifiedDate),
  };
  return { text: parts.join('\n\n'), meta: compact(meta) };
}

function pick(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? decodeXml(m[1]).trim() : undefined;
}

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
}

function dateStr(v: unknown): string | undefined {
  if (v instanceof Date) return v.toISOString();
  return str(v);
}

function compact(obj: DocumentMeta): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}
