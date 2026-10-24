// 纯函数：分页解析、中文换行（标点避头尾）、字号自适应、超长自动续页、大模型结果解析。
// 不依赖界面和画布；量字宽的函数从外面传进来，测试里用等宽的假函数。

/** 量一段文字在某个字号下的宽度（像素） */
export type MeasureAt = (size: number) => (text: string) => number;

export interface Page {
  /** 小标题，没有时为空字符串 */
  heading: string;
  /** 正文段落（已去掉首尾空行） */
  paras: string[];
}
export interface Deck {
  title: string;
  subtitle: string;
  pages: Page[];
}

// ---------- 分页解析 ----------

/** 分隔行：一行里只有 3 个以上的 - 、— 或 =（允许前后空格） */
const SEP = /^\s*(?:-{3,}|—{2,}|={3,})\s*$/;

/**
 * 把编辑框里的文字拆成卡片：用单独一行「---」分页。
 * 第一块是封面：第一行是大标题，其余是副标题；后面每块一页：有两行以上时第一行是小标题。
 * 整段没有「---」时，第一行当封面标题，之后按空行分页。
 */
export function parseDeck(text: string): Deck {
  const norm = text.replace(/\r\n?/g, '\n');
  const lines = norm.split('\n');
  let blocks: string[][];
  if (lines.some((l) => SEP.test(l))) {
    blocks = [[]];
    for (const l of lines) {
      if (SEP.test(l)) blocks.push([]);
      else blocks[blocks.length - 1].push(l);
    }
  } else {
    const [first = '', ...rest] = trimLines(lines);
    blocks = [[first]];
    let cur: string[] = [];
    for (const l of rest) {
      if (l.trim() === '') {
        if (cur.length) blocks.push(cur);
        cur = [];
      } else cur.push(l);
    }
    if (cur.length) blocks.push(cur);
  }
  const clean = blocks.map(trimLines);
  const cover = clean[0] ?? [];
  const nonEmpty = cover.filter((l) => l.trim());
  const pages: Page[] = clean
    .slice(1)
    .filter((b) => b.length)
    .map((b) => {
      const body = b.length >= 2 ? b.slice(1) : b;
      return { heading: b.length >= 2 ? b[0].trim() : '', paras: toParas(body) };
    });
  return { title: (nonEmpty[0] ?? '').trim(), subtitle: nonEmpty.slice(1).map((l) => l.trim()).join('\n'), pages };
}

function trimLines(lines: string[]): string[] {
  let a = 0;
  let b = lines.length;
  while (a < b && !lines[a].trim()) a++;
  while (b > a && !lines[b - 1].trim()) b--;
  return lines.slice(a, b);
}

/** 正文：每个非空行是一段；连续空行只算一次段落间隔 */
function toParas(lines: string[]): string[] {
  return lines.map((l) => l.trim()).filter(Boolean);
}

/** 把卡片内容写回编辑框格式（AI 拆分后填进编辑框，方便用户继续改） */
export function deckToText(d: Deck): string {
  const head = [d.title, d.subtitle].filter(Boolean).join('\n');
  return [head, ...d.pages.map((p) => [p.heading, ...p.paras].filter(Boolean).join('\n'))].join('\n---\n');
}

// ---------- 换行 ----------

/** 不能出现在行首的标点 */
const NO_START = new Set([...'，。、；：？！）》」』】〉’”…—～·,.;:?!)]}%‰']);
/** 不能出现在行尾的标点 */
const NO_END = new Set([...'（《「『【〈‘“([{']);

/** 切成不可再分的小块：汉字、标点、emoji 各算一块，连续的英文字母 / 数字（连同后面的空格）算一块 */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const re = /[A-Za-z0-9@#&_'’\-+./:%]+\s*|\s+|\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*|[\s\S]/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[0]);
  return out;
}

/**
 * 按宽度换行：中文逐字断开，英文单词不拆（单词比整行还宽时才按字母拆），
 * 标点避头尾（逗号句号等不出现在行首，左括号引号不出现在行尾）。
 */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number, preferSpace = false): string[] {
  const tokens: string[] = [];
  for (const t of tokenize(text)) {
    if (t.length > 1 && measure(t.trimEnd()) > maxWidth) tokens.push(...Array.from(t));
    else tokens.push(t);
  }
  const lines: string[][] = [];
  let cur: string[] = [];
  const width = (ts: string[]) => measure(ts.join('').trimEnd());
  for (const t of tokens) {
    if (!cur.length && /^\s+$/.test(t)) continue;
    if (!cur.length || width([...cur, t]) <= maxWidth) {
      cur.push(t);
      continue;
    }
    if (/^\s+$/.test(t)) {
      lines.push(cur);
      cur = [];
      continue;
    }
    // 放不下：处理避头尾
    let carry: string[] = [];
    if (NO_START.has(t.trim()[0] ?? '') && cur.length > 1) {
      // 行首不能是这个标点：把上一行最后一块一起带下去
      carry = [cur.pop()!];
    }
    while (cur.length > 1 && NO_END.has(cur[cur.length - 1].trim().slice(-1))) carry.unshift(cur.pop()!);
    if (preferSpace && !carry.length) {
      // 标题：行的后半段有空格时在空格处断开，避免把「15 分钟」拆成「15 分 / 钟」
      let sp = cur.length - 2;
      while (sp >= cur.length / 2 && !/\s$/.test(cur[sp])) sp--;
      if (sp >= cur.length / 2) carry = cur.splice(sp + 1);
    }
    lines.push(cur);
    cur = [...carry, t];
    // 带下来的内容加上当前块仍然太宽（极端情况）：直接接受，下一轮会继续断开
  }
  if (cur.length) lines.push(cur);
  return lines.map((ts) => ts.join('').trimEnd()).filter((l, _i, a) => l !== '' || a.length === 1);
}

// ---------- 正文排版与字号自适应 ----------

export interface Line {
  text: string;
  /** 段落第一行（用于画项目符号、加段落间距） */
  first: boolean;
  /** 项目符号段落：整段向右缩进 */
  bullet: boolean;
}
export interface Laid {
  size: number;
  lines: Line[];
  height: number;
}
export interface BodyOpts {
  maxSize: number;
  minSize: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 段落间距（字号的倍数） */
  paraGap: number;
}
export const BODY: BodyOpts = { maxSize: 56, minSize: 34, lineHeight: 1.62, paraGap: 0.62 };

const BULLET = /^(?:[-*•·]\s+|[-*•·](?=\S))/;
/** 项目符号缩进（字号的倍数） */
export const BULLET_INDENT = 1.15;

/** 段落开头是「- 」「• 」之类时视为项目符号，返回去掉符号后的文字 */
export function bulletOf(p: string): { bullet: boolean; text: string } {
  return BULLET.test(p) ? { bullet: true, text: p.replace(BULLET, '') } : { bullet: false, text: p };
}

/** 按某个字号把所有段落排成行 */
export function layoutAt(paras: string[], width: number, size: number, measureAt: MeasureAt, o: BodyOpts = BODY): Laid {
  const m = measureAt(size);
  const lines: Line[] = [];
  for (const p of paras) {
    const b = bulletOf(p);
    const w = b.bullet ? width - size * BULLET_INDENT : width;
    wrapText(b.text, w, m).forEach((text, i) => lines.push({ text, first: i === 0, bullet: b.bullet }));
  }
  return { size, lines, height: blockHeight(lines, size, o) };
}

export function blockHeight(lines: Line[], size: number, o: BodyOpts = BODY): number {
  if (!lines.length) return 0;
  const paraBreaks = lines.filter((l, i) => l.first && i > 0).length;
  return lines.length * size * o.lineHeight + paraBreaks * size * o.paraGap;
}

/** 在 [minSize, maxSize] 里找能放进 height 的最大字号（每 2 像素一档）；最小字号也放不下时 fits=false */
export function fitBody(paras: string[], width: number, height: number, measureAt: MeasureAt, o: BodyOpts = BODY): Laid & { fits: boolean } {
  for (let s = o.maxSize; s >= o.minSize; s -= 2) {
    const laid = layoutAt(paras, width, s, measureAt, o);
    if (laid.height <= height) return { ...laid, fits: true };
  }
  return { ...layoutAt(paras, width, o.minSize, measureAt, o), fits: false };
}

/**
 * 一页放不下时按最小字号拆成多页（续页），每页尽量放满；段落中间也可以断开。
 * 返回每页的排版结果，至少一页。
 */
export function paginateBody(paras: string[], width: number, height: number, measureAt: MeasureAt, o: BodyOpts = BODY): Laid[] {
  const fit = fitBody(paras, width, height, measureAt, o);
  if (fit.fits) return [{ size: fit.size, lines: fit.lines, height: fit.height }];
  const size = o.minSize;
  // 按段落装页：放不下的段落整段挪到下一页；只有一整页都放不下的超长段落才在段内断开
  const paras2: Line[][] = [];
  for (const line of fit.lines) {
    if (line.first || !paras2.length) paras2.push([]);
    paras2[paras2.length - 1].push(line);
  }
  const pages: Laid[] = [];
  let cur: Line[] = [];
  const flush = () => {
    if (cur.length) pages.push({ size, lines: cur, height: blockHeight(cur, size, o) });
    cur = [];
  };
  for (const para of paras2) {
    if (blockHeight([...cur, ...para], size, o) <= height) {
      cur.push(...para);
      continue;
    }
    if (cur.length && blockHeight(para, size, o) <= height) {
      flush();
      cur.push(...para);
      continue;
    }
    for (const line of para) {
      if (cur.length && blockHeight([...cur, line], size, o) > height) flush();
      cur.push(line);
    }
  }
  flush();
  return pages;
}

/** 标题类：在字号范围内找能放进 maxLines 行的最大字号；仍放不下时截断，最后一行末尾加「…」 */
export function fitTitle(text: string, width: number, maxLines: number, maxSize: number, minSize: number, measureAt: MeasureAt): { size: number; lines: string[] } {
  if (!text.trim()) return { size: maxSize, lines: [] };
  for (let s = maxSize; s >= minSize; s -= 4) {
    const lines = text.split('\n').flatMap((t) => wrapText(t, width, measureAt(s), true));
    if (lines.length <= maxLines) return { size: s, lines };
  }
  const m = measureAt(minSize);
  const lines = text.split('\n').flatMap((t) => wrapText(t, width, m)).slice(0, maxLines);
  let last = lines[maxLines - 1];
  while (last && m(last + '…') > width) last = Array.from(last).slice(0, -1).join('');
  lines[maxLines - 1] = (last ?? '') + '…';
  return { size: minSize, lines };
}

// ---------- 大模型 ----------

export const MIN_PAGES = 5;
export const MAX_PAGES = 8;

export function llmMessages(topic: string): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        // check-zh: 忽略（发给大模型的提示词，不显示给用户）
        '你是小红书图文笔记编辑。把用户给的主题或正文整理成一套图文卡片：一个吸引人的封面标题（不超过 20 字，可以带 1 个 emoji），' +
        `一句副标题（不超过 20 字），以及 ${MIN_PAGES}～${MAX_PAGES} 页内容卡片。每页一个小标题（不超过 12 字）和 2～4 条要点，每条要点不超过 40 字，口语化、具体、有干货。` +
        '不要使用「最」「第一」「国家级」等广告法禁用的绝对化用语，不要编造数据。' +
        '只输出 JSON，格式：{"title":"","subtitle":"","pages":[{"heading":"","points":[""]}]}',
    },
    { role: 'user', content: topic.trim() },
  ];
}

/** 解析大模型回复：允许包在 ```json 代码块里或前后有多余文字；校验后转成 Deck。页数超过上限时截断 */
export function parseLlmDeck(raw: string): Deck {
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s < 0 || e <= s) throw new Error('大模型没有按格式返回内容，请重试一次');
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(s, e + 1));
  } catch {
    throw new Error('大模型返回的内容不是有效的 JSON，请重试一次');
  }
  const o = data as { title?: unknown; subtitle?: unknown; pages?: unknown };
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
  const title = str(o.title);
  if (!title) throw new Error('大模型没有给出封面标题，请重试一次');
  const pages: Page[] = (Array.isArray(o.pages) ? o.pages : [])
    .map((p): Page => {
      const q = (p ?? {}) as { heading?: unknown; points?: unknown; body?: unknown };
      const pts = Array.isArray(q.points) ? q.points.map(str) : str(q.body).split('\n');
      return { heading: str(q.heading), paras: pts.map((t) => t.replace(BULLET, '').trim()).filter(Boolean).map((t) => '- ' + t) };
    })
    .filter((p) => p.heading || p.paras.length)
    .slice(0, MAX_PAGES);
  if (!pages.length) throw new Error('大模型没有给出内容页，请重试一次');
  return { title, subtitle: str(o.subtitle), pages };
}

/** 调大模型拆分主题，返回可放进编辑框的文字 */
export async function aiSplit(topic: string, llm: (m: { role: 'system' | 'user'; content: string }[], o: { json: boolean; temperature: number }) => Promise<string>): Promise<{ text: string; deck: Deck }> {
  if (!topic.trim()) throw new Error('先填一个主题或一段正文');
  const deck = parseLlmDeck(await llm(llmMessages(topic), { json: true, temperature: 0.7 }));
  return { deck, text: deckToText(deck) };
}

// ---------- 整套卡片的排版 ----------

export const W = 1080;
export const H = 1440;

export interface CoverCard {
  kind: 'cover';
  title: { size: number; lines: string[]; y: number };
  sub: { size: number; lines: string[]; y: number };
}
export interface PageCard {
  kind: 'page';
  heading: { size: number; lines: string[]; y: number };
  /** 原始小标题（导出文件名用） */
  headingText: string;
  body: Laid & { y: number };
  /** 内容太多拆出来的续页 */
  cont: boolean;
}
export type Card = CoverCard | PageCard;

export const TITLE_LH = 1.28;
export const HEADING_LH = 1.3;

/**
 * 算出每张卡片上每段文字的位置和字号。pad 是内容离卡片边缘的距离（带白色面板的模板更大）。
 * 正文一页放不下时自动拆出续页。
 */
export function buildCards(deck: Deck, pad: number, m: { title: MeasureAt; body: MeasureAt }): Card[] {
  const cw = W - pad * 2;
  const t = fitTitle(deck.title || '在这里写封面标题', cw, 4, 128, 72, m.title);
  const sub = deck.subtitle ? fitTitle(deck.subtitle, cw, 2, 46, 34, m.body) : { size: 46, lines: [] };
  const th = t.lines.length * t.size * TITLE_LH;
  const sh = sub.lines.length ? 48 + sub.lines.length * sub.size * 1.45 : 0;
  const top = Math.max(pad + 40, Math.round(H * 0.46 - (th + sh) / 2));
  const cards: Card[] = [{ kind: 'cover', title: { ...t, y: top }, sub: { ...sub, y: top + th + 48 } }];

  const bodyBottom = H - pad - 110;
  for (const p of deck.pages) {
    const hd = p.heading ? fitTitle(p.heading, cw, 2, 76, 52, m.title) : { size: 76, lines: [] };
    const headingY = pad + 120;
    const bodyY = hd.lines.length ? Math.round(headingY + hd.lines.length * hd.size * HEADING_LH + 48) : headingY;
    const parts = paginateBody(p.paras.length ? p.paras : [''], cw, bodyBottom - bodyY, m.body);
    parts.forEach((laid, i) => cards.push({ kind: 'page', heading: { ...hd, y: headingY }, headingText: p.heading, body: { ...laid, y: bodyY }, cont: i > 0 }));
  }
  return cards;
}

// ---------- 导出 ----------

/** 导出文件名：01-封面.png、02-小标题.png…（去掉文件名里不能用的字符和 emoji）；续页加「-续」 */
export function fileNames(cards: Card[]): string[] {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\n\r\t.]/g, '').replace(/\p{Extended_Pictographic}|\uFE0F|\u200D/gu, '').trim().slice(0, 16);
  return cards.map((c, i) => {
    const no = String(i + 1).padStart(2, '0');
    if (c.kind === 'cover') return `${no}-封面.png`;
    return `${no}-${safe(c.headingText) || `第${i + 1}张`}${c.cont ? '-续' : ''}.png`;
  });
}

/** 导出子文件夹名：小红书卡片-20261023-1530 */
export function exportFolderName(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `小红书卡片-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
