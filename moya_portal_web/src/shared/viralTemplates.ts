import type { CSSProperties } from 'react';

export type ViralTemplateKey = 'street' | 'seed' | 'deal' | 'story' | 'list' | 'expert' | 'compare' | 'urgency' | 'local' | 'live';

export interface ViralTemplate {
  key: ViralTemplateKey;
  name: string;
  scene: string;
  rhythm: string;
  accent: string;
  caption: string;
  effects: string[];
}

export interface ViralTemplateCard extends ViralTemplate {
  cardId: string;
  cardName: string;
  variantIndex: number;
  custom?: boolean;
  sourceSummary?: string;
}

export interface ViralOverlayTextStyle {
  fontSize: number;
  fontFamily: string;
  width: number;
  height: number;
}

interface ViralTemplateTheme {
  titleBackground: string;
  titleColor: string;
  captionBackground: string;
  captionColor: string;
  keywordBackground: string;
  keywordColor: string;
  effectBackground: string;
  glowColor: string;
}

export const viralTemplates: ViralTemplate[] = [
  {
    key: 'street',
    name: '街访爆点',
    scene: '前三秒强钩子，字幕大字居中，适合口播、探店、测评',
    rhythm: '快切 0.8x-1.2x / 每 2 秒一次强调',
    accent: '蓝白描边大标题',
    caption: '关键词跳字 + 数字高亮',
    effects: ['开场冲击标题', '关键词花字', '轻微推拉', '转场音效', '结尾行动指令']
  },
  {
    key: 'seed',
    name: '种草清单',
    scene: '产品卖点逐条展开，适合美妆、服饰、家居',
    rhythm: '稳定口播 + 卖点处放大 108%',
    accent: '柔和贴纸标签',
    caption: '双行字幕 + 卖点色块',
    effects: ['卖点标签', '价格/利益点花字', 'BGM 自动压低', '柔光滤镜', '封面标题']
  },
  {
    key: 'deal',
    name: '成交转化',
    scene: '痛点-方案-证明-行动，适合课程、服务、本地生活',
    rhythm: '前 5 秒密集信息，CTA 段加重音效',
    accent: '黑黄警示标题',
    caption: '痛点词红色强调',
    effects: ['痛点弹幕', '案例截图框', '信任背书贴纸', 'CTA 按钮动效', '收尾提示音']
  },
  {
    key: 'story',
    name: '故事反转',
    scene: '先设悬念再解释，适合个人 IP、剧情口播',
    rhythm: '悬念停顿 + 反转点闪白',
    accent: '电影感字幕条',
    caption: '分句字幕 + 情绪词强调',
    effects: ['悬念标题', '反转闪白', '镜头慢推', '情绪音效', '结尾复盘卡']
  },
  {
    key: 'list',
    name: '清单盘点',
    scene: '按 1/2/3 递进讲卖点，适合教程、工具、好物合集',
    rhythm: '每 1.5 秒切一条 / 条目出现时轻弹',
    accent: '编号标签 + 清单进度',
    caption: '短句字幕 + 序号高亮',
    effects: ['编号卡片', '进度条', '条目弹出', '清单音效', '结尾总结卡']
  },
  {
    key: 'expert',
    name: '专家背书',
    scene: '用身份、数据、案例建立信任，适合知识付费、专业服务、B2B',
    rhythm: '稳重口播 / 证据点放慢停留',
    accent: '深色信息条 + 数据角标',
    caption: '数据词高亮 + 结论加粗',
    effects: ['身份铭牌', '数据卡片', '案例截图框', '低频提示音', '结论定版']
  },
  {
    key: 'compare',
    name: '前后对比',
    scene: '先展示问题，再展示改变，适合改造、护肤、学习、工具效率',
    rhythm: '前后段落强对照 / 转折处闪切',
    accent: '左右对比标签',
    caption: '对比词双色强调',
    effects: ['前后标签', '分屏辅助线', '转折闪切', '结果放大', '差异总结']
  },
  {
    key: 'urgency',
    name: '限时促单',
    scene: '利益点和截止时间前置，适合活动、团购、直播预告',
    rhythm: '快节奏压迫感 / CTA 高频重复',
    accent: '红黄倒计时标题',
    caption: '价格/时间词强高亮',
    effects: ['倒计时条', '价格爆闪', '库存角标', 'CTA 按钮', '收口提示音']
  },
  {
    key: 'local',
    name: '本地探店',
    scene: '位置、路线、体验感并行，适合门店、餐饮、生活服务',
    rhythm: '环境镜头 1 秒切换 / 到店点位强调',
    accent: '定位标签 + 路线贴纸',
    caption: '地址/套餐词高亮',
    effects: ['定位角标', '路线箭头', '套餐卡片', '环境快切', '到店 CTA']
  },
  {
    key: 'live',
    name: '直播切片',
    scene: '保留临场感和互动语气，适合直播带货、课程切片、连麦高光',
    rhythm: '口语快切 / 互动点弹幕增强',
    accent: '直播间状态条',
    caption: '口语字幕 + 弹幕关键词',
    effects: ['直播状态条', '弹幕强调', '价格条', '互动音效', '关注提示']
  }
];

export const viralTemplateVariantNames = [
  '高级红·双语',
  '轻奢白·双语',
  '经典蓝·双语',
  '黄色闪亮',
  '简洁黄白',
  '轻透雅黑',
  '基础白金',
  '百搭黄·双语',
  '顶奢',
  '商务科技',
  '醒目科普',
  '新闻蓝·AI画中画',
  '双行红白',
  '轻奢手写',
  '通勤绿蓝',
  '金色灵感',
  '知识讲解',
  '开小窗·素材',
  '智能识别',
  '粉色爆闪'
];

export const viralFontOptions = [
  { label: '思源粗黑', value: '"Moya Source Han Sans SC Heavy", "Source Han Sans SC Heavy", "Source Han Sans SC", "Microsoft YaHei", sans-serif' },
  { label: '思源黑体', value: '"Moya Source Han Sans SC", "Source Han Sans SC", "Microsoft YaHei", sans-serif' },
  { label: '系统黑体', value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: '标题粗黑', value: '"Moya Smiley Sans", "Smiley Sans Oblique", "Smiley Sans", "Microsoft YaHei", sans-serif' },
  { label: '清爽圆体', value: '"Moya Resource Han Rounded CN", "Resource Han Rounded CN", "Microsoft YaHei", sans-serif' },
  { label: '电影字幕', value: '"Moya Source Han Serif SC", "Source Han Serif SC", "SimSun", serif' },
  { label: '霞鹜文楷', value: '"Moya LXGW WenKai", "LXGW WenKai", "KaiTi", "Microsoft YaHei", cursive' }
];

export const viralTemplateCards: ViralTemplateCard[] = viralTemplateVariantNames.map((cardName, index) => {
  const template = viralTemplates[index % viralTemplates.length];
  return {
    ...template,
    cardId: `${template.key}-${index}`,
    cardName,
    variantIndex: index
  };
});

export function getViralTemplateCardCopy(template: ViralTemplateCard, fallbackText: string, _index: number) {
  const bilingual = /双语/.test(template.cardName);
  const subtitles = [
    '双行排版更网感',
    '自动识别添加字幕',
    '关键句跳字高亮',
    '智能翻译双语字幕',
    '开小拍匹配素材'
  ];
  const badgeByKey: Record<ViralTemplateKey, string> = {
    street: '智能翻译',
    seed: '关键词',
    deal: '痛点强化',
    story: '故事悬念',
    list: '自动识别',
    expert: '重点信息',
    compare: '前后对比',
    urgency: '超满足',
    local: '到店提示',
    live: '直播高光'
  };
  return {
    title: /手写|轻奢/.test(template.cardName) ? '沟通表达课' : '智能加标题',
    subtitle: bilingual ? `智能翻译双语字幕\nBilingual captions` : subtitles[template.variantIndex % subtitles.length],
    badge: badgeByKey[template.key] || fallbackText.slice(0, 6) || '自动字幕'
  };
}

function getViralTemplateTheme(template: ViralTemplateCard | ViralTemplate): ViralTemplateTheme {
  const name = 'cardName' in template ? template.cardName : template.name;
  if (/轻奢白|简洁黄白|基础白金/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#fff7d6',
      captionBackground: 'transparent',
      captionColor: '#ffffff',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      effectBackground: 'rgb(250 204 21 / 28%)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (/经典蓝|新闻蓝|通勤绿蓝|商务科技/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#dbeafe',
      captionBackground: 'transparent',
      captionColor: '#e0f2fe',
      keywordBackground: '#2563eb',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(37 99 235 / 42%)',
      glowColor: 'rgb(96 165 250 / 82%)'
    };
  }
  if (/黄色|金色|顶奢/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#fef3c7',
      captionBackground: 'transparent',
      captionColor: '#ffffff',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      effectBackground: 'rgb(250 204 21 / 34%)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (/粉色|醒目/.test(name)) {
    return {
      titleBackground: 'transparent',
      titleColor: '#fbcfe8',
      captionBackground: 'transparent',
      captionColor: '#ffffff',
      keywordBackground: '#db2777',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(219 39 119 / 42%)',
      glowColor: 'rgb(244 114 182 / 82%)'
    };
  }
  if (/爆点|高级红/.test(name) || template.key === 'street') {
    return {
      titleBackground: '#8a1230',
      titleColor: '#ffffff',
      captionBackground: 'rgb(0 0 0 / 58%)',
      captionColor: '#ffffff',
      keywordBackground: '#b0123c',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(138 18 48 / 52%)',
      glowColor: 'rgb(176 18 60 / 78%)'
    };
  }
  if (template.key === 'seed') {
    return {
      titleBackground: '#f59e0b',
      titleColor: '#ffffff',
      captionBackground: 'rgb(255 255 255 / 88%)',
      captionColor: '#17202e',
      keywordBackground: '#f9a8d4',
      keywordColor: '#831843',
      effectBackground: 'rgb(249 168 212 / 52%)',
      glowColor: 'rgb(244 114 182 / 78%)'
    };
  }
  if (template.key === 'deal' || /成交|转化/.test(name)) {
    return {
      titleBackground: '#111827',
      titleColor: '#facc15',
      captionBackground: 'rgb(17 24 39 / 82%)',
      captionColor: '#facc15',
      keywordBackground: '#dc2626',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(250 204 21 / 18%)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  if (template.key === 'story') {
    return {
      titleBackground: 'rgb(15 23 42 / 82%)',
      titleColor: '#ffffff',
      captionBackground: 'rgb(15 23 42 / 76%)',
      captionColor: '#ffffff',
      keywordBackground: '#a855f7',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(255 255 255 / 16%)',
      glowColor: 'rgb(168 85 247 / 78%)'
    };
  }
  if (template.key === 'list' || template.key === 'local') {
    return {
      titleBackground: '#0f766e',
      titleColor: '#ffffff',
      captionBackground: 'rgb(13 148 136 / 62%)',
      captionColor: '#ffffff',
      keywordBackground: '#14b8a6',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(13 148 136 / 54%)',
      glowColor: 'rgb(45 212 191 / 82%)'
    };
  }
  if (template.key === 'expert') {
    return {
      titleBackground: '#1e293b',
      titleColor: '#ffffff',
      captionBackground: 'rgb(30 41 59 / 78%)',
      captionColor: '#ffffff',
      keywordBackground: '#64748b',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(148 163 184 / 28%)',
      glowColor: 'rgb(148 163 184 / 72%)'
    };
  }
  if (template.key === 'compare') {
    return {
      titleBackground: 'linear-gradient(90deg, #2563eb, #ea580c)',
      titleColor: '#ffffff',
      captionBackground: 'rgb(124 58 237 / 64%)',
      captionColor: '#ffffff',
      keywordBackground: '#7c3aed',
      keywordColor: '#ffffff',
      effectBackground: 'rgb(124 58 237 / 48%)',
      glowColor: 'rgb(167 139 250 / 82%)'
    };
  }
  if (template.key === 'urgency') {
    return {
      titleBackground: '#dc2626',
      titleColor: '#ffffff',
      captionBackground: 'rgb(24 24 27 / 78%)',
      captionColor: '#fde68a',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      effectBackground: 'linear-gradient(90deg, #dc2626, #facc15)',
      glowColor: 'rgb(250 204 21 / 82%)'
    };
  }
  return {
    titleBackground: '#db2777',
    titleColor: '#ffffff',
    captionBackground: 'rgb(17 24 39 / 70%)',
    captionColor: '#ffffff',
    keywordBackground: '#db2777',
    keywordColor: '#ffffff',
    effectBackground: 'rgb(219 39 119 / 48%)',
    glowColor: 'rgb(244 114 182 / 82%)'
  };
}

export function viralTemplateThemeStyle(template: ViralTemplateCard | ViralTemplate): CSSProperties {
  const theme = getViralTemplateTheme(template);
  return {
    '--viral-title-bg': theme.titleBackground,
    '--viral-title-color': theme.titleColor,
    '--viral-caption-bg': theme.captionBackground,
    '--viral-caption-color': theme.captionColor,
    '--viral-keyword-bg': theme.keywordBackground,
    '--viral-keyword-color': theme.keywordColor,
    '--viral-effect-bg': theme.effectBackground,
    '--viral-glow-color': theme.glowColor,
    '--viral-title-font': getViralDisplayFont(template, 'title'),
    '--viral-subtitle-font': getViralDisplayFont(template, 'subtitle')
  } as CSSProperties;
}

export function getViralDisplayFont(template: ViralTemplateCard | ViralTemplate, layer: 'title' | 'subtitle') {
  const name = 'cardName' in template ? template.cardName : template.name;
  if (/手写|轻奢/.test(name)) return '"Moya LXGW WenKai", "LXGW WenKai", "KaiTi", "Microsoft YaHei", cursive';
  if (/科技|经典蓝|新闻蓝|智能识别/.test(name)) return '"Moya Source Han Sans SC Heavy", "Source Han Sans SC Heavy", "Source Han Sans SC", "Microsoft YaHei", sans-serif';
  if (/黄色|金色|顶奢|基础白金/.test(name)) return '"Moya Source Han Serif SC", "Source Han Serif SC", "SimSun", serif';
  if (/红|粉色|醒目/.test(name)) return '"Moya Smiley Sans", "Smiley Sans Oblique", "Smiley Sans", "Microsoft YaHei", sans-serif';
  if (layer === 'subtitle') return '"Moya Resource Han Rounded CN", "Resource Han Rounded CN", "Microsoft YaHei", sans-serif';
  return '"Moya Smiley Sans", "Smiley Sans Oblique", "Smiley Sans", "Microsoft YaHei", sans-serif';
}

export function getViralTemplateTextStyle(template: ViralTemplateCard | ViralTemplate, layer: 'title' | 'caption'): ViralOverlayTextStyle {
  const cardName = 'cardName' in template ? template.cardName : template.name;
  const titleFont = getViralDisplayFont(template, 'title');
  const subtitleFont = getViralDisplayFont(template, 'subtitle');
  if (layer === 'title') {
    if (template.key === 'deal') return { fontSize: 25, fontFamily: titleFont, width: 320, height: 82 };
    if (template.key === 'story') return { fontSize: 22, fontFamily: titleFont, width: 300, height: 74 };
    if (template.key === 'expert') return { fontSize: 22, fontFamily: titleFont, width: 316, height: 76 };
    if (template.key === 'urgency') return { fontSize: 26, fontFamily: titleFont, width: 326, height: 84 };
    if (template.key === 'live') return { fontSize: 23, fontFamily: titleFont, width: 318, height: 78 };
    return { fontSize: /简洁|轻奢|基础/.test(cardName) ? 21 : 24, fontFamily: titleFont, width: 320, height: 82 };
  }
  if (template.key === 'seed') return { fontSize: 15, fontFamily: subtitleFont, width: 300, height: /双语/.test(cardName) ? 78 : 54 };
  if (template.key === 'deal') return { fontSize: 16, fontFamily: subtitleFont, width: 310, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'story') return { fontSize: 15, fontFamily: subtitleFont, width: 320, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'list') return { fontSize: 16, fontFamily: subtitleFont, width: 306, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'expert') return { fontSize: 15, fontFamily: subtitleFont, width: 318, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'compare') return { fontSize: 16, fontFamily: subtitleFont, width: 318, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'urgency') return { fontSize: 17, fontFamily: subtitleFont, width: 312, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'local') return { fontSize: 16, fontFamily: subtitleFont, width: 308, height: /双语/.test(cardName) ? 78 : 58 };
  if (template.key === 'live') return { fontSize: 16, fontFamily: subtitleFont, width: 318, height: /双语/.test(cardName) ? 82 : 62 };
  return { fontSize: /双语/.test(cardName) ? 14 : 16, fontFamily: subtitleFont, width: 300, height: /双语/.test(cardName) ? 78 : 54 };
}

export function mergeViralTemplateTextStyle(
  template: ViralTemplateCard | ViralTemplate,
  layer: 'title' | 'caption',
  override?: Partial<ViralOverlayTextStyle>
): ViralOverlayTextStyle {
  return { ...getViralTemplateTextStyle(template, layer), ...(override || {}) };
}

export function getViralTemplatePreviewClass(template: ViralTemplateCard | ViralTemplate) {
  if (!('variantIndex' in template)) return 'variant-default';
  const classes = [
    'variant-high-red',
    'variant-luxury-white',
    'variant-classic-blue',
    'variant-yellow-flash',
    'variant-list-yellow-white',
    'variant-translucent-dark',
    'variant-basic-white-gold',
    'variant-versatile-yellow-bilingual',
    'variant-gold-luxury',
    'variant-business-tech',
    'variant-list-tech',
    'variant-news-blue',
    'variant-red-white',
    'variant-handwrite',
    'variant-commute-bluegreen',
    'variant-gold-inspire',
    'variant-knowledge',
    'variant-window-material',
    'variant-smart-recognition',
    'variant-pink-flash'
  ];
  return classes[template.variantIndex] || 'variant-default';
}
