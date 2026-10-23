// 工具声明：小红书图文卡片生成（自定义界面：左边写正文，右边实时预览，一键导出 PNG）。
import { GalleryVerticalEnd as GalleryVerticalEndAsIcon } from 'lucide-react';
import { createElement } from 'react';
import type { CustomTool } from '../kit/types';
import { Main } from './Main';

const tool: CustomTool = {
  id: 'c17',
  name: '小红书图文卡片生成',
  tagline: '把一段正文排成整套 3:4 小红书图文卡片（1080×1440），6 套模板实时预览，一键导出全部 PNG；也可以让 AI 把一个主题拆成封面和 5～8 页要点。',
  icon: GalleryVerticalEndAsIcon,
  category: '内容生产',
  type: 'media',
  mode: 'custom',
  mainLabel: '做卡片',
  needsLLM: true,
  params: [],
  // 预览页不提供 ctx，Main 里对 ctx 判空
  Main: ({ ctx }) => createElement(Main, { ctx }),
};

export default tool;
