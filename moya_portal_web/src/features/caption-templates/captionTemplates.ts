export type CaptionTemplateEngine = 'css-overlay' | 'ass-reference';

export type CaptionTemplateMotion =
  | 'word-pop'
  | 'bounce-in'
  | 'flash-cut'
  | 'ticker'
  | 'karaoke-sweep'
  | 'static-card';

export interface CaptionTemplatePreset {
  templateId: string;
  name: string;
  scene: string;
  engine: CaptionTemplateEngine;
  motion: CaptionTemplateMotion;
  source: string;
  cssScope: string;
  sample: string;
  highlight: string;
  tags: string[];
  style: {
    fontFamily: string;
    fontSize: number;
    textColor: string;
    keywordColor: string;
    strokeColor: string;
    background: string;
    shadow: string;
    align: 'bottom-center' | 'center' | 'top-left' | 'bottom-left';
  };
}

export const CAPTION_TEMPLATE_NAMESPACE = 'moya-caption-template';
export const CAPTION_TEMPLATE_STORAGE_KEY = 'moya:caption-template:user-v1';
export const captionTemplateMotionLabels: Record<CaptionTemplateMotion, string> = {
  'word-pop': '逐字弹出',
  'bounce-in': '弹跳入场',
  'flash-cut': '卡点闪字',
  ticker: '滚动卖点',
  'karaoke-sweep': '逐字高亮',
  'static-card': '静态卡片'
};

export function formatCaptionTemplateMotionLabel(motion: CaptionTemplateMotion) {
  return captionTemplateMotionLabels[motion] || motion;
}

export const captionTemplatePresets: CaptionTemplatePreset[] = [
  {
    templateId: 'moya-caption-template-burst-yellow-v1',
    name: '爆款黄字',
    scene: '口播、测评、成交转化',
    engine: 'css-overlay',
    motion: 'word-pop',
    source: 'PupCaps/CSS template',
    cssScope: `${CAPTION_TEMPLATE_NAMESPACE}--burst-yellow`,
    sample: '这个方法真的很适合新手',
    highlight: '新手',
    tags: ['字幕模板', '爆款', '黄字', '口播'],
    style: {
      fontFamily: 'Arial Black, Microsoft YaHei, sans-serif',
      fontSize: 44,
      textColor: '#ffe34d',
      keywordColor: '#ffe34d',
      strokeColor: '#111827',
      background: 'linear-gradient(180deg, rgb(15 23 42 / 18%), rgb(15 23 42 / 42%))',
      shadow: '0 4px 0 #0f172a, 0 12px 28px rgb(0 0 0 / 44%)',
      align: 'bottom-center'
    }
  },
  {
    templateId: 'moya-caption-template-variety-outline-v1',
    name: '综艺描边',
    scene: '探店、剧情、反应类视频',
    engine: 'css-overlay',
    motion: 'bounce-in',
    source: 'PupCaps/CSS template',
    cssScope: `${CAPTION_TEMPLATE_NAMESPACE}--variety-outline`,
    sample: '这波操作有点离谱',
    highlight: '离谱',
    tags: ['字幕模板', '综艺', '描边', '弹跳'],
    style: {
      fontFamily: 'Arial Black, Microsoft YaHei, sans-serif',
      fontSize: 42,
      textColor: '#ffffff',
      keywordColor: '#ff5c7a',
      strokeColor: '#243c5a',
      background: 'linear-gradient(135deg, rgb(37 99 235 / 24%), rgb(244 114 182 / 18%))',
      shadow: '0 3px 0 #243c5a, 0 10px 24px rgb(37 99 235 / 28%)',
      align: 'bottom-center'
    }
  },
  {
    templateId: 'moya-caption-template-word-highlight-v1',
    name: '逐字高亮',
    scene: '知识口播、教程、清单讲解',
    engine: 'css-overlay',
    motion: 'karaoke-sweep',
    source: 'PupCaps/CSS template',
    cssScope: `${CAPTION_TEMPLATE_NAMESPACE}--word-highlight`,
    sample: '三个步骤直接提升转化',
    highlight: '转化',
    tags: ['字幕模板', '逐字', '高亮', '知识'],
    style: {
      fontFamily: 'Inter, Microsoft YaHei, sans-serif',
      fontSize: 36,
      textColor: '#e0f2fe',
      keywordColor: '#38bdf8',
      strokeColor: '#082f49',
      background: 'linear-gradient(180deg, rgb(8 47 73 / 14%), rgb(8 47 73 / 42%))',
      shadow: '0 2px 0 #082f49, 0 10px 24px rgb(14 165 233 / 26%)',
      align: 'bottom-center'
    }
  },
  {
    templateId: 'moya-caption-template-flash-title-v1',
    name: '卡点大字',
    scene: '转场卡点、开场钩子、结论强调',
    engine: 'css-overlay',
    motion: 'flash-cut',
    source: 'PupCaps/CSS template',
    cssScope: `${CAPTION_TEMPLATE_NAMESPACE}--flash-title`,
    sample: '重点来了',
    highlight: '重点',
    tags: ['字幕模板', '卡点', '大字', '钩子'],
    style: {
      fontFamily: 'Arial Black, Microsoft YaHei, sans-serif',
      fontSize: 52,
      textColor: '#ffffff',
      keywordColor: '#f97316',
      strokeColor: '#111111',
      background: 'linear-gradient(135deg, rgb(249 115 22 / 24%), rgb(15 23 42 / 54%))',
      shadow: '0 5px 0 #111111, 0 14px 30px rgb(249 115 22 / 28%)',
      align: 'center'
    }
  },
  {
    templateId: 'moya-caption-template-selling-strip-v1',
    name: '卖点条',
    scene: '商品展示、优惠信息、本地套餐',
    engine: 'css-overlay',
    motion: 'ticker',
    source: 'PupCaps/CSS template',
    cssScope: `${CAPTION_TEMPLATE_NAMESPACE}--selling-strip`,
    sample: '今天下单直接省一半',
    highlight: '省一半',
    tags: ['字幕模板', '商品', '卖点', '本地生活'],
    style: {
      fontFamily: 'Inter, Microsoft YaHei, sans-serif',
      fontSize: 34,
      textColor: '#0f172a',
      keywordColor: '#be123c',
      strokeColor: '#ffffff',
      background: 'linear-gradient(90deg, #ffffff, #fef3c7)',
      shadow: '0 8px 24px rgb(15 23 42 / 22%)',
      align: 'bottom-left'
    }
  },
  {
    templateId: 'moya-caption-template-clean-bilingual-v1',
    name: '轻量双行',
    scene: '品牌感口播、知识讲解、双语字幕',
    engine: 'css-overlay',
    motion: 'static-card',
    source: 'PupCaps/CSS template',
    cssScope: `${CAPTION_TEMPLATE_NAMESPACE}--clean-bilingual`,
    sample: '保持简单，但更有质感',
    highlight: '质感',
    tags: ['字幕模板', '双行', '品牌', '简洁'],
    style: {
      fontFamily: 'Inter, Microsoft YaHei, sans-serif',
      fontSize: 32,
      textColor: '#f8fafc',
      keywordColor: '#a7f3d0',
      strokeColor: '#0f172a',
      background: 'linear-gradient(180deg, rgb(15 23 42 / 54%), rgb(15 23 42 / 74%))',
      shadow: '0 12px 28px rgb(0 0 0 / 28%)',
      align: 'bottom-center'
    }
  }
];

export function filterCaptionTemplatePresets(query: string, activeFilter: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return captionTemplatePresets.filter((template) => {
    const haystack = [template.name, template.scene, template.sample, template.source, ...template.tags].join(' ').toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesFilter = activeFilter === '全部' || activeFilter === '字幕模板' || haystack.includes(activeFilter.toLowerCase());
    return matchesQuery && matchesFilter;
  });
}

export function getCaptionTemplatePreviewText(template: CaptionTemplatePreset) {
  const [before, after] = template.sample.split(template.highlight);
  if (!after) return { before: template.sample, keyword: '', after: '' };
  return { before, keyword: template.highlight, after };
}
