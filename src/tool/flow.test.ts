import { describe, expect, it } from 'vitest';
import { buildCards, parseDeck, type MeasureAt } from './core';
import { exportPngs, readPrefs } from './flow';
import { SAMPLE } from './sample';

const mono: MeasureAt = (size) => (s) => Array.from(s).reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? size : size / 2), 0);

function fakeIO() {
  const files = new Map<string, Uint8Array>();
  const dirs: string[] = [];
  return {
    files, dirs,
    join: async (...p: string[]) => p.join('/'),
    writeFile: async (p: string, d: Uint8Array) => void files.set(p, d),
    ensureDir: async (p: string) => void dirs.push(p),
  };
}

describe('导出', () => {
  it('示例正文 → 卡片 → 按顺序写出 PNG 到新文件夹', async () => {
    const cards = buildCards(parseDeck(SAMPLE), 104, { title: mono, body: mono });
    const pngs = cards.map((_, i) => new Uint8Array([137, 80, 78, 71, i]));
    const io = fakeIO();
    const r = await exportPngs(io, '/下载/卡片', new Date(2026, 9, 23, 15, 30, 0), cards, pngs);
    expect(r.dir).toBe('/下载/卡片/小红书卡片-20261023-153000');
    expect(io.dirs).toEqual([r.dir]);
    expect(r.files[0]).toBe(r.dir + '/01-封面.png');
    expect(r.files).toHaveLength(cards.length);
    expect(cards.length).toBe(7);
    expect([...io.files.keys()]).toEqual(r.files);
    expect(io.files.get(r.files[2])![4]).toBe(2);
  });
  it('没有保存位置或没有卡片时报错，不写文件', async () => {
    const io = fakeIO();
    await expect(exportPngs(io, '', new Date(), [], [])).rejects.toThrow('保存位置');
    await expect(exportPngs(io, '/x', new Date(), [], [])).rejects.toThrow('没有可以导出');
    expect(io.files.size).toBe(0);
  });
});

describe('偏好设置', () => {
  const fb = { template: 'cream', signature: '', outDir: '', text: '示例' };
  it('缺字段、类型不对时用默认值', () => {
    expect(readPrefs(null, fb)).toEqual(fb);
    expect(readPrefs({ template: 'noir', signature: 3, text: '我的正文' }, fb)).toEqual({ ...fb, template: 'noir', text: '我的正文' });
  });
});
