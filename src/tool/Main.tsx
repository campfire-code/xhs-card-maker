// 主界面：左边写正文 / 选模板，右边实时预览整套卡片，一键导出全部 PNG。
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FolderOpen, Sparkles, X } from 'lucide-react';
import type { CustomTool } from '../kit/types';
import { defaultOutputDir, ensureDir, openFolder, pickFolder, settingsStore } from '../kit/platform';
import { W, aiSplit, parseDeck, type Card } from './core';
import { TEMPLATES, drawCard, layoutCards, renderAll, templateById, type Template } from './render';
import { PREFS_KEY, exportPngs, readPrefs, type Prefs } from './flow';
import { SAMPLE } from './sample';
import './tool.css';

type Ctx = Parameters<CustomTool['Main']>[0]['ctx'];
const TOOL_NAME = '小红书图文卡片生成';
const DEFAULTS: Prefs = { template: TEMPLATES[0].id, signature: '@你的小红书昵称', outDir: '', text: SAMPLE };
/** 小红书一篇笔记最多 18 张图 */
const XHS_MAX = 18;

function CardCanvas({ card, index, total, t, signature, onOpen }: { card: Card; index: number; total: number; t: Template; signature: string; onOpen?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const thumb = !!onOpen;
  useEffect(() => {
    // 缩略图按显示尺寸 × 屏幕倍率画，放大预览画原尺寸
    const scale = thumb ? Math.min(1, Math.max(0.3, (ref.current?.clientWidth || 240) * (devicePixelRatio || 1) / W)) : 1;
    if (ref.current) drawCard(ref.current, card, index, total, t, signature, scale);
  }, [card, index, total, t, signature, thumb]);
  const label = index === 0 ? '封面' : `第 ${index + 1} 张`;
  return onOpen ? (
    <button className="xc-card" onClick={onOpen} title="点击放大">
      <canvas ref={ref} aria-label={label} />
      <span className="k-muted k-num">{label}{card.kind === 'page' && card.cont ? '（续页）' : ''}</span>
    </button>
  ) : <canvas ref={ref} aria-label={label} />;
}

export function Main({ ctx }: { ctx?: Ctx }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [tab, setTab] = useState<'manual' | 'ai'>('manual');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState<'' | 'ai' | 'export'>('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string; dir?: string } | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [defaultDir, setDefaultDir] = useState('');
  const loaded = useRef(false);

  // 读取上次的模板、署名、保存位置和正文
  useEffect(() => {
    (async () => {
      try {
        const st = await settingsStore();
        setPrefs(readPrefs(await st.get(PREFS_KEY), DEFAULTS));
      } catch { /* 预览页或首次打开：用默认值 */ }
      try { setDefaultDir((await defaultOutputDir(TOOL_NAME)) || ''); } catch { /* 预览页没有本机路径 */ }
      loaded.current = true;
    })();
  }, []);
  // 修改后稍等再保存，打字时不频繁写盘
  useEffect(() => {
    if (!loaded.current) return;
    const id = setTimeout(async () => {
      try { await (await settingsStore()).set(PREFS_KEY, prefs); } catch { /* 预览页不保存 */ }
    }, 500);
    return () => clearTimeout(id);
  }, [prefs]);

  const set = (p: Partial<Prefs>) => setPrefs((o) => ({ ...o, ...p }));
  const text = useDeferredValue(prefs.text);
  const t = templateById(prefs.template);
  const deck = useMemo(() => parseDeck(text), [text]);
  const cards = useMemo(() => layoutCards(deck, t), [deck, t]);
  const outDir = prefs.outDir || defaultDir;

  useEffect(() => {
    if (zoom == null) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoom(null);
      else if (e.key === 'ArrowRight') setZoom((z) => Math.min(cards.length - 1, (z ?? 0) + 1));
      else if (e.key === 'ArrowLeft') setZoom((z) => Math.max(0, (z ?? 0) - 1));
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [zoom, cards.length]);

  async function runAi() {
    if (!ctx) return setMsg({ kind: 'err', text: '预览模式下不能调用大模型' });
    setBusy('ai');
    setMsg(null);
    try {
      const r = await aiSplit(topic, (m, o) => ctx.llm(m, o));
      set({ text: r.text });
      setTab('manual');
      setMsg({ kind: 'ok', text: `AI 拆成了封面 + ${r.deck.pages.length} 页，已填进「手动分页」，可以接着改` });
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : String(e) });
    }
    setBusy('');
  }

  async function runExport() {
    if (!ctx) return setMsg({ kind: 'err', text: '预览模式下不能导出' });
    setBusy('export');
    setMsg(null);
    try {
      const { cards: cs, pngs } = await renderAll(deck, t, prefs.signature);
      const r = await exportPngs({ join: ctx.join, writeFile: ctx.writeFile, ensureDir }, outDir, new Date(), cs, pngs);
      setMsg({ kind: 'ok', text: `已导出 ${r.files.length} 张 PNG（1080×1440）到 ${r.dir}`, dir: r.dir });
    } catch (e) {
      setMsg({ kind: 'err', text: `导出失败：${e instanceof Error ? e.message : String(e)}` });
    }
    setBusy('');
  }

  return (
    <div className="xc">
      <section className="xc-edit k-panel">
        <div className="k-seg" role="radiogroup" aria-label="输入方式">
          <button role="radio" aria-checked={tab === 'manual'} className={tab === 'manual' ? 'on' : ''} onClick={() => setTab('manual')}>手动分页</button>
          <button role="radio" aria-checked={tab === 'ai'} className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}><Sparkles size={13} /> AI 拆分</button>
        </div>
        {tab === 'manual' ? (
          <div className="k-field xc-grow">
            <label className="k-label" htmlFor="xc-text">正文</label>
            <textarea id="xc-text" className="k-input k-textarea xc-text" value={prefs.text} spellCheck={false} onChange={(e) => set({ text: e.target.value })} placeholder={'封面标题\n副标题（可不写）\n---\n第一页小标题\n- 要点一\n- 要点二\n---\n第二页…'} />
            <span className="k-help">单独一行写 <b>---</b> 换下一张卡片。第一块是封面；之后每块的第一行是小标题，以「- 」开头的行显示成要点。字多会自动缩小，一页放不下自动续页。</span>
          </div>
        ) : (
          <div className="k-field xc-grow">
            <label className="k-label" htmlFor="xc-topic">主题或一段正文</label>
            <textarea id="xc-topic" className="k-input k-textarea xc-text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如：新手第一次露营要带什么" />
            <div className="k-actions">
              <button className="k-btn primary" disabled={!!busy || !topic.trim()} onClick={runAi}><Sparkles size={15} />{busy === 'ai' ? 'AI 正在拆分…' : 'AI 拆成卡片'}</button>
            </div>
            <span className="k-help">由大模型拆成封面标题和 5～8 页要点，需要先在「设置」里填自己的大模型接口。拆好后会填进「手动分页」，可以继续修改。不用 AI 也可以直接在「手动分页」里写。</span>
          </div>
        )}
        <div className="k-field">
          <span className="k-label">模板</span>
          <div className="xc-tpls" role="radiogroup" aria-label="模板">
            {TEMPLATES.map((x) => (
              <button key={x.id} role="radio" aria-checked={x.id === t.id} className={`k-chip${x.id === t.id ? ' on' : ''}`} onClick={() => set({ template: x.id })}>
                <i className="xc-sw" style={{ background: `linear-gradient(135deg, ${x.swatch[0]} 50%, ${x.swatch[1]} 50%)` }} />{x.name}
              </button>
            ))}
          </div>
        </div>
        <div className="k-field">
          <label className="k-label" htmlFor="xc-sig">署名（每张左下角，可留空）</label>
          <input id="xc-sig" className="k-input" value={prefs.signature} maxLength={30} onChange={(e) => set({ signature: e.target.value })} />
        </div>
      </section>

      <section className="xc-view">
        <div className="xc-bar">
          <b>预览</b>
          <span className="k-muted k-num">共 {cards.length} 张 · 1080×1440</span>
          <span className="b-sp" />
          <button className="k-btn xc-dir" title={outDir || '选择保存位置'} onClick={async () => { const p = await pickFolder().catch(() => null); if (p) set({ outDir: p }); }}>
            <FolderOpen size={15} /><span className="k-ellipsis">{outDir ? `保存到 ${outDir}` : '选择保存位置'}</span>
          </button>
          <button className="k-btn primary" disabled={!!busy || !cards.length} onClick={runExport}><Download size={15} />{busy === 'export' ? '正在导出…' : '导出全部 PNG'}</button>
        </div>
        {cards.length > XHS_MAX && <div className="k-notice err"><span>共 {cards.length} 张，小红书一篇笔记最多 {XHS_MAX} 张图，建议精简正文或分成两篇。</span></div>}
        {msg && (
          <div className={`k-notice ${msg.kind}`} role={msg.kind === 'err' ? 'alert' : 'status'}>
            <span>{msg.text}</span>
            {msg.dir && <button className="k-link" onClick={() => openFolder(msg.dir!)}>打开文件夹</button>}
            <button className="k-icon-btn" aria-label="关闭提示" onClick={() => setMsg(null)}><X size={14} /></button>
          </div>
        )}
        <div className="xc-grid">
          {cards.map((c, i) => <CardCanvas key={i} card={c} index={i} total={cards.length} t={t} signature={prefs.signature} onOpen={() => setZoom(i)} />)}
        </div>
      </section>

      {zoom != null && cards[zoom] && (
        <div className="xc-zoom" role="dialog" aria-label="放大预览" onClick={() => setZoom(null)}>
          <div className="xc-zoom-box k-panel" onClick={(e) => e.stopPropagation()}>
            <CardCanvas card={cards[zoom]} index={zoom} total={cards.length} t={t} signature={prefs.signature} />
            <div className="xc-zoom-bar">
              <button className="k-btn" disabled={zoom === 0} onClick={() => setZoom(zoom - 1)}><ChevronLeft size={15} />上一张</button>
              <span className="k-muted k-num">{zoom + 1} / {cards.length}</span>
              <button className="k-btn" disabled={zoom === cards.length - 1} onClick={() => setZoom(zoom + 1)}>下一张<ChevronRight size={15} /></button>
              <button className="k-btn" onClick={() => setZoom(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
