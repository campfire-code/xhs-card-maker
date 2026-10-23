// 导出流程与偏好设置：不直接依赖画布和 Tauri，读写都从外面传进来，方便用内存假文件系统测试。
import { exportFolderName, fileNames, type Card } from './core';

export interface ExportIO {
  join(...parts: string[]): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  ensureDir(path: string): Promise<void>;
}

/** 在 baseDir 下新建「小红书卡片-日期时间」文件夹，把每张卡片按顺序存成 PNG，返回文件夹和文件路径 */
export async function exportPngs(io: ExportIO, baseDir: string, now: Date, cards: Card[], pngs: Uint8Array[]): Promise<{ dir: string; files: string[] }> {
  if (!baseDir) throw new Error('还没有选择保存位置');
  if (!cards.length || cards.length !== pngs.length) throw new Error('没有可以导出的卡片');
  const dir = await io.join(baseDir, exportFolderName(now));
  await io.ensureDir(dir);
  const names = fileNames(cards);
  const files: string[] = [];
  for (let i = 0; i < cards.length; i++) {
    const p = await io.join(dir, names[i]);
    await io.writeFile(p, pngs[i]);
    files.push(p);
  }
  return { dir, files };
}

export interface Prefs {
  template: string;
  signature: string;
  outDir: string;
  text: string;
}
export const PREFS_KEY = 'c17.prefs';

/** 读出的偏好可能缺字段或类型不对（旧版本、手改过），逐项兜底 */
export function readPrefs(raw: unknown, fallback: Prefs): Prefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const s = (k: keyof Prefs) => (typeof o[k] === 'string' ? (o[k] as string) : fallback[k]);
  return { template: s('template'), signature: s('signature'), outDir: s('outDir'), text: s('text') };
}
