// 卡片模板与画布绘制：用页面里的 canvas（兼容 macOS 系统网页引擎与 Windows WebView2），不用 OffscreenCanvas。
// 模板配色是画进图片里的，所以这里写死颜色。
import { BODY, BULLET_INDENT, H, HEADING_LH, TITLE_LH, W, buildCards, type Card, type Deck, type MeasureAt } from './core';

const SANS = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Microsoft YaHei UI","Noto Sans CJK SC","Source Han Sans SC",sans-serif';
const SERIF = '"Songti SC","STSong","SimSun","Noto Serif CJK SC","Source Han Serif SC",serif';

type G = CanvasRenderingContext2D;
export interface Template {
  id: string;
  name: string;
  /** 内容离卡片边缘的距离 */
  pad: number;
  font: 'sans' | 'serif';
  colors: { title: string; text: string; muted: string; accent: string; onAccent: string; mark: string };
  /** 缩略图上的两个代表色（模板选择按钮用） */
  swatch: [string, string];
  /** 画背景与装饰；cover 表示封面 */
  paint(g: G, cover: boolean): void;
}

function panel(g: G, inset: number, r: number, color: string, shadow?: string) {
  g.save();
  if (shadow) {
    g.shadowColor = shadow;
    g.shadowBlur = 40;
    g.shadowOffsetY = 12;
  }
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(inset, inset, W - inset * 2, H - inset * 2, r);
  g.fill();
  g.restore();
}

export const TEMPLATES: Template[] = [
  {
    id: 'cream', name: '奶油手账', pad: 104, font: 'sans', swatch: ['#FBF4E8', '#E8772E'],
    colors: { title: '#3B2A1A', text: '#4A3A2C', muted: '#9A8571', accent: '#E8772E', onAccent: '#FFFFFF', mark: 'rgba(246,190,110,.55)' },
    paint(g, cover) {
      g.fillStyle = '#FBF4E8';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(160,120,80,.16)';
      for (let x = 40; x < W; x += 40) for (let y = 40; y < H; y += 40) { g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#E8772E';
      g.fillRect(0, 0, W, 18);
      if (cover) {
        g.fillStyle = 'rgba(232,119,46,.14)';
        g.beginPath(); g.arc(W - 120, 230, 190, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(150, H - 260, 120, 0, Math.PI * 2); g.fill();
      }
    },
  },
  {
    id: 'mint', name: '清新薄荷', pad: 136, font: 'sans', swatch: ['#CDEDE0', '#1F9D72'],
    colors: { title: '#123A2E', text: '#2E4A40', muted: '#7C978C', accent: '#1F9D72', onAccent: '#FFFFFF', mark: 'rgba(120,214,174,.5)' },
    paint(g, cover) {
      const gr = g.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0, '#DDF4EA');
      gr.addColorStop(1, '#B8E3D2');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      panel(g, 56, 48, '#FFFFFF', 'rgba(20,90,60,.18)');
      if (cover) {
        g.fillStyle = '#1F9D72';
        g.beginPath(); g.roundRect(136, 200, 120, 14, 7); g.fill();
        g.fillStyle = 'rgba(31,157,114,.12)';
        g.beginPath(); g.arc(W - 250, H - 360, 110, 0, Math.PI * 2); g.fill();
      }
    },
  },
  {
    id: 'noir', name: '黑金杂志', pad: 124, font: 'serif', swatch: ['#161616', '#D9B26F'],
    colors: { title: '#E7C88D', text: '#ECE6DA', muted: '#9D9483', accent: '#D9B26F', onAccent: '#161616', mark: 'rgba(217,178,111,.22)' },
    paint(g, cover) {
      g.fillStyle = '#161616';
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(217,178,111,.7)';
      g.lineWidth = 2;
      g.strokeRect(52, 52, W - 104, H - 104);
      g.lineWidth = 1;
      g.strokeRect(66, 66, W - 132, H - 132);
      if (cover) {
        g.fillStyle = '#D9B26F';
        g.fillRect(W / 2 - 60, 220, 120, 3);
        g.fillRect(W / 2 - 60, H - 300, 120, 3);
      }
    },
  },
  {
    id: 'peach', name: '蜜桃少女', pad: 136, font: 'sans', swatch: ['#FFE1E8', '#F0607F'],
    colors: { title: '#5A1E2E', text: '#5E3A44', muted: '#B08690', accent: '#F0607F', onAccent: '#FFFFFF', mark: 'rgba(255,170,190,.6)' },
    paint(g, cover) {
      g.fillStyle = '#FFE1E8';
      g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.75)';
      for (let y = 30, r = 0; y < H; y += 70, r++) for (let x = r % 2 ? 65 : 30; x < W; x += 70) { g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill(); }
      panel(g, 60, 56, '#FFFFFF', 'rgba(200,60,90,.16)');
      if (cover) {
        ['#F0607F', '#F79AAE', '#FBC6D2'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(152 + i * 44, 196, 14, 0, Math.PI * 2); g.fill(); });
        g.fillStyle = 'rgba(240,96,127,.10)';
        g.beginPath(); g.arc(W - 250, H - 360, 100, 0, Math.PI * 2); g.fill();
      }
    },
  },
  {
    id: 'mono', name: '极简黑白', pad: 100, font: 'sans', swatch: ['#FFFFFF', '#111111'],
    colors: { title: '#111111', text: '#2B2B2B', muted: '#8A8A8A', accent: '#111111', onAccent: '#FFFFFF', mark: 'rgba(255,214,0,.75)' },
    paint(g, cover) {
      g.fillStyle = '#FFFFFF';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#111111';
      g.fillRect(100, 84, cover ? 220 : 80, 10);
    },
  },
  {
    id: 'tech', name: '深海科技', pad: 108, font: 'sans', swatch: ['#12306B', '#6FE3FF'],
    colors: { title: '#FFFFFF', text: '#DCE7FF', muted: '#8EA5D6', accent: '#6FE3FF', onAccent: '#0B1D45', mark: 'rgba(111,227,255,.28)' },
    paint(g, cover) {
      const gr = g.createLinearGradient(0, 0, W * 0.4, H);
      gr.addColorStop(0, '#0B1D45');
      gr.addColorStop(1, '#1D4CA3');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(111,227,255,.08)';
      g.lineWidth = 1;
      for (let x = 0; x <= W; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      if (cover) {
        const rg = g.createRadialGradient(W - 160, 260, 10, W - 160, 260, 320);
        rg.addColorStop(0, 'rgba(111,227,255,.35)');
        rg.addColorStop(1, 'rgba(111,227,255,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
      }
    },
  },
];

export const templateById = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

const family = (t: Template) => (t.font === 'serif' ? SERIF : SANS);
const titleFont = (t: Template, size: number) => `${t.font === 'serif' ? 700 : 800} ${size}px ${family(t)}`;
const bodyFont = (t: Template, size: number) => `400 ${size}px ${family(t)}`;

let measureCtx: G | null = null;
function measurer(font: (size: number) => string): MeasureAt {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  const g = measureCtx;
  return (size) => {
    const f = font(size);
    return (s) => {
      g.font = f;
      return g.measureText(s).width;
    };
  };
}

/** 按模板算出整套卡片的排版 */
export function layoutCards(deck: Deck, t: Template): Card[] {
  return buildCards(deck, t.pad, { title: measurer((s) => titleFont(t, s)), body: measurer((s) => bodyFont(t, s)) });
}

/** 在 canvas 上画第 index 张卡片。scale=1 时 canvas 为 1080×1440（导出用）；缩略图用较小的 scale，缩放后更清晰也更快 */
export function drawCard(canvas: HTMLCanvasElement, card: Card, index: number, total: number, t: Template, signature: string, scale = 1) {
  const cw = Math.round(W * scale);
  const ch = Math.round(H * scale);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const g = canvas.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, ch);
  g.setTransform(scale, 0, 0, scale, 0, 0);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  const c = t.colors;
  t.paint(g, card.kind === 'cover');
  const x0 = t.pad;

  if (card.kind === 'cover') {
    const centered = t.id === 'noir';
    const lh = card.title.size * TITLE_LH;
    g.font = titleFont(t, card.title.size);
    card.title.lines.forEach((line, i) => {
      const cy = card.title.y + lh * i + lh / 2;
      const w = g.measureText(line).width;
      const x = centered ? (W - w) / 2 : x0;
      // 荧光笔划线
      g.fillStyle = c.mark;
      g.fillRect(x - 6, cy + card.title.size * 0.12, w + 12, card.title.size * 0.36);
      g.fillStyle = c.title;
      g.fillText(line, x, cy);
    });
    if (card.sub.lines.length) {
      const slh = card.sub.size * 1.45;
      g.font = bodyFont(t, card.sub.size);
      g.fillStyle = c.muted;
      card.sub.lines.forEach((line, i) => {
        const w = g.measureText(line).width;
        g.fillText(line, centered ? (W - w) / 2 : x0, card.sub.y + slh * i + slh / 2);
      });
    }
  } else {
    // 页码徽标
    const no = String(index).padStart(2, '0');
    g.font = `800 40px ${family(t)}`;
    const bw = g.measureText(no).width + 44;
    const by = t.pad + 24;
    if (t.id === 'mono') {
      g.fillStyle = c.title;
      g.font = `800 64px ${family(t)}`;
      g.fillText(no, x0, by + 32);
    } else {
      g.fillStyle = c.accent;
      g.beginPath();
      g.roundRect(x0, by, bw, 60, t.id === 'noir' ? 4 : 30);
      g.fill();
      g.fillStyle = c.onAccent;
      g.fillText(no, x0 + 22, by + 31);
    }
    if (card.cont) {
      g.font = `500 30px ${family(t)}`;
      g.fillStyle = c.muted;
      g.fillText('（接上页）', x0 + (t.id === 'mono' ? 110 : bw + 18), by + 31);
    }
    const hlh = card.heading.size * HEADING_LH;
    g.font = titleFont(t, card.heading.size);
    card.heading.lines.forEach((line, i) => {
      g.fillStyle = c.title;
      g.fillText(line, x0, card.heading.y + hlh * i + hlh / 2);
    });
    if (card.heading.lines.length && t.id !== 'noir') {
      g.fillStyle = c.accent;
      g.fillRect(x0, card.heading.y + hlh * card.heading.lines.length + 14, 64, 6);
    }
    const s = card.body.size;
    const lh = s * BODY.lineHeight;
    let y = card.body.y;
    g.font = bodyFont(t, s);
    card.body.lines.forEach((line, i) => {
      if (line.first && i > 0) y += s * BODY.paraGap;
      const cy = y + lh / 2;
      const indent = line.bullet ? s * BULLET_INDENT : 0;
      if (line.bullet && line.first) {
        g.fillStyle = c.accent;
        g.beginPath();
        if (t.id === 'mono') g.rect(x0 + s * 0.2, cy - s * 0.16, s * 0.32, s * 0.32);
        else g.arc(x0 + s * 0.36, cy, s * 0.17, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = c.text;
      g.fillText(line.text, x0 + indent, cy);
      y += lh;
    });
  }

  // 页脚：署名 + 张数
  const fy = H - t.pad - 34;
  g.font = `500 30px ${family(t)}`;
  g.fillStyle = c.muted;
  if (signature.trim()) g.fillText(signature.trim().slice(0, 30), x0, fy);
  const pg = `${index + 1} / ${total}`;
  g.fillText(pg, W - x0 - g.measureText(pg).width, fy);
}

/** 把画好的 canvas 编成 PNG 字节 */
export async function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('生成图片失败');
  return new Uint8Array(await blob.arrayBuffer());
}

/** 画出整套卡片并编成 PNG（导出与自检共用） */
export async function renderAll(deck: Deck, t: Template, signature: string): Promise<{ cards: Card[]; pngs: Uint8Array[] }> {
  const cards = layoutCards(deck, t);
  const canvas = document.createElement('canvas');
  const pngs: Uint8Array[] = [];
  for (let i = 0; i < cards.length; i++) {
    drawCard(canvas, cards[i], i, cards.length, t, signature);
    pngs.push(await canvasPng(canvas));
  }
  return { cards, pngs };
}
