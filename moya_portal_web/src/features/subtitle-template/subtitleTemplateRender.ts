import type {
  SubtitleCaptionEntrance,
  SubtitleCaptionSoundEffect,
  SubtitleCaptionSoundRhythm,
  SubtitleOpeningSoundEffect,
  SubtitleTemplate,
  SubtitleTemplateCaption,
  SubtitleTemplateOverlay,
  SubtitleTemplateVideoZoomRange,
  SubtitleTransitionSoundEffect
} from './subtitleTemplateTypes';

export function buildSubtitleOverlay(input: {
  template: SubtitleTemplate;
  captions: SubtitleTemplateCaption[];
  title: string;
  keywords: string;
  captionEntrance?: SubtitleCaptionEntrance;
  openingSoundEffect?: SubtitleOpeningSoundEffect;
  transitionSoundEffect?: SubtitleTransitionSoundEffect;
  captionSoundEffect?: SubtitleCaptionSoundEffect;
  captionSoundRhythm?: SubtitleCaptionSoundRhythm;
  videoZoomRanges?: SubtitleTemplateVideoZoomRange[];
}): SubtitleTemplateOverlay {
  return {
    templateKey: input.template.id,
    templateName: input.template.name,
    hook: input.title.trim() || buildOpeningTitle(input.template, input.captions[0]?.text || '网感剪辑'),
    isBilingual: input.template.bilingual,
    titleDuration: 'full',
    theme: input.template.theme,
    titlePosition: input.template.titlePosition,
    captionPosition: input.template.captionPosition,
    titleTextStyle: input.template.titleTextStyle,
    captionTextStyle: input.template.captionTextStyle,
    previewVideoFit: 'cover',
    captionEntrance: input.captionEntrance || 'none',
    openingSoundEffect: input.openingSoundEffect || 'none',
    transitionSoundEffect: input.transitionSoundEffect || 'none',
    captionSoundEffect: input.captionSoundEffect || 'none',
    captionSoundRhythm: input.captionSoundRhythm || 'recommended',
    videoZoomRanges: normalizeVideoZoomRanges(input.videoZoomRanges),
    keywords: input.keywords,
    subtitleSegments: input.captions.map((caption) => ({
      time: `${formatSubtitleTime(caption.start)} - ${formatSubtitleTime(caption.end)}`,
      text: caption.text,
      translation: input.template.bilingual ? caption.translation || buildCaptionTranslation(caption.text) : undefined
    }))
  };
}

function normalizeVideoZoomRanges(ranges?: SubtitleTemplateVideoZoomRange[]) {
  if (!Array.isArray(ranges)) return [];
  return ranges
    .map((range, index) => {
      const start = roundSeconds(Math.max(0, Number(range.start) || 0));
      const end = roundSeconds(Math.max(0, Number(range.end) || 0));
      return {
        id: String(range.id || `video-zoom-${index}-${start}-${end}`),
        start,
        end,
        scale: Number((Math.max(1.01, Math.min(1.3, Number(range.scale) || 1.2))).toFixed(2))
      };
    })
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end)
    .slice(0, 12);
}

function roundSeconds(value: number) {
  return Number((Math.round(value * 100) / 100).toFixed(2));
}

export function buildOpeningTitle(template: SubtitleTemplate, text: string) {
  return buildOpeningTitleFromKeywords(template, extractSubtitleKeywords(text), text);
}

export function buildOpeningTitleFromCaptions(template: SubtitleTemplate, captions: SubtitleTemplateCaption[], fallback: string) {
  const captionText = captions.slice(0, 6).map((caption) => caption.text).join(' ');
  return buildOpeningTitleFromKeywords(template, extractSubtitleKeywords(captionText || fallback), fallback, captionText);
}

function buildOpeningTitleFromKeywords(template: SubtitleTemplate, keywords: string[], fallback: string, sourceText = fallback) {
  const titleKeywords = normalizeTitleKeywords([...keywords, ...extractSubtitleKeywords(fallback)]);
  const naturalTitle = buildNaturalOpeningTitle(sourceText, titleKeywords, fallback);

  if (template.id === 'yellow-flash') return naturalTitle.split('\n')[0] || naturalTitle;
  if (template.id === 'eye-catching-green') return `【${naturalTitle.split('\n')[0] || naturalTitle}】`;
  return naturalTitle;
}

function normalizeTitleKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length >= 2)
    .filter((keyword) => {
      if (seen.has(keyword)) return false;
      seen.add(keyword);
      return true;
    })
    .slice(0, 6);
}

function buildNaturalOpeningTitle(sourceText: string, keywords: string[], fallback: string) {
  const text = normalizeCaptionText(sourceText || fallback);
  const location = pickLocation(text, keywords);
  const subject = pickSubject(text, keywords);
  const status = pickStatus(text);
  const sellingPoint = pickSellingPoint(text, keywords, location, subject);
  const action = pickAction(subject);

  const firstLine = compactTitleLine(
    location && subject
      ? `${location}这家${subject}${status}`
      : subject
        ? `这家${subject}${status}`
        : `${keywords[0] || normalizeFallbackTitle(fallback) || '这个内容'}${status}`
  );
  const secondLine = compactTitleLine(
    sellingPoint
      ? `${sellingPoint}${action}`
      : `${keywords.find((keyword) => keyword !== location && keyword !== subject) || subject || '亮点'}值得看看`
  );

  return dedupeTitleLines(firstLine, secondLine);
}

function normalizeCaptionText(text: string) {
  return text
    .replace(/[，,。.!！?？；;：:、]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickLocation(text: string, keywords: string[]) {
  const locationPatterns = [
    /(?:在|来|去|到)?([\u4e00-\u9fa5]{2,6})(?:百年|商圈|街|路|区|城|市|镇|店|夜市)/,
    /(广州|深圳|上海|北京|杭州|成都|重庆|武汉|南京|苏州|泸州|佛山|东莞|厦门|西安|长沙|郑州|天津)/
  ];
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) return trimTitleToken(match[1]);
  }
  return keywords.find((keyword) => /广州|深圳|上海|北京|杭州|成都|重庆|武汉|南京|苏州|泸州|佛山|东莞|厦门|西安|长沙|郑州|天津/.test(keyword)) || '';
}

function pickSubject(text: string, keywords: string[]) {
  const candidates = [
    '服装店',
    '中餐店',
    '餐厅',
    '小店',
    '门店',
    '店',
    '视频',
    '数字人',
    '工具',
    '课程',
    '教程'
  ];
  const fromText = candidates.find((candidate) => text.includes(candidate));
  if (fromText) return fromText === '店' ? '店' : fromText;
  const fromKeyword = keywords.find((keyword) => /店|餐|服装|视频|数字人|工具|课程|教程/.test(keyword));
  if (fromKeyword) {
    if (/服装/.test(fromKeyword)) return '服装店';
    if (/餐|中餐/.test(fromKeyword)) return '餐厅';
    return trimTitleToken(fromKeyword);
  }
  return '';
}

function pickStatus(text: string) {
  if (/很火|火爆|爆火|火了|排队|热门/.test(text)) return '火了';
  if (/真香|好吃|美味|新鲜/.test(text)) return '真香';
  if (/好逛|值得逛|逛/.test(text)) return '值得逛';
  if (/简单|零基础|小白|上手/.test(text)) return '很好上手';
  return '值得看';
}

function pickSellingPoint(text: string, keywords: string[], location: string, subject: string) {
  const patterns = [
    /(近?[一二三四五六七八九十百千万两\d]+百多?平)/,
    /([\u4e00-\u9fa5\d]+平(?:方)?)/,
    /(食材新鲜|性价比高|质感不错|款式很多|很好逛|值得逛|零基础|小白也能做|简单上手|猛火爆炒|很有锅气)/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return trimTitleToken(match[1]);
  }
  return keywords.find((keyword) => keyword !== location && keyword !== subject && !/视频告诉|告诉你|这个|那个/.test(keyword)) || '';
}

function pickAction(subject: string) {
  if (/服装|店|门店|商场/.test(subject)) return '值得逛';
  if (/餐|中餐|小店/.test(subject)) return '值得试';
  if (/教程|课程|工具|数字人|视频/.test(subject)) return '值得学';
  return '值得看';
}

function compactTitleLine(line: string) {
  return line
    .replace(/一条视频告诉你们?/g, '')
    .replace(/一条视频告诉/g, '')
    .replace(/告诉你们?/g, '')
    .replace(/这个|那个|就是|然后|真的/g, '')
    .replace(/\s+/g, '')
    .slice(0, 14);
}

function dedupeTitleLines(firstLine: string, secondLine: string) {
  const safeFirst = firstLine || '这个内容值得看';
  let safeSecond = secondLine || '亮点值得看看';
  if (safeFirst === safeSecond || safeFirst.includes(safeSecond) || safeSecond.includes(safeFirst)) {
    safeSecond = '亮点值得看看';
  }
  return `${safeFirst}\n${safeSecond}`;
}

function trimTitleToken(token: string) {
  return token.replace(/^在|^来|^去|^到/, '').replace(/的$/, '').trim();
}

function normalizeFallbackTitle(text: string) {
  const clean = text.replace(/\.[^.\\/]+$/, '').replace(/[_-]+/g, ' ').trim();
  return (clean.match(/[\u4e00-\u9fa5]{2,10}|[A-Za-z0-9]{3,16}/)?.[0] || '').trim();
}

export function buildCaptionTranslation(text: string) {
  if (/数字人|虚拟人|AI/i.test(text)) return 'Make digital avatars easier to understand.';
  if (/小白|新手|零基础/.test(text)) return 'Even beginners can get started quickly.';
  if (/视频|创作|剪辑/.test(text)) return 'Finish video creation with a clear rhythm.';
  if (/字幕|模板|关键词/.test(text)) return 'Use captions and templates to highlight the point.';
  return 'Highlight the key message and make it memorable.';
}

export function extractSubtitleKeywords(text: string) {
  const stopWords = new Set(['我们', '你们', '他们', '这个', '那个', '然后', '因为', '所以', '就是', '可以', '已经', '现在', '如果', '不是', '没有']);
  const scores = new Map<string, number>();
  for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,6}|[A-Za-z0-9]{3,}/g)) {
    const value = match[0];
    if (stopWords.has(value)) continue;
    const signal = /数字|创作|字幕|模板|配音|小白|基础|口播|剪辑|智能|高亮|视频/.test(value);
    scores.set(value, (scores.get(value) || 0) + (signal ? 3 : 1));
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .map(([value]) => value)
    .slice(0, 8);
}

export function formatSubtitleTime(seconds: number) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const total = Math.floor(safeSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const centiseconds = Math.floor((safeSeconds % 1) * 100);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}

export function formatClock(seconds: number) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const rest = Math.floor(safeSeconds % 60);
  const centiseconds = Math.floor((safeSeconds % 1) * 100);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
}
