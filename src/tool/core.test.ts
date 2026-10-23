import { describe, expect, it } from 'vitest';
import {
  BODY, aiSplit, blockHeight, buildCards, deckToText, exportFolderName, fileNames, fitBody, fitTitle, layoutAt, paginateBody, parseDeck, parseLlmDeck, tokenize, wrapText,
  type MeasureAt,
} from './core';

// 等宽假量字：汉字和全角标点 1 个字号宽，其余半个字号宽
const mono: MeasureAt = (size) => (s) => Array.from(s).reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? size : size / 2), 0);
const at10 = mono(10);

describe('分页解析', () => {
  it('用「---」分页：第一块是封面，后面每块一页，第一行是小标题', () => {
    const d = parseDeck('秋天护肤清单\n干皮看过来\n---\n第一步 清洁\n温和洗面奶\n不要过度清洁\n---\n只有一行的页\n');
    expect(d.title).toBe('秋天护肤清单');
    expect(d.subtitle).toBe('干皮看过来');
    expect(d.pages).toEqual([
      { heading: '第一步 清洁', paras: ['温和洗面奶', '不要过度清洁'] },
      { heading: '', paras: ['只有一行的页'] },
    ]);
  });
  it('分隔线前后有空格、用全角破折号或等号、Windows 换行也能识别；空页忽略', () => {
    const d = parseDeck('标题\r\n  ---  \r\nA\r\nb\r\n——\r\n\r\n===\r\nC\r\nd');
    expect(d.pages.map((p) => p.heading)).toEqual(['A', 'C']);
  });
  it('没有「---」时第一行当封面，其余按空行分页', () => {
    const d = parseDeck('\n标题\n\n要点一\n说明一\n\n\n要点二\n说明二');
    expect(d.title).toBe('标题');
    expect(d.pages).toEqual([{ heading: '要点一', paras: ['说明一'] }, { heading: '要点二', paras: ['说明二'] }]);
  });
  it('空输入不报错', () => {
    expect(parseDeck('')).toEqual({ title: '', subtitle: '', pages: [] });
  });
  it('写回编辑框后再解析，内容不变', () => {
    const d = parseDeck('标题\n副标题\n---\n小标题\n- 要点一\n- 要点二');
    expect(parseDeck(deckToText(d))).toEqual(d);
  });
});

describe('换行', () => {
  it('英文单词和数字连在一起不拆，emoji 算一块', () => {
    expect(tokenize('用iPhone 15拍✨')).toEqual(['用', 'iPhone ', '15', '拍', '✨']);
  });
  it('中文按宽度逐字断开，每行都不超宽', () => {
    const lines = wrapText('今天分享一个超级实用的收纳小技巧大家快来看看吧', 100, at10);
    expect(lines.every((l) => at10(l) <= 100)).toBe(true);
    expect(lines.join('')).toBe('今天分享一个超级实用的收纳小技巧大家快来看看吧');
    expect(lines[0]).toHaveLength(10);
  });
  it('逗号句号不出现在行首：把前一个字一起带到下一行', () => {
    const lines = wrapText('一二三四五六七八九十，好的', 100, at10);
    expect(lines).toEqual(['一二三四五六七八九', '十，好的']);
  });
  it('左括号、左引号不留在行尾', () => {
    const lines = wrapText('一二三四五六七八九「十」', 100, at10);
    expect(lines[0]).toBe('一二三四五六七八九');
    expect(lines[1]).toBe('「十」');
  });
  it('英文单词放不下时整个换到下一行', () => {
    const lines = wrapText('一二三四五六七八 hello', 100, at10);
    expect(lines).toEqual(['一二三四五六七八', 'hello']);
  });
  it('比整行还长的英文串按字母拆开', () => {
    const lines = wrapText('a'.repeat(50), 100, at10);
    expect(lines).toEqual(['a'.repeat(20), 'a'.repeat(20), 'a'.repeat(10)]);
  });
  it('换行处的空格不留在行首行尾', () => {
    const lines = wrapText('aaaa bbbb cccc dddd eeee', 50, at10);
    expect(lines.every((l) => l === l.trim())).toBe(true);
  });
});

describe('字号自适应与续页', () => {
  it('字少时用最大字号，字多时自动缩小', () => {
    expect(fitBody(['短短一句'], 600, 400, mono).size).toBe(BODY.maxSize);
    const many = Array.from({ length: 8 }, () => '这是一段比较长的正文内容需要换行显示出来');
    const f = fitBody(many, 600, 1100, mono);
    expect(f.fits).toBe(true);
    expect(f.size).toBeLessThan(BODY.maxSize);
    expect(f.size).toBeGreaterThanOrEqual(BODY.minSize);
    expect(f.height).toBeLessThanOrEqual(1100);
    // 大一档就放不下，说明找到的是最大可行字号
    expect(layoutAt(many, 600, f.size + 2, mono).height).toBeGreaterThan(1100);
  });
  it('项目符号段落缩进后换行', () => {
    const laid = layoutAt(['- 一二三四五六七八九十'], 100, 10, mono);
    expect(laid.lines.map((l) => l.text)).toEqual(['一二三四五六七八', '九十']);
    expect(laid.lines[0]).toMatchObject({ first: true, bullet: true });
  });
  it('段落间距只算在段落之间', () => {
    const lines = [{ text: 'a', first: true, bullet: false }, { text: 'b', first: false, bullet: false }, { text: 'c', first: true, bullet: false }];
    expect(blockHeight(lines, 10)).toBeCloseTo(3 * 10 * BODY.lineHeight + 10 * BODY.paraGap);
  });
  it('最小字号也放不下时拆成多页，每页都不超高，内容不丢', () => {
    const paras = Array.from({ length: 30 }, (_, i) => `第${i + 1}条：这是一段很长很长的正文用来测试自动续页`);
    const pages = paginateBody(paras, 600, 800, mono);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((p) => p.size === BODY.minSize && p.height <= 800)).toBe(true);
    expect(pages.flatMap((p) => p.lines).filter((l) => l.first)).toHaveLength(30);
  });
  it('标题放不下时缩小字号，到最小仍放不下就截断加省略号', () => {
    const t = fitTitle('一二三四五六七八九十', 500, 2, 100, 40, mono);
    expect(t.size).toBe(100);
    expect(t.lines).toEqual(['一二三四五', '六七八九十']);
    const long = fitTitle('字'.repeat(100), 400, 2, 100, 40, mono);
    expect(long.size).toBe(40);
    expect(long.lines).toHaveLength(2);
    expect(long.lines[1].endsWith('…')).toBe(true);
    expect(mono(40)(long.lines[1])).toBeLessThanOrEqual(400);
  });
});

describe('整套卡片', () => {
  const m = { title: mono, body: mono };
  it('封面 + 每页一张；正文超长时自动续页', () => {
    const long = Array.from({ length: 40 }, () => '一段很长的正文，用来把一页撑满然后自动续到下一页去');
    const cards = buildCards({ title: '标题', subtitle: '副标题', pages: [{ heading: '短页', paras: ['一句话'] }, { heading: '长页', paras: long }] }, 100, m);
    expect(cards[0].kind).toBe('cover');
    expect(cards.length).toBeGreaterThanOrEqual(4);
    const pages = cards.slice(1);
    expect(pages.every((c) => c.kind === 'page')).toBe(true);
    expect(pages.map((c) => (c.kind === 'page' ? c.cont : null))).toEqual([false, false, ...Array(cards.length - 3).fill(true)]);
    for (const c of pages) if (c.kind === 'page') expect(c.body.y + c.body.height).toBeLessThanOrEqual(1440 - 100 - 110);
    expect(fileNames(cards).slice(0, 4)).toEqual(['01-封面.png', '02-短页.png', '03-长页.png', '04-长页-续.png']);
  });
  it('文件名去掉不能用的字符和 emoji', () => {
    const cards = buildCards({ title: 't', subtitle: '', pages: [{ heading: '护肤✨/步骤:1?', paras: ['x'] }, { heading: '', paras: ['x'] }] }, 100, m);
    expect(fileNames(cards)).toEqual(['01-封面.png', '02-护肤步骤1.png', '03-第3张.png']);
  });
  it('导出文件夹名带日期时间', () => {
    expect(exportFolderName(new Date(2026, 9, 23, 9, 5, 7))).toBe('小红书卡片-20261023-090507');
  });
});

describe('大模型拆分', () => {
  const reply = '好的，下面是结果：\n```json\n{"title":"新手做饭 5 个窍门🍳","subtitle":"照着做不翻车","pages":[{"heading":"先备菜","points":["切好再开火","调料提前兑好"]},{"heading":"火候","points":["- 中火为主"]},{"heading":"","points":[]}]}\n```';
  it('从代码块里取出 JSON，要点转成项目符号，空页丢掉', () => {
    const d = parseLlmDeck(reply);
    expect(d.title).toBe('新手做饭 5 个窍门🍳');
    expect(d.pages).toEqual([
      { heading: '先备菜', paras: ['- 切好再开火', '- 调料提前兑好'] },
      { heading: '火候', paras: ['- 中火为主'] },
    ]);
  });
  it('超过 8 页只保留前 8 页', () => {
    const pages = Array.from({ length: 12 }, (_, i) => ({ heading: `页${i}`, points: ['x'] }));
    expect(parseLlmDeck(JSON.stringify({ title: 't', pages })).pages).toHaveLength(8);
  });
  it('格式不对时给出能看懂的提示', () => {
    expect(() => parseLlmDeck('抱歉，我无法回答')).toThrow('没有按格式返回');
    expect(() => parseLlmDeck('{"title": ')).toThrow('没有按格式返回');
    expect(() => parseLlmDeck('{"title": "x", "pages": oops}')).toThrow('不是有效的 JSON');
    expect(() => parseLlmDeck('{"pages":[{"heading":"a","points":["b"]}]}')).toThrow('封面标题');
    expect(() => parseLlmDeck('{"title":"a","pages":[]}')).toThrow('内容页');
  });
  it('完整流程：假大模型返回 JSON → 编辑框文字 → 卡片', async () => {
    let asked: { content: string }[] = [];
    let opts: unknown;
    const r = await aiSplit('新手做饭', async (msgs, o) => { asked = msgs; opts = o; return reply; });
    expect(asked[1].content).toBe('新手做饭');
    expect(asked[0].content).toContain('JSON');
    expect(opts).toMatchObject({ json: true });
    const d = parseDeck(r.text);
    expect(d.title).toBe('新手做饭 5 个窍门🍳');
    expect(d.subtitle).toBe('照着做不翻车');
    expect(d.pages).toHaveLength(2);
    expect(buildCards(d, 100, { title: mono, body: mono })).toHaveLength(3);
  });
  it('主题为空时不调用大模型', async () => {
    let called = false;
    await expect(aiSplit('  ', async () => { called = true; return ''; })).rejects.toThrow('先填');
    expect(called).toBe(false);
  });
});

describe('排版细节', () => {
  it('标题在行的后半段有空格时在空格处断开', () => {
    // 行宽 65：不优先空格时会断成「上班族 15 分」「钟早餐」
    expect(wrapText('上班族 15 分钟早餐', 65, at10)).toEqual(['上班族 15 分', '钟早餐']);
    expect(wrapText('上班族 15 分钟早餐', 65, at10, true)).toEqual(['上班族 15', '分钟早餐']);
    expect(fitTitle('上班族 15 分钟早餐', 65, 2, 10, 10, mono).lines).toEqual(['上班族 15', '分钟早餐']);
  });
  it('续页时整段挪到下一页，不把一段的最后一行单独留到下一页', () => {
    // 每段 2 行，每行高 16.2，段距 6.2；高度 100 能放 2 段（71）但放不下 3 段（110）
    const paras = Array.from({ length: 5 }, () => '一二三四五六七八九十一二三四五');
    const o = { maxSize: 10, minSize: 10, lineHeight: 1.62, paraGap: 0.62 };
    const pages = paginateBody(paras, 100, 100, mono, o);
    expect(pages.map((p) => p.lines.length)).toEqual([4, 4, 2]);
    expect(pages.every((p) => p.lines[0].first)).toBe(true);
  });
  it('一整页都放不下的超长段落才在段内断开', () => {
    const o = { maxSize: 10, minSize: 10, lineHeight: 1.62, paraGap: 0.62 };
    const pages = paginateBody(['字'.repeat(200)], 100, 100, mono, o);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.lines).map((l) => l.text).join('')).toBe('字'.repeat(200));
  });
});
