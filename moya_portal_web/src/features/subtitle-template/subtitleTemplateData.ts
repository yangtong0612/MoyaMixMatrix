import type { SubtitleTemplate } from './subtitleTemplateTypes';

const titleFont = '"Moya Smiley Sans", "Smiley Sans Oblique", "Smiley Sans", "Microsoft YaHei", sans-serif';
const cleanFont = '"Moya Resource Han Rounded CN", "Resource Han Rounded CN", "Microsoft YaHei", sans-serif';
const handFont = '"Moya LXGW WenKai", "LXGW WenKai", "KaiTi", "Microsoft YaHei", cursive';

export const subtitleTemplates: SubtitleTemplate[] = [
  {
    id: 'premium-red-bilingual',
    name: '高级红·双语',
    titleCopy: '3步搞定视频\n渡鸦数字人让秒变大神',
    captionCopy: '渡鸦数字人让 数字人活起来',
    badgeCopy: '高级红',
    bilingual: true,
    theme: {
      titleColor: '#ffffff',
      titleStroke: '#7f1028',
      captionColor: '#ffffff',
      captionShadow: '#111111',
      keywordBackground: '#8a1230',
      keywordColor: '#ffffff',
      accent: '#1f77ff'
    },
    titlePosition: { x: 50, y: 17 },
    captionPosition: { x: 50, y: 69 },
    titleTextStyle: { fontSize: 28, fontFamily: titleFont, width: 320, height: 88 },
    captionTextStyle: { fontSize: 20, fontFamily: titleFont, width: 320, height: 74 }
  },
  {
    id: 'luxury-white-bilingual',
    name: '轻奢白·双语',
    titleCopy: '智能加字幕\n双行排版更网感',
    captionCopy: '关键词',
    badgeCopy: '轻奢白',
    bilingual: true,
    theme: {
      titleColor: '#f8f4e8',
      titleStroke: '#2f241d',
      captionColor: '#ffffff',
      captionShadow: '#4c3b32',
      keywordBackground: '#f8f4e8',
      keywordColor: '#1f2933',
      accent: '#1f77ff'
    },
    titlePosition: { x: 50, y: 17 },
    captionPosition: { x: 50, y: 62 },
    titleTextStyle: { fontSize: 24, fontFamily: handFont, width: 322, height: 84 },
    captionTextStyle: { fontSize: 28, fontFamily: titleFont, width: 260, height: 76 }
  },
  {
    id: 'classic-blue-bilingual',
    name: '经典蓝·双语',
    titleCopy: '智能加标题',
    captionCopy: '双语字幕',
    badgeCopy: '经典蓝',
    bilingual: true,
    theme: {
      titleColor: '#9ff8ff',
      titleStroke: '#0c3a4a',
      captionColor: '#ffffff',
      captionShadow: '#293241',
      keywordBackground: '#10c6d7',
      keywordColor: '#082f35',
      accent: '#1f77ff'
    },
    titlePosition: { x: 50, y: 17 },
    captionPosition: { x: 50, y: 71 },
    titleTextStyle: { fontSize: 25, fontFamily: titleFont, width: 320, height: 78 },
    captionTextStyle: { fontSize: 16, fontFamily: cleanFont, width: 300, height: 78 }
  },
  {
    id: 'yellow-flash',
    name: '黄色闪亮',
    titleCopy: '智能加标题',
    captionCopy: '自动识别添加字幕',
    badgeCopy: '超满足',
    bilingual: false,
    theme: {
      titleColor: '#ffe45c',
      titleStroke: '#5b4500',
      captionColor: '#fff1a8',
      captionShadow: '#332700',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      accent: '#1f77ff'
    },
    titlePosition: { x: 50, y: 18 },
    captionPosition: { x: 50, y: 71 },
    titleTextStyle: { fontSize: 26, fontFamily: titleFont, width: 314, height: 78 },
    captionTextStyle: { fontSize: 15, fontFamily: cleanFont, width: 300, height: 54 }
  },
  {
    id: 'simple-yellow-white',
    name: '简洁黄白',
    titleCopy: '智能加标题',
    captionCopy: '自动识别添加字幕',
    badgeCopy: '黄白',
    bilingual: false,
    theme: {
      titleColor: '#ffffff',
      titleStroke: '#44403c',
      captionColor: '#fff7d6',
      captionShadow: '#222222',
      keywordBackground: '#facc15',
      keywordColor: '#111827',
      accent: '#1f77ff'
    },
    titlePosition: { x: 36, y: 18 },
    captionPosition: { x: 50, y: 72 },
    titleTextStyle: { fontSize: 25, fontFamily: titleFont, width: 300, height: 76 },
    captionTextStyle: { fontSize: 15, fontFamily: cleanFont, width: 292, height: 54 }
  },
  {
    id: 'translucent-dark',
    name: '轻透雅黑',
    titleCopy: '智能加标题',
    captionCopy: '自动识别\n添加字幕',
    badgeCopy: '轻透',
    bilingual: false,
    theme: {
      titleColor: '#ff5d9e',
      titleStroke: '#111111',
      captionColor: '#ffffff',
      captionShadow: '#111111',
      keywordBackground: '#ff5d9e',
      keywordColor: '#ffffff',
      accent: '#1f77ff'
    },
    titlePosition: { x: 42, y: 18 },
    captionPosition: { x: 50, y: 69 },
    titleTextStyle: { fontSize: 24, fontFamily: titleFont, width: 318, height: 76 },
    captionTextStyle: { fontSize: 16, fontFamily: cleanFont, width: 298, height: 58 }
  },
  {
    id: 'basic-white-gold',
    name: '基础白金',
    titleCopy: '智能加标题',
    captionCopy: '自动识别添加字幕',
    badgeCopy: '白金',
    bilingual: false,
    theme: {
      titleColor: '#fef3c7',
      titleStroke: '#6b4e16',
      captionColor: '#ffffff',
      captionShadow: '#342b1a',
      keywordBackground: '#d6a742',
      keywordColor: '#ffffff',
      accent: '#1f77ff'
    },
    titlePosition: { x: 50, y: 18 },
    captionPosition: { x: 50, y: 73 },
    titleTextStyle: { fontSize: 25, fontFamily: titleFont, width: 318, height: 76 },
    captionTextStyle: { fontSize: 15, fontFamily: cleanFont, width: 300, height: 54 }
  },
  {
    id: 'eye-catching-green',
    name: '吸睛绿',
    titleCopy: '【智能加标题】',
    captionCopy: '双行排版更网感',
    badgeCopy: '吸睛绿',
    bilingual: false,
    theme: {
      titleColor: '#ffffff',
      titleStroke: '#0f172a',
      captionColor: '#00f0a8',
      captionShadow: '#06382e',
      keywordBackground: '#00d48f',
      keywordColor: '#052e25',
      accent: '#1f77ff'
    },
    titlePosition: { x: 50, y: 17 },
    captionPosition: { x: 50, y: 73 },
    titleTextStyle: { fontSize: 24, fontFamily: titleFont, width: 326, height: 74 },
    captionTextStyle: { fontSize: 16, fontFamily: cleanFont, width: 306, height: 56 }
  }
];

export const defaultSubtitleKeywords = '数字人, 视频创作, 字幕模板, 小白';
