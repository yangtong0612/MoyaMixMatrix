import { Component, Suspense, lazy, useEffect, useRef, useState, type CSSProperties, type DragEvent, type ErrorInfo, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { flushSync } from 'react-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Clapperboard,
  Crop,
  Download,
  Eye,
  Flame,
  Home,
  ImagePlus,
  Info,
  ListVideo,
  MonitorSmartphone,
  Moon,
  Package,
  PlayCircle,
  Repeat2,
  RotateCcw,
  Settings,
  ShoppingBag,
  Search,
  X,
  Sparkles,
  Store,
  Sun,
  Trash2,
  Type,
  Upload,
  UserRound,
  Volume2,
  WandSparkles
} from 'lucide-react';
import { CloudDrivePage } from '@/features/cloud-drive/CloudDrivePage';
import { CaptionTemplateEmpty, CaptionTemplateShowcase, filterCaptionTemplatePresets } from '@/features/caption-templates';
import { useEditorStore } from '@/features/editor/editorStore';
import {
  cacheProductVideoAssetLocally,
  createProductVideoTask,
  getProductVideoAssetAccessUrl,
  getProductVideoConfigStatus,
  getProductVideoTaskStatus,
  readProductVideoAssetAsDataUrl,
  uploadProductVideoAsset,
  type ProductVideoTaskStatus
} from '@/features/product-video/productVideoApi';
import moyaMatrixLogo from '@/assets/moya-matrix-logo.svg';
import { buildMaterialSplitSegments, materialSplitPresets, type MaterialSplitPlanSegment, type MaterialSplitPresetKey } from '@/shared/mediaSplit';
import type { MediaCacheResult, MediaCropResult, MediaProbeResult, MediaSplitResult, OssUploadProgress, OssUploadResult } from '@/shared/types/electron';

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/materials', label: '素材库', icon: ImagePlus },
  { to: '/cloud-drive', label: '网盘', icon: Cloud },
  { to: '/editor', label: '剪辑', icon: Clapperboard },
  { to: '/transfers', label: '传输', icon: Download },
  { to: '/settings', label: '设置', icon: Settings }
];

const workspaceNavItems = [
  ...navItems.slice(0, 4),
  { to: '/subtitle-template', label: '字幕模板', icon: Type },
  ...navItems.slice(4)
];

const sidebarNavItems = [
  ...navItems.slice(0, 4),
  { to: '/subtitle-template', label: '字幕模板', icon: WandSparkles },
  ...navItems.slice(4)
];

const editorLoadingStages = [
  '正在预热资源引擎',
  '正在装配时间线布局',
  '正在连接素材与预览面板'
];

const LazyEditorPage = lazy(async () => {
  const module = await import('@/features/editor/EditorPage');
  return { default: module.EditorPage };
});

const LazySubtitleTemplatePage = lazy(async () => {
  const module = await import('@/features/subtitle-template/SubtitleTemplatePage');
  return { default: module.SubtitleTemplatePage };
});

type EditorRouteBoundaryState = {
  error: Error | null;
};

class EditorRouteBoundary extends Component<{ children: ReactNode }, EditorRouteBoundaryState> {
  state: EditorRouteBoundaryState = {
    error: null
  };

  static getDerivedStateFromError(error: Error): EditorRouteBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Editor route crashed:', error, info);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return <EditorRouteFailure error={this.state.error} onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}

type ProductVideoScenarioKey = 'product-spokesperson' | 'product-showcase' | 'store-traffic' | 'hot-replica';
type ProductVideoProgressStage = 'idle' | 'uploading' | 'signing' | 'submitting' | 'generating' | 'done' | 'failed';
type ProductVideoTaskThread = {
  id: string;
  taskId: string;
  title?: string;
  scenario?: ProductVideoScenarioKey;
  description?: string;
  productImage?: string;
  productImages?: string[];
  storeImages?: string[];
  referenceVideo?: string | null;
  status?: string;
  successful?: boolean;
  finished?: boolean;
  videoUrl?: string;
  cachedVideoPath?: string;
  message?: string;
  model?: string;
  quality?: string;
  ratio?: string;
  duration?: string;
  createdAt?: string;
  updatedAt?: string;
};

type ProductVideoTaskThreadStore = Record<ProductVideoScenarioKey, ProductVideoTaskThread[]>;

const productVideoScenarioKeys: ProductVideoScenarioKey[] = ['product-spokesperson', 'product-showcase', 'store-traffic', 'hot-replica'];
const PRODUCT_VIDEO_TASKS_STORE_KEY = 'moya-product-video-tasks-by-scenario';
const LEGACY_PRODUCT_VIDEO_TASKS_STORAGE_KEY = 'moya-product-video-tasks';
const MAX_PRODUCT_VIDEO_TASKS_PER_SCENARIO = 12;

const productVideoScenarios: Array<{
  key: ProductVideoScenarioKey;
  title: string;
  subtitle: string;
  prompt: string;
  output: string;
  icon: typeof ShoppingBag;
  tone: string;
}> = [
  {
    key: 'product-spokesperson',
    title: '商品口播',
    subtitle: '商品图 + 卖点，一键生成真人讲解口播',
    prompt: '上传商品图 / 详情页',
    output: '卖点脚本 · 数字人口播 · 爆款字幕',
    icon: ShoppingBag,
    tone: 'speech'
  },
  {
    key: 'product-showcase',
    title: '商品展示',
    subtitle: '围绕产品外观、细节、使用场景生成展示视频',
    prompt: '上传商品主图 / 场景图',
    output: '细节镜头 · 功能亮点 · 节奏卡点',
    icon: Package,
    tone: 'showcase'
  },
  {
    key: 'store-traffic',
    title: '门店引流',
    subtitle: '门头、环境、团购活动自动包装成本地生活视频',
    prompt: '上传门店图 / 活动海报',
    output: '位置引导 · 到店理由 · 优惠 CTA',
    icon: Store,
    tone: 'store'
  },
  {
    key: 'hot-replica',
    title: '爆款复刻',
    subtitle: '参考爆款结构，复刻标题、节奏、字幕和转化钩子',
    prompt: '粘贴爆款链接 / 上传参考视频',
    output: '拆解结构 · 同款节奏 · 差异化成片',
    icon: Flame,
    tone: 'replica'
  }
];

const materialSourceCategories = [
  {
    title: '商品素材',
    subtitle: '商品图、详情页、卖点标签集中沉淀，生成商品视频时直接调用',
    source: '商品图 / 详情页',
    action: '整理商品素材',
    to: '/cloud-drive',
    icon: Package,
    tone: 'product',
    tags: ['商品图', '详情页', '卖点']
  },
  {
    title: '爆款参考',
    subtitle: '收藏爆款视频链接、拆解结构和参考片段，给复刻任务提供来源',
    source: '参考视频 / 爆款链接',
    action: '创建复刻任务',
    to: '/product-video/create?scenario=hot-replica',
    icon: Flame,
    tone: 'viral',
    tags: ['参考视频', '爆款链接', '结构拆解']
  },
  {
    title: '门店素材',
    subtitle: '沉淀门头、环境、活动海报和团购图，快速生成同城引流内容',
    source: '门头 / 环境 / 活动',
    action: '生成门店视频',
    to: '/product-video/create?scenario=store-traffic',
    icon: Store,
    tone: 'store',
    tags: ['门店图', '活动海报', '团购']
  },
  {
    title: '包装素材',
    subtitle: '收纳贴纸、音效、花字和字幕模板，剪辑包装时统一取用',
    source: '贴纸 / 音效 / 花字',
    action: '进入网感剪辑',
    to: '/editor?workflow=viral',
    icon: Sparkles,
    tone: 'package',
    tags: ['贴纸', '音效', '花字']
  }
];

const materialQuickFilters = ['全部', '商品图', '爆款链接', '门店图', '字幕模板', '贴纸', '音效'];
const MATERIAL_SOURCE_API_BASE_KEY = 'moya-material-source-api-base';
const MATERIAL_SOURCE_DEFAULT_API_BASE = 'http://localhost:8787';
const MATERIAL_SOURCE_USER_ID = 'moya-matrix-materials';

const materialCropPresets = [
  { key: 'original', label: '原始', detail: '完整画面' },
  { key: '9:16', label: '9:16', detail: '竖屏裁剪' },
  { key: '1:1', label: '1:1', detail: '方形裁剪' },
  { key: '16:9', label: '16:9', detail: '横屏裁剪' },
  { key: 'free', label: '手动', detail: '播放区框选' }
] as const;

type MaterialCropPresetKey = typeof materialCropPresets[number]['key'];

type MaterialCropRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MaterialSourceTask = {
  id: string;
  text?: string;
  sourceUrl?: string;
  platform?: string;
  userId?: string;
  title?: string;
  author?: string;
  coverUrl?: string;
  status?: string;
  error?: string;
  videoUrl?: string;
  downloadUrl?: string;
  originVideoUrl?: string;
  originDownloadUrl?: string;
  localFile?: string;
  createdAt?: string;
  updatedAt?: string;
};

type MaterialBatchSplitStatus = 'queued' | 'probing' | 'splitting' | 'done' | 'failed';

type MaterialBatchSplitItem = {
  id: string;
  localPath: string;
  name: string;
  status: MaterialBatchSplitStatus;
  duration?: number;
  outputDir?: string;
  segments?: MediaSplitResult['segments'];
  error?: string;
};

const productSamples = [
  { id: 'skin', name: '护肤精华', color: '#7f91ff', copy: '淡纹紧致' },
  { id: 'coffee', name: '冷萃咖啡', color: '#10b981', copy: '低糖提神' },
  { id: 'lamp', name: '护眼台灯', color: '#f59e0b', copy: '柔光无频闪' }
];

const storeSamples = [
  { id: 'hotpot', name: '老街火锅', color: '#f97316', copy: '老街火锅' },
  { id: 'coffee-shop', name: '街角咖啡', color: '#14b8a6', copy: '咖啡小店' },
  { id: 'bakery', name: '城市烘焙', color: '#f59e0b', copy: '城市烘焙' }
];

const productScenarioVisuals: Record<ProductVideoScenarioKey, {
  eyebrow: string;
  inputTitle: string;
  outputTitle: string;
  inputImages: string[];
  outputImage: string;
  tags: string[];
}> = {
  'product-spokesperson': {
    eyebrow: '上传一张商品图',
    inputTitle: '商品主体清晰可见',
    outputTitle: '数字人口播成片',
    inputImages: [
      'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=420&q=82',
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=420&q=82'
    ],
    outputImage: 'https://images.pexels.com/photos/18077457/pexels-photo-18077457.jpeg?auto=compress&cs=tinysrgb&w=420&h=720&fit=crop',
    tags: ['真人讲解', '卖点字幕', '行动引导']
  },
  'product-showcase': {
    eyebrow: '上传一张商品图',
    inputTitle: '商品主体清晰可见',
    outputTitle: '高级展示视频',
    inputImages: [
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=420&q=82',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=420&q=82'
    ],
    outputImage: 'https://images.pexels.com/photos/26728100/pexels-photo-26728100.jpeg?auto=compress&cs=tinysrgb&w=420&h=720&fit=crop',
    tags: ['细节特写', '质感镜头', '场景展示']
  },
  'store-traffic': {
    eyebrow: '门头 + 环境 + 活动',
    inputTitle: '上传多张门店图',
    outputTitle: '同城探店视频',
    inputImages: [
      'https://images.pexels.com/photos/262978/pexels-photo-262978.jpeg?auto=compress&cs=tinysrgb&w=420&h=300&fit=crop',
      'https://images.pexels.com/photos/1581384/pexels-photo-1581384.jpeg?auto=compress&cs=tinysrgb&w=420&h=300&fit=crop'
    ],
    outputImage: 'https://images.pexels.com/photos/19243941/pexels-photo-19243941.jpeg?auto=compress&cs=tinysrgb&w=420&h=720&fit=crop',
    tags: ['门店环境', '到店理由', '优惠 CTA']
  },
  'hot-replica': {
    eyebrow: '爆款参考 + 商品替换',
    inputTitle: '上传参考视频',
    outputTitle: 'AI 同款复刻',
    inputImages: [
      'https://images.pexels.com/photos/12291879/pexels-photo-12291879.jpeg?auto=compress&cs=tinysrgb&w=420&h=720&fit=crop',
      'https://images.unsplash.com/photo-1607082350899-7e105aa886ae?auto=format&fit=crop&w=420&q=82'
    ],
    outputImage: 'https://images.pexels.com/photos/30870216/pexels-photo-30870216.jpeg?auto=compress&cs=tinysrgb&w=420&h=720&fit=crop',
    tags: ['结构拆解', '节奏复刻', '商品替换']
  }
};

interface DigitalHumanLook {
  id: string;
  label: string;
  scene: string;
  image: string;
  prompt: string;
  className: string;
}

function buildAvatarLooks(image: string): DigitalHumanLook[] {
  return [
    {
      id: 'identity',
      label: '主形象',
      scene: '基础身份锚点',
      image,
      prompt: '以主形象作为人物身份锚点，保持脸型、五官、发型、年龄感和整体气质一致。',
      className: 'scene-identity'
    },
    {
      id: 'product-live',
      label: '商品口播',
      scene: '直播间 / 产品台',
      image,
      prompt: '同一人物出现在商品口播、产品展示或直播间场景，可手持商品、指向产品或坐在产品台前讲解。',
      className: 'scene-product'
    },
    {
      id: 'store-traffic',
      label: '门店引流',
      scene: '门店 / 探店 / 爆款复刻',
      image,
      prompt: '同一人物出现在门店、本地生活、探店或爆款复刻场景，保持身份一致，只改变背景和镜头结构。',
      className: 'scene-store'
    }
  ];
}

const digitalHumanAvatars = [
  {
    id: 'yahan',
    name: '雅涵',
    role: '轻熟口播女主',
    prompt: '中国女性，轻熟亲和，适合护肤、美业、课程、本地生活口播。身份锚点为同一张脸、同一发型、同一年龄感，镜头表现温柔可信。',
    image: 'https://images.pexels.com/photos/26728100/pexels-photo-26728100.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/26728100/pexels-photo-26728100.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'meiqi',
    name: '美琪',
    role: '时尚导购女主',
    prompt: '中国年轻女性，时尚导购气质，适合服饰、美妆、潮流商品、门店探店和活动推荐。必须保持同一人物身份。',
    image: 'https://images.pexels.com/photos/18077457/pexels-photo-18077457.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/18077457/pexels-photo-18077457.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'laopan',
    name: '老潘',
    role: '资深商务男主',
    prompt: '中国中年男性，成熟稳重，适合招商、课程、数码、门店老板口播和高客单产品讲解。身份锚点必须稳定。',
    image: 'https://images.pexels.com/photos/16241480/pexels-photo-16241480.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/16241480/pexels-photo-16241480.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'xumengting',
    name: '许梦婷',
    role: '专业顾问女主',
    prompt: '中国女性，专业顾问、健康管理、美业咨询或门店专家形象，适合知识讲解、服务介绍和信任背书。保持同一张脸和专业气质。',
    image: 'https://images.pexels.com/photos/8442819/pexels-photo-8442819.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/8442819/pexels-photo-8442819.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'chenzhuo',
    name: '陈卓',
    role: '门店老板男主',
    prompt: '中国男性，门店老板或本地生活主理人形象，适合餐饮、同城团购、门店活动和到店引流口播。人物身份必须稳定。',
    image: 'https://images.pexels.com/photos/12291879/pexels-photo-12291879.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/12291879/pexels-photo-12291879.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'xiaoning',
    name: '夏宁',
    role: '门店制服女导购',
    prompt: '中国女性，门店导购、前台或服务制服造型，适合门店引流、活动介绍和新品推荐，表达清爽有亲和力。',
    image: 'https://images.pexels.com/photos/30870216/pexels-photo-30870216.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/30870216/pexels-photo-30870216.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'linlan',
    name: '林澜',
    role: '国风生活女主',
    prompt: '中国女性，国风生活方式主理人，适合茶饮、文旅、非遗、礼品和东方审美商品口播。保持同一身份锚点。',
    image: 'https://images.pexels.com/photos/19055839/pexels-photo-19055839.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/19055839/pexels-photo-19055839.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  },
  {
    id: 'ruoxi',
    name: '若曦',
    role: '户外探店女主',
    prompt: '中国年轻女性，户外探店、街区门店和生活方式推荐形象，适合本地生活、咖啡、烘焙和城市打卡内容。保持同一人物。',
    image: 'https://images.pexels.com/photos/19243941/pexels-photo-19243941.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: buildAvatarLooks('https://images.pexels.com/photos/19243941/pexels-photo-19243941.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop')
  }
];

function localFileUrl(filePath: string) {
  return `moya-media://file?path=${encodeURIComponent(filePath)}`;
}

function mediaPreviewUrl(path?: string | null) {
  if (!path) return '';
  if (/^(https?:|data:|blob:|moya-media:)/i.test(path)) return path;
  return localFileUrl(path);
}

function shouldRequestProtectedPreview(path?: string | null) {
  return Boolean(path && (/^oss:\/\//i.test(path) || /aliyuncs\.com/i.test(path)));
}

function signedMediaUrlExpiresAt(path?: string | null) {
  if (!path || !/^https?:/i.test(path)) return 0;
  try {
    const url = new URL(path);
    const tosDate = url.searchParams.get('X-Tos-Date');
    const tosExpires = Number(url.searchParams.get('X-Tos-Expires') ?? '');
    if (tosDate && Number.isFinite(tosExpires)) {
      const parsed = parseCompactUtcTimestamp(tosDate);
      if (parsed) return parsed + tosExpires * 1000;
    }
    const ossExpires = Number(url.searchParams.get('Expires') ?? '');
    if (Number.isFinite(ossExpires) && (url.searchParams.has('OSSAccessKeyId') || url.searchParams.has('Signature'))) {
      return ossExpires * 1000;
    }
  } catch {
    return 0;
  }
  return 0;
}

function parseCompactUtcTimestamp(value: string) {
  if (!/^\d{8}T\d{6}Z$/.test(value)) return 0;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const hour = Number(value.slice(9, 11));
  const minute = Number(value.slice(11, 13));
  const second = Number(value.slice(13, 15));
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function shouldRefreshExpiringVideoUrl(path?: string | null, thresholdMs = 60_000) {
  const expiresAt = signedMediaUrlExpiresAt(path);
  return Boolean(expiresAt && expiresAt - Date.now() <= thresholdMs);
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  let timeoutId = 0;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function normalizeMaterialSourceApiBase(value: string) {
  const base = String(value || '').trim().replace(/\/+$/, '');
  return base || MATERIAL_SOURCE_DEFAULT_API_BASE;
}

function extractFirstUrlFromText(text = '') {
  const match = String(text).match(/https?:\/\/[^\s"'<>，。；、)）\]]+/i);
  return match ? match[0] : '';
}

async function createMaterialSourceTask(apiBase: string, text: string) {
  const sourceUrl = extractFirstUrlFromText(text) || text.trim();
  const response = await fetch(`${apiBase}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      sourceUrl,
      userId: MATERIAL_SOURCE_USER_ID
    })
  });
  const body = await response.json().catch(() => null) as { task?: MaterialSourceTask; error?: string } | null;
  if (!response.ok || !body?.task) {
    throw new Error(body?.error || `创建解析任务失败：HTTP ${response.status}`);
  }
  return body.task;
}

async function getMaterialSourceTask(apiBase: string, taskId: string) {
  const response = await fetch(`${apiBase}/api/tasks/${encodeURIComponent(taskId)}?userId=${encodeURIComponent(MATERIAL_SOURCE_USER_ID)}`);
  const body = await response.json().catch(() => null) as { task?: MaterialSourceTask; error?: string } | null;
  if (!response.ok || !body?.task) {
    throw new Error(body?.error || `读取解析任务失败：HTTP ${response.status}`);
  }
  return body.task;
}

async function pollMaterialSourceTask(apiBase: string, taskId: string, onTask: (task: MaterialSourceTask) => void) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(attempt === 0 ? 800 : 1500);
    const task = await getMaterialSourceTask(apiBase, taskId);
    onTask(task);
    if (['ready', 'failed', 'needs_provider'].includes(String(task.status || '').toLowerCase())) return task;
  }
  throw new Error('解析任务等待超时，请稍后在素材库里重试。');
}

function materialTaskVideoSource(task?: MaterialSourceTask | null, apiBase?: string) {
  if (!task) return '';
  if (task.platform === 'local') return task.localFile || task.videoUrl || task.downloadUrl || task.sourceUrl || '';
  if (String(task.status || '').toLowerCase() === 'ready' && task.id && apiBase) {
    return `${normalizeMaterialSourceApiBase(apiBase)}/api/tasks/${encodeURIComponent(task.id)}/video.mp4?userId=${encodeURIComponent(MATERIAL_SOURCE_USER_ID)}`;
  }
  return task.videoUrl || task.downloadUrl || task.originVideoUrl || task.originDownloadUrl || '';
}

function materialTaskStatusLabel(task?: MaterialSourceTask | null) {
  const status = String(task?.status || '').toLowerCase();
  if (!task) return '等待导入';
  if (status === 'queued') return '排队中';
  if (status === 'resolving') return '解析中';
  if (status === 'downloading') return '下载中';
  if (status === 'ready') return '已入库';
  if (status === 'needs_provider') return '待配置解析服务';
  if (status === 'failed') return '解析失败';
  return task.status || '处理中';
}

function materialBatchSplitStatusLabel(status: MaterialBatchSplitStatus) {
  if (status === 'queued') return '待分割';
  if (status === 'probing') return '读取中';
  if (status === 'splitting') return '分割中';
  if (status === 'done') return '已完成';
  return '失败';
}

function formatSecondsLabel(value: number) {
  const total = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes}:${String(seconds).padStart(2, '0')}` : `0:${String(seconds).padStart(2, '0')}`;
}

function formatFileSize(size: number) {
  const value = Math.max(0, Number(size) || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function materialFileNameFromPath(filePath: string) {
  return String(filePath || '').split(/[\\/]/).pop() || '本地视频.mp4';
}

function clampMaterialCropRect(rect: MaterialCropRect): MaterialCropRect {
  const minSize = 0.04;
  const width = Math.max(minSize, Math.min(1, Number(rect.width) || 1));
  const height = Math.max(minSize, Math.min(1, Number(rect.height) || 1));
  const x = Math.max(0, Math.min(1 - width, Number(rect.x) || 0));
  const y = Math.max(0, Math.min(1 - height, Number(rect.y) || 0));
  return { x, y, width, height };
}

function buildMaterialCropRectForPreset(probe: MediaProbeResult | null, preset: MaterialCropPresetKey): MaterialCropRect {
  if (!probe?.width || !probe?.height || preset === 'original' || preset === 'free') {
    return { x: 0, y: 0, width: 1, height: 1 };
  }
  const ratios: Record<Exclude<MaterialCropPresetKey, 'original' | 'free'>, number> = {
    '9:16': 9 / 16,
    '1:1': 1,
    '16:9': 16 / 9
  };
  const targetRatio = ratios[preset];
  const sourceRatio = probe.width / probe.height;
  if (sourceRatio > targetRatio) {
    const width = targetRatio / sourceRatio;
    return clampMaterialCropRect({ x: (1 - width) / 2, y: 0, width, height: 1 });
  }
  const height = sourceRatio / targetRatio;
  return clampMaterialCropRect({ x: 0, y: (1 - height) / 2, width: 1, height });
}

function materialCropPixelLabel(rect: MaterialCropRect, probe: MediaProbeResult | null) {
  if (!probe?.width || !probe?.height) return '裁剪尺寸 --';
  const safeRect = clampMaterialCropRect(rect);
  return `${Math.round(safeRect.width * probe.width)}x${Math.round(safeRect.height * probe.height)}`;
}

function materialCropBoundsStyle(rect: MaterialCropRect): CSSProperties {
  const safeRect = clampMaterialCropRect(rect);
  return {
    left: `${safeRect.x * 100}%`,
    top: `${safeRect.y * 100}%`,
    width: `${safeRect.width * 100}%`,
    height: `${safeRect.height * 100}%`
  };
}

function materialSplitTrackStyle(segment: MaterialSplitPlanSegment, duration: number): CSSProperties {
  const safeDuration = Math.max(0.25, Number(duration) || 0);
  const segmentWidth = clampNumber((segment.duration / safeDuration) * 100, 8, 100);
  return { width: `${segmentWidth}%` };
}

function productVideoStatusText(task: ProductVideoTaskStatus) {
  if (task.videoUrl) return '生成完成，右侧已显示成片预览。';
  if (task.finished && !task.successful) return task.message || '生成失败，请检查素材或火山任务状态。';
  const normalized = (task.status || '').toLowerCase();
  if (normalized.includes('queue') || normalized.includes('pending')) return '任务排队中，正在等待云端调度...';
  if (normalized.includes('running') || normalized.includes('process') || normalized.includes('generat')) return '云端生成中，请稍等...';
  return task.status ? `云端状态：${task.status}` : '云端生成中，请稍等...';
}

function createEmptyProductVideoTaskThreadStore(): ProductVideoTaskThreadStore {
  return {
    'product-spokesperson': [],
    'product-showcase': [],
    'store-traffic': [],
    'hot-replica': []
  };
}

function isProductVideoScenarioKey(value: unknown): value is ProductVideoScenarioKey {
  return typeof value === 'string' && productVideoScenarioKeys.includes(value as ProductVideoScenarioKey);
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const next = value.trim();
  return next || undefined;
}

function nullableText(value: unknown) {
  if (value === null) return null;
  return optionalText(value);
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalStringArray(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const next = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return next.length ? next : undefined;
}

function taskThreadTimestamp(task: Pick<ProductVideoTaskThread, 'updatedAt' | 'createdAt'>) {
  const source = task.updatedAt || task.createdAt;
  if (!source) return 0;
  const timestamp = Date.parse(source);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function inferProductVideoTaskScenario(task: Record<string, unknown>) {
  if (isProductVideoScenarioKey(task.scenario)) return task.scenario;
  if (optionalStringArray(task.storeImages)?.length || optionalText(task.storeSample)) return 'store-traffic';
  if (optionalText(task.referenceVideo) || optionalText(task.referenceVideoUrl)) return 'hot-replica';
  const scenarioText = [optionalText(task.title), optionalText(task.prompt), optionalText(task.message), optionalText(task.description)]
    .filter(Boolean)
    .join(' ');
  if (/门店|探店|同城|引流|到店/.test(scenarioText)) return 'store-traffic';
  if (/复刻|爆款|参考视频/.test(scenarioText)) return 'hot-replica';
  if (/展示|大片|运镜|质感/.test(scenarioText)) return 'product-showcase';
  return 'product-spokesperson';
}

function normalizeProductVideoTaskThread(task: unknown) {
  if (!task || typeof task !== 'object') return null;
  const source = task as Record<string, unknown>;
  const taskId = optionalText(source.taskId);
  if (!taskId) return null;
  const scenario = inferProductVideoTaskScenario(source);
  return {
    ...source,
    id: optionalText(source.id) || `product-video-${taskId}`,
    taskId,
    scenario,
    title: optionalText(source.title),
    description: optionalText(source.description),
    productImage: optionalText(source.productImage),
    productImages: optionalStringArray(source.productImages),
    storeImages: optionalStringArray(source.storeImages),
    referenceVideo: nullableText(source.referenceVideo),
    status: optionalText(source.status),
    successful: optionalBoolean(source.successful),
    finished: optionalBoolean(source.finished),
    videoUrl: optionalText(source.videoUrl),
    cachedVideoPath: optionalText(source.cachedVideoPath),
    message: optionalText(source.message),
    model: optionalText(source.model),
    quality: optionalText(source.quality),
    ratio: optionalText(source.ratio),
    duration: optionalText(source.duration),
    createdAt: optionalText(source.createdAt),
    updatedAt: optionalText(source.updatedAt)
  } as ProductVideoTaskThread;
}

function buildProductVideoTaskThreadStore(tasks: unknown[]) {
  const byScenarioTaskId = new Map<string, ProductVideoTaskThread>();
  tasks.forEach((task) => {
    const normalized = normalizeProductVideoTaskThread(task);
    if (!normalized) return;
    const key = `${normalized.scenario}:${normalized.taskId}`;
    const existing = byScenarioTaskId.get(key);
    if (!existing || taskThreadTimestamp(normalized) >= taskThreadTimestamp(existing)) {
      byScenarioTaskId.set(key, normalized);
    }
  });
  const store = createEmptyProductVideoTaskThreadStore();
  Array.from(byScenarioTaskId.values())
    .sort((left, right) => taskThreadTimestamp(right) - taskThreadTimestamp(left))
    .forEach((task) => {
      const bucket = store[task.scenario || 'product-spokesperson'];
      if (bucket.length < MAX_PRODUCT_VIDEO_TASKS_PER_SCENARIO) bucket.push(task);
    });
  return store;
}

function flattenProductVideoTaskThreadStore(store: ProductVideoTaskThreadStore) {
  return productVideoScenarioKeys
    .flatMap((scenario) => store[scenario])
    .sort((left, right) => taskThreadTimestamp(right) - taskThreadTimestamp(left));
}

function normalizeProductVideoTaskThreadStore(value: unknown) {
  if (Array.isArray(value)) return buildProductVideoTaskThreadStore(value);
  if (!value || typeof value !== 'object') return createEmptyProductVideoTaskThreadStore();
  const source = value as Record<string, unknown>;
  const tasks = productVideoScenarioKeys.flatMap((scenario) => (Array.isArray(source[scenario]) ? source[scenario] : []));
  return buildProductVideoTaskThreadStore(tasks);
}

function readLegacyProductVideoRecentTasks() {
  try {
    const stored = JSON.parse(localStorage.getItem(LEGACY_PRODUCT_VIDEO_TASKS_STORAGE_KEY) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

async function persistProductVideoTaskThreadStore(store: ProductVideoTaskThreadStore) {
  const normalizedStore = normalizeProductVideoTaskThreadStore(store);
  const flattenedTasks = flattenProductVideoTaskThreadStore(normalizedStore);
  if (window.surgicol?.store?.set) {
    await window.surgicol.store.set(PRODUCT_VIDEO_TASKS_STORE_KEY, normalizedStore).catch(() => false);
  }
  try {
    localStorage.setItem(LEGACY_PRODUCT_VIDEO_TASKS_STORAGE_KEY, JSON.stringify(flattenedTasks));
  } catch {
    // Ignore browser storage write failures and keep Electron store as source of truth.
  }
  return normalizedStore;
}

async function readProductVideoRecentTaskThreadStore() {
  const persistedStore = window.surgicol?.store?.get
    ? normalizeProductVideoTaskThreadStore(await window.surgicol.store.get<unknown>(PRODUCT_VIDEO_TASKS_STORE_KEY).catch(() => null))
    : createEmptyProductVideoTaskThreadStore();
  const legacyTasks = readLegacyProductVideoRecentTasks();
  if (!legacyTasks.length) return persistedStore;
  const mergedStore = buildProductVideoTaskThreadStore([...flattenProductVideoTaskThreadStore(persistedStore), ...legacyTasks]);
  if (JSON.stringify(mergedStore) !== JSON.stringify(persistedStore)) {
    await persistProductVideoTaskThreadStore(mergedStore);
  }
  return mergedStore;
}

async function updateProductVideoRecentTask(taskId: string, nextTask: Record<string, unknown>) {
  const currentStore = await readProductVideoRecentTaskThreadStore();
  const currentTasks = flattenProductVideoTaskThreadStore(currentStore);
  const nextTasks: Array<ProductVideoTaskThread | Record<string, unknown>> = currentTasks.map((task) =>
    task.taskId === taskId ? { ...task, ...nextTask } : task
  );
  if (!nextTasks.some((task) => task.taskId === taskId)) {
    nextTasks.unshift(nextTask);
  }
  return persistProductVideoTaskThreadStore(buildProductVideoTaskThreadStore(nextTasks));
}

function formatTaskTime(value?: string) {
  if (!value) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function isOssConfigError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /OSS.*(未配置|endpoint|访问密钥|AccessKey|access key|未启用)/i.test(message);
}

function isRecoverableImageUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return isOssConfigError(error) || /OSS.*(timeout|timed out|failed|HTTP|network|socket|ECONN|ETIMEDOUT)|上传.*(超时|失败)/i.test(message);
}

function mergeMediaPaths(existing: string[], incoming: string[], limit = 6) {
  const next = [...existing];
  incoming.forEach((filePath) => {
    if (filePath && !next.includes(filePath)) next.push(filePath);
  });
  return next.slice(0, limit);
}

const supportedImageExtensions = new Set(['jpg', 'jpeg', 'png', 'webp']);

function isSupportedImagePath(filePath: string) {
  const extension = filePath.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase();
  return Boolean(extension && supportedImageExtensions.has(extension));
}

function droppedImagePaths(event: DragEvent<HTMLElement>) {
  const files = Array.from(event.dataTransfer.files || []);
  return files
    .map((file) => window.surgicol.file.getDroppedPath(file))
    .filter((filePath) => filePath && isSupportedImagePath(filePath));
}

interface ProductScenarioVisualProps {
  scenario: typeof productVideoScenarios[number];
  productVisual: { type: 'image' | 'sample'; value: string };
  storeVisual: { type: 'image' | 'sample'; value: string };
  referenceVideo?: string | null;
  sampleCopy: string;
}

function ScenarioFallbackImage({ src, alt = '', label, tone = 'product' }: { src: string; alt?: string; label: string; tone?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <>
      {!failed ? <img src={src} alt={alt} onError={() => setFailed(true)} /> : null}
      {failed ? (
        <span className={`scenario-fallback-art ${tone}`}>
          <i />
          <b>{label}</b>
        </span>
      ) : null}
    </>
  );
}

function AvatarFallbackImage({ src, alt, label }: { src: string; alt: string; label: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <span className="avatar-fallback-image">
      {!failed ? <img src={src} alt={alt} onError={() => setFailed(true)} /> : null}
      {failed ? (
        <span className="scenario-fallback-art avatar">
          <i />
          <b>{label}</b>
        </span>
      ) : null}
    </span>
  );
}

function ImageAssetManager({
  title,
  images,
  selectedIndex,
  sampleLabel,
  onUpload,
  onSelect,
  onPreview,
  onRemove,
  onDropFiles,
  onInvalidDrop
}: {
  title: string;
  images: string[];
  selectedIndex: number;
  sampleLabel: string;
  onUpload: () => void;
  onSelect: (index: number) => void;
  onPreview: (index: number) => void;
  onRemove: (index: number) => void;
  onDropFiles?: (files: string[]) => void;
  onInvalidDrop?: () => void;
}) {
  const selectedImage = images[selectedIndex] || images[0];
  const [isDraggingUpload, setIsDraggingUpload] = useState(false);
  const dragDepthRef = useRef(0);

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!onDropFiles) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingUpload(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!onDropFiles) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (!onDropFiles) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingUpload(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!onDropFiles) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingUpload(false);
    const files = droppedImagePaths(event);
    if (files.length) {
      onDropFiles(files);
      return;
    }
    onInvalidDrop?.();
  }

  return (
    <div className="image-asset-manager">
      <button
        className={`image-asset-preview${selectedImage ? ' has-image' : ''}${isDraggingUpload ? ' drag-over' : ''}`}
        type="button"
        onClick={onUpload}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {selectedImage ? (
          <img src={localFileUrl(selectedImage)} alt={`${title}预览`} />
        ) : (
          <>
            <ImagePlus size={24} />
            <strong>{title}</strong>
            <span>仅支持 jpg、jpeg、png、webp 图片，可批量上传</span>
          </>
        )}
      </button>
      <div className="image-asset-grid">
        {images.map((image, index) => (
          <div className={`image-asset-item${index === selectedIndex ? ' active' : ''}`} key={`${image}-${index}`}>
            <button type="button" className="image-asset-thumb" onClick={() => onSelect(index)} aria-label={`预览素材 ${index + 1}`}>
              <img src={localFileUrl(image)} alt={`素材 ${index + 1}`} />
            </button>
            <div className="image-asset-actions">
              <button type="button" onClick={() => onPreview(index)} aria-label={`预览素材 ${index + 1}`}>
                <Eye size={12} />
              </button>
              <button type="button" onClick={() => onRemove(index)} aria-label={`删除素材 ${index + 1}`}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className={`image-asset-add${isDraggingUpload ? ' drag-over' : ''}`}
          onClick={onUpload}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label="添加素材"
        >
          <ImagePlus size={16} />
        </button>
      </div>
      <span className="image-asset-empty">{images.length ? '仅支持图片文件：jpg、jpeg、png、webp' : sampleLabel}</span>
    </div>
  );
}

function ProductScenarioVisual({ scenario, productVisual, storeVisual, referenceVideo, sampleCopy }: ProductScenarioVisualProps) {
  const visual = productScenarioVisuals[scenario.key];
  const inputImages = (scenario.key === 'product-spokesperson' || scenario.key === 'product-showcase') && productVisual.type === 'image'
    ? [productVisual.value]
    : scenario.key === 'product-spokesperson' || scenario.key === 'product-showcase'
      ? [visual.inputImages[0]]
      : scenario.key === 'store-traffic' && storeVisual.type === 'image'
    ? [storeVisual.value, visual.inputImages[1]]
    : scenario.key !== 'store-traffic' && productVisual.type === 'image'
      ? [productVisual.value, visual.inputImages[1]]
      : visual.inputImages;
  const outputImage = scenario.key === 'product-spokesperson' || scenario.key === 'product-showcase' || scenario.key === 'store-traffic' || scenario.key === 'hot-replica'
    ? visual.outputImage
    : scenario.key !== 'store-traffic' && productVisual.type === 'image'
      ? productVisual.value
      : visual.outputImage;
  const hasUserProduct = productVisual.type === 'image';
  const videoLines = scenarioVideoLines(scenario.key, sampleCopy);
  const replicaProduct = hasUserProduct ? productVisual.value : visual.inputImages[1];
  const storeProp = scenario.key === 'store-traffic' && storeVisual.type === 'image' ? storeVisual.value : visual.inputImages[0];

  if (scenario.key === 'hot-replica') {
    return (
      <div className="product-scenario-visual replica replica-realistic">
        <div className="replica-source-block">
          <strong>爆款视频</strong>
          <div className="replica-video-phone">
            {referenceVideo ? (
              <video src={localFileUrl(referenceVideo)} muted />
            ) : (
              <ScenarioFallbackImage src={visual.inputImages[0]} label="爆款参考" tone={scenario.tone} />
            )}
            <span>
              <PlayCircle size={16} />
            </span>
          </div>
        </div>

        <div className="replica-product-transfer">
          <div className="replica-product-card">
            <ScenarioFallbackImage src={replicaProduct} label={sampleCopy} tone={scenario.tone} />
          </div>
          <small>商品图</small>
          <ArrowRight size={34} />
        </div>

        <div className="replica-output-block">
          <strong>AI 复刻</strong>
          <div className="replica-video-phone replica-result">
            <ScenarioFallbackImage src={outputImage} label="AI 复刻" tone={scenario.tone} />
            <div className="replica-hand-product">
              <ScenarioFallbackImage src={replicaProduct} label={sampleCopy} tone={scenario.tone} />
            </div>
            <span>AI生成</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`product-scenario-visual ${scenario.tone}`}>
      <div className="scenario-input-panel">
        <span>{visual.eyebrow}</span>
        <strong>{visual.inputTitle}</strong>
        <div className="scenario-input-assets">
          {inputImages.map((image, index) => (
            <div key={`${image}-${index}`} className={`scenario-input-thumb${scenario.key === 'hot-replica' && index === 0 ? ' video-thumb' : ''}`}>
              {scenario.key === 'hot-replica' && index === 0 && referenceVideo ? (
                <video src={localFileUrl(referenceVideo)} muted />
              ) : scenario.key === 'hot-replica' && index === 0 ? (
                <PlayCircle size={24} />
              ) : (
                <ScenarioFallbackImage src={image} label={index === 0 ? sampleCopy : visual.inputTitle} tone={scenario.tone} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="scenario-flow-arrow" aria-hidden="true">
        <ArrowRight size={34} />
      </div>

      <div className="scenario-output-phone">
        <span>AI生成</span>
        <div className={`scenario-phone-video ${scenario.key}`} aria-hidden="true">
          <ScenarioFallbackImage src={outputImage} label={visual.outputTitle} tone={scenario.tone} />
          <i className="scenario-video-shine" />
          <i className="scenario-video-focus" />
          {scenario.key === 'product-spokesperson' ? (
            <div className="scenario-spokesperson-layout">
              <div className="scenario-product-prop">
                <ScenarioFallbackImage src={hasUserProduct ? productVisual.value : inputImages[0]} label={sampleCopy} tone={scenario.tone} />
              </div>
            </div>
          ) : null}
          {scenario.key === 'product-showcase' ? (
            <div className="scenario-showcase-layout">
              <div className="scenario-showcase-product">
                <ScenarioFallbackImage src={hasUserProduct ? productVisual.value : inputImages[0]} label={sampleCopy} tone={scenario.tone} />
              </div>
              <div className="scenario-showcase-reflections">
                <i />
                <i />
              </div>
            </div>
          ) : null}
          {scenario.key === 'store-traffic' ? (
            <div className="scenario-store-layout">
              <div className="scenario-store-prop">
                <ScenarioFallbackImage src={storeProp} label={sampleCopy} tone={scenario.tone} />
              </div>
              <div className="scenario-store-sign">{sampleCopy}</div>
              <div className="scenario-store-frames">
                <i />
                <i />
                <i />
              </div>
            </div>
          ) : null}
          <div className="scenario-video-subtitle">
            {videoLines.map((line) => <b key={line}>{line}</b>)}
          </div>
          <div className="scenario-video-progress"><i /></div>
        </div>
        <div className="scenario-phone-caption">
          <strong>{visual.outputTitle}</strong>
          <small>{scenario.key === 'store-traffic' ? '同城客流引进店' : sampleCopy}</small>
        </div>
      </div>

      <div className="scenario-visual-tags">
        {visual.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    </div>
  );
}

function scenarioVideoLines(key: ProductVideoScenarioKey, sampleCopy: string) {
  if (key === 'store-traffic') return ['今天就来这家店', '环境好，味道稳'];
  if (key === 'hot-replica') return ['同款爆款结构', '卖点直接替换'];
  if (key === 'product-showcase') return ['细节质感拉满', sampleCopy || '功能亮点清晰'];
  return ['这款真的值得试', sampleCopy || '卖点清晰好讲'];
}

export function App() {
  const location = useLocation();
  const isNavigationLocked = useEditorStore((state) => state.isNavigationLocked);
  const navigationLockReason = useEditorStore((state) => state.navigationLockReason);
  const isEditorRoute = location.pathname.startsWith('/editor');
  const isSubtitleTemplateRoute = location.pathname.startsWith('/subtitle-template');
  const isProductCreateRoute = location.pathname.startsWith('/product-video/create');
  const isCloudRoute = location.pathname.startsWith('/cloud-drive') || location.pathname.startsWith('/transfers');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('moya-theme') === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('moya-theme', theme);
    document.documentElement.dataset.theme = theme;
    window.surgicol?.app?.setTitlebarTheme(theme).catch(() => undefined);
  }, [theme]);

  useEffect(() => {
    if (!isNavigationLocked) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isNavigationLocked]);

  const navigationLockTitle = navigationLockReason || '当前正在执行视频合成，请等待当前任务完成后再切换页面。';

  function preventLockedNavigation(event: ReactMouseEvent<HTMLElement>, targetPath?: string) {
    if (!isNavigationLocked) return false;
    if (targetPath && location.pathname === targetPath) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  return (
    <div className={`app-window theme-${theme}${isEditorRoute || isSubtitleTemplateRoute || isProductCreateRoute ? ' editor-workbench' : ''}${isCloudRoute ? ' cloud-workbench' : ''}`}>
      <header className="app-titlebar">
        <NavLink
          className={isNavigationLocked ? 'titlebar-brand route-lock-disabled' : 'titlebar-brand'}
          to="/"
          onClick={(event) => {
            void preventLockedNavigation(event, '/');
          }}
          title={isNavigationLocked ? navigationLockTitle : undefined}
        >
          <img src={moyaMatrixLogo} alt="moya矩阵" />
          <div>
            <strong>moya矩阵</strong>
            <span>{theme === 'dark' ? '暗夜模式' : '白天模式'}</span>
          </div>
        </NavLink>
        {isEditorRoute || isSubtitleTemplateRoute || isProductCreateRoute ? (
          <nav className="titlebar-nav" aria-label="功能切换">
            {workspaceNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? `active${isNavigationLocked ? ' route-lock-disabled' : ''}` : (isNavigationLocked ? 'route-lock-disabled' : undefined))}
                onClick={(event) => {
                  void preventLockedNavigation(event, item.to);
                }}
                title={isNavigationLocked ? navigationLockTitle : undefined}
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}
        <div className="titlebar-actions">
          <button className="theme-toggle" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span>{theme === 'dark' ? '白天' : '暗夜'}</span>
          </button>
        </div>
      </header>

      <div className="app-shell">
        <aside className="app-nav">
          <div className="brand-block">
            <img className="brand-mark" src={moyaMatrixLogo} alt="moya矩阵" />
            <div>
              <strong>moya矩阵</strong>
              <span>智能协作矩阵</span>
            </div>
          </div>

          <nav>
            {sidebarNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? `nav-item active${isNavigationLocked ? ' route-lock-disabled' : ''}` : `nav-item${isNavigationLocked ? ' route-lock-disabled' : ''}`)}
                onClick={(event) => {
                  void preventLockedNavigation(event, item.to);
                }}
                title={isNavigationLocked ? navigationLockTitle : undefined}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/materials" element={<MaterialLibraryView />} />
            <Route path="/cloud-drive" element={<CloudDrivePage />} />
            <Route
              path="/editor"
              element={(
                <EditorRouteBoundary>
                  <Suspense fallback={<EditorRouteLoading />}>
                    <LazyEditorPage />
                  </Suspense>
                </EditorRouteBoundary>
              )}
            />
            <Route
              path="/subtitle-template"
              element={(
                <EditorRouteBoundary>
                  <Suspense fallback={<EditorRouteLoading />}>
                    <LazySubtitleTemplatePage />
                  </Suspense>
                </EditorRouteBoundary>
              )}
            />
            <Route path="/product-video/create" element={<ProductVideoCreateView />} />
            <Route path="/transfers" element={<CloudDrivePage initialMenu="transport" />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function EditorRouteLoading() {
  return (
    <section className="editor-route-loading" aria-live="polite">
      <div className="editor-route-loading-shell" role="status" aria-label="正在加载剪辑工作台">
        <div className="editor-route-loading-orbit" aria-hidden="true">
          <span className="editor-route-loading-halo" />
          <img src={moyaMatrixLogo} alt="" />
          <i className="editor-route-loading-dot dot-a" />
          <i className="editor-route-loading-dot dot-b" />
          <i className="editor-route-loading-dot dot-c" />
        </div>
        <div className="editor-route-loading-copy">
          <small>moya matrix editor</small>
          <strong>正在加载剪辑工作台</strong>
          <span>首次进入会稍慢一些，资源加载完成后会更流畅。</span>
        </div>
        <div className="editor-route-loading-track" aria-hidden="true">
          <div className="editor-route-loading-track-bar" />
        </div>
        <div className="editor-route-loading-stages" aria-hidden="true">
          {editorLoadingStages.map((stage, index) => (
            <article key={stage} style={{ '--stage-delay': `${index * 0.16}s` } as CSSProperties}>
              <em>{`0${index + 1}`}</em>
              <div>
                <strong>{stage}</strong>
                <span />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function EditorRouteFailure({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <section className="editor-route-loading editor-route-failure" aria-live="assertive">
      <div className="editor-route-loading-shell" role="alert" aria-label="剪辑工作台加载失败">
        <div className="editor-route-loading-orbit" aria-hidden="true">
          <span className="editor-route-loading-halo" />
          <img src={moyaMatrixLogo} alt="" />
        </div>
        <div className="editor-route-loading-copy">
          <small>moya matrix editor</small>
          <strong>剪辑工作台加载失败</strong>
          <span>页面已经拦截到异常，不会再直接白屏。可以先重试当前工作台；如果还会复现，再刷新整个应用。</span>
        </div>
        <div className="editor-route-actions">
          <button type="button" onClick={onRetry}>重试工作台</button>
          <button type="button" onClick={() => window.location.reload()}>刷新应用</button>
        </div>
        <code className="editor-route-error-detail">{error.message || '未知异常'}</code>
      </div>
    </section>
  );
}

function HomeView() {
  return (
    <section className="page home-page">
      <div className="home-panel">
        <img src={moyaMatrixLogo} alt="moya矩阵" />
        <div>
          <h1>moya矩阵</h1>
          <p>一站式编、拍、剪、投、管的智能内容工作台。</p>
        </div>
        <NavLink to="/editor?workflow=viral" className="home-workbench-action">
          <Sparkles size={17} />
          <span>进入网感剪辑</span>
        </NavLink>
      </div>

      <div className="home-workbench-strip">
        <div>
          <strong>主工作台</strong>
          <span>从首页可直接回到剪辑工作区，也可以通过左侧导航切换模块。</span>
        </div>
        <NavLink to="/editor">打开工作台</NavLink>
      </div>

      <div className="home-module-grid">
        <NavLink to="/editor?workflow=viral" className="home-module-card">
          <Sparkles size={28} />
          <strong>网感剪辑</strong>
          <span>导入原视频，一键生成字幕、花字、贴纸、音效和动效包装</span>
        </NavLink>
        <NavLink to="/cloud-drive" className="home-module-card">
          <Cloud size={28} />
          <strong>网盘</strong>
          <span>直接管理素材、分享和传输任务</span>
        </NavLink>
        <NavLink to="/materials" className="home-module-card">
          <ImagePlus size={28} />
          <strong>素材库</strong>
          <span>汇聚商品图、爆款参考、门店素材和贴纸音效，作为创作来源</span>
        </NavLink>
        <NavLink to="/editor" className="home-module-card">
          <Clapperboard size={28} />
          <strong>剪辑</strong>
          <span>进入视频编辑与批量内容生产工作流</span>
        </NavLink>
        <NavLink to="/settings" className="home-module-card">
          <Settings size={28} />
          <strong>设置</strong>
          <span>配置本地目录、导出路径和应用偏好</span>
        </NavLink>
      </div>

      <div className="home-product-section">
        <div className="home-section-heading">
          <div>
            <span>商品视频创作</span>
            <h2>选择一个增长场景，快速生成可发布视频</h2>
          </div>
          <NavLink to="/editor?workflow=viral">
            <Repeat2 size={15} />
            <span>进入批量创作</span>
          </NavLink>
        </div>

        <div className="home-product-grid">
          {productVideoScenarios.map((scenario) => (
            <NavLink
              key={scenario.key}
              to={`/product-video/create?scenario=${scenario.key}`}
              className={`home-product-card ${scenario.tone}`}
            >
              <div className="product-card-preview">
                <div className="product-card-phone">
                  <scenario.icon size={28} />
                  <strong>{scenario.title}</strong>
                  <span>{scenario.output}</span>
                  <i />
                </div>
              </div>
              <div className="product-card-copy">
                <div>
                  <scenario.icon size={20} />
                  <strong>{scenario.title}</strong>
                </div>
                <p>{scenario.subtitle}</p>
                <small>{scenario.prompt}</small>
              </div>
              <span className="product-card-action">
                开始创作
                <ArrowRight size={15} />
              </span>
            </NavLink>
          ))}
        </div>
      </div>
    </section>
  );
}

function MaterialLibraryView() {
  const cropDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropStageRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState(materialQuickFilters[0]);
  const [sourceText, setSourceText] = useState('');
  const [sourceApiBase, setSourceApiBase] = useState(() => localStorage.getItem(MATERIAL_SOURCE_API_BASE_KEY) || MATERIAL_SOURCE_DEFAULT_API_BASE);
  const [sourceTask, setSourceTask] = useState<MaterialSourceTask | null>(null);
  const [sourceImportStage, setSourceImportStage] = useState<'idle' | 'creating' | 'polling' | 'caching' | 'ready' | 'failed'>('idle');
  const [sourceError, setSourceError] = useState('');
  const [cachedSource, setCachedSource] = useState<MediaCacheResult | null>(null);
  const [sourceProbe, setSourceProbe] = useState<MediaProbeResult | null>(null);
  const [sourceThumbnail, setSourceThumbnail] = useState('');
  const [splitPreset, setSplitPreset] = useState<MaterialSplitPresetKey>('3-parts');
  const [splitResult, setSplitResult] = useState<MediaSplitResult | null>(null);
  const [selectedSplitPreviewId, setSelectedSplitPreviewId] = useState('');
  const [isSplitting, setIsSplitting] = useState(false);
  const [batchSplitItems, setBatchSplitItems] = useState<MaterialBatchSplitItem[]>([]);
  const [isBatchSplitting, setIsBatchSplitting] = useState(false);
  const [cropPreset, setCropPreset] = useState<MaterialCropPresetKey>('original');
  const [cropRect, setCropRect] = useState<MaterialCropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [cropResult, setCropResult] = useState<MediaCropResult | null>(null);
  const [cropViewportStyle, setCropViewportStyle] = useState<CSSProperties>({ inset: 0 });
  const [isCropping, setIsCropping] = useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredSources = materialSourceCategories.filter((source) => {
    const haystack = [source.title, source.subtitle, source.source, ...source.tags].join(' ').toLowerCase();
    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesFilter = activeFilter === '全部' || haystack.includes(activeFilter.toLowerCase());
    return matchesQuery && matchesFilter;
  });
  const filteredCaptionTemplates = filterCaptionTemplatePresets(query, activeFilter);
  const sourceVideoUrl = materialTaskVideoSource(sourceTask, sourceApiBase);
  const sourcePreviewUrl = cachedSource?.localPath ? localFileUrl(cachedSource.localPath) : sourceVideoUrl;
  const sourceBusy = ['creating', 'polling', 'caching'].includes(sourceImportStage);
  const splitPlan = buildMaterialSplitSegments(sourceProbe?.duration || 0, splitPreset);
  const selectedSplitPreviewSegment = splitResult?.segments.find((segment) => segment.id === selectedSplitPreviewId) || splitResult?.segments[0] || null;
  const canSplit = Boolean(cachedSource?.localPath && splitPlan.length && !isSplitting && !isBatchSplitting);
  const batchDoneCount = batchSplitItems.filter((item) => item.status === 'done').length;
  const batchSegmentCount = batchSplitItems.reduce((total, item) => total + (item.segments?.length || 0), 0);
  const canBatchSplit = Boolean(batchSplitItems.length && !isBatchSplitting && !isSplitting);
  const canCrop = Boolean(cachedSource?.localPath && sourceProbe?.width && sourceProbe?.height && !isCropping && !isBatchSplitting);
  const generatedMaterialCount = (splitResult?.segments.length || 0) + (cropResult ? 1 : 0) + batchSegmentCount;
  const isManualCrop = cropPreset === 'free';

  useEffect(() => {
    const stage = cropStageRef.current;
    if (!stage || !sourceProbe?.width || !sourceProbe?.height || !sourcePreviewUrl) {
      setCropViewportStyle({ inset: 0 });
      return undefined;
    }
    const updateCropViewport = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const stageRatio = rect.width / rect.height;
      const videoRatio = sourceProbe.width / sourceProbe.height;
      if (stageRatio > videoRatio) {
        const height = rect.height;
        const width = height * videoRatio;
        setCropViewportStyle({
          left: `${(rect.width - width) / 2}px`,
          top: 0,
          width: `${width}px`,
          height: `${height}px`
        });
        return;
      }
      const width = rect.width;
      const height = width / videoRatio;
      setCropViewportStyle({
        left: 0,
        top: `${(rect.height - height) / 2}px`,
        width: `${width}px`,
        height: `${height}px`
      });
    };
    updateCropViewport();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateCropViewport) : null;
    observer?.observe(stage);
    window.addEventListener('resize', updateCropViewport);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateCropViewport);
    };
  }, [sourcePreviewUrl, sourceProbe?.height, sourceProbe?.width]);

  async function cacheReadyMaterialTask(task: MaterialSourceTask) {
    const videoSource = materialTaskVideoSource(task, sourceApiBase);
    if (!videoSource) throw new Error('解析成功，但没有拿到可用的视频地址');
    if (!window.surgicol?.media?.cacheRemoteFile) return;
    setSourceImportStage('caching');
    const cached = await window.surgicol.media.cacheRemoteFile(videoSource, {
      folder: 'material-source',
      cacheKey: task.id,
      fileName: `${task.title || 'source-video'}.mp4`
    });
    setCachedSource(cached);
    const probe = await window.surgicol.media.probeFile(cached.localPath).catch(() => null);
    setSourceProbe(probe);
    setCropPreset('original');
    setCropRect(buildMaterialCropRectForPreset(probe, 'original'));
    setCropResult(null);
    const thumbnail = await window.surgicol.media.createThumbnail(cached.localPath, {
      width: 260,
      height: 146,
      cacheKey: `${task.id}-material-source`
    }).catch(() => null);
    setSourceThumbnail(thumbnail?.localPath ? localFileUrl(thumbnail.localPath) : task.coverUrl || '');
  }

  async function handlePickLocalVideoSource() {
    if (!window.surgicol?.dialog?.openFiles || !window.surgicol?.media?.cacheRemoteFile) {
      setSourceError('当前运行环境不支持本地上传，请在 Electron 应用中使用。');
      return;
    }
    const files = await window.surgicol.dialog.openFiles({
      title: '选择本地视频源',
      properties: ['openFile'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    const localPath = files[0];
    if (!localPath) return;

    const fileName = materialFileNameFromPath(localPath);
    const localTask: MaterialSourceTask = {
      id: `local-${Date.now()}`,
      title: fileName,
      sourceUrl: localPath,
      platform: 'local',
      status: 'ready',
      videoUrl: localPath,
      localFile: localPath,
      downloadUrl: localPath,
      createdAt: new Date().toISOString()
    };

    setSourceText(localPath);
    setSourceError('');
    setSourceTask(localTask);
    setCachedSource(null);
    setSourceProbe(null);
    setSourceThumbnail('');
    setSplitResult(null);
    setSelectedSplitPreviewId('');
    setCropPreset('original');
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
    setCropResult(null);
    setSourceImportStage('caching');
    try {
      await cacheReadyMaterialTask(localTask);
      setSourceImportStage('ready');
    } catch (error) {
      setSourceImportStage('failed');
      setSourceError(error instanceof Error ? error.message : '本地视频导入失败');
    }
  }

  async function handleImportSourceVideo() {
    const text = sourceText.trim();
    const sourceUrl = extractFirstUrlFromText(text) || text;
    if (!/^https?:\/\//i.test(sourceUrl)) {
      setSourceError('请先粘贴一个视频分享链接或直链。');
      return;
    }
    const apiBase = normalizeMaterialSourceApiBase(sourceApiBase);
    setSourceApiBase(apiBase);
    localStorage.setItem(MATERIAL_SOURCE_API_BASE_KEY, apiBase);
    setSourceError('');
    setSourceTask(null);
    setCachedSource(null);
    setSourceProbe(null);
    setSourceThumbnail('');
    setSplitResult(null);
    setSelectedSplitPreviewId('');
    setCropPreset('original');
    setCropRect({ x: 0, y: 0, width: 1, height: 1 });
    setCropResult(null);
    setSourceImportStage('creating');
    try {
      const createdTask = await createMaterialSourceTask(apiBase, text);
      setSourceTask(createdTask);
      setSourceImportStage('polling');
      const settledTask = await pollMaterialSourceTask(apiBase, createdTask.id, setSourceTask);
      if (String(settledTask.status || '').toLowerCase() !== 'ready') {
        throw new Error(settledTask.error || materialTaskStatusLabel(settledTask));
      }
      await cacheReadyMaterialTask(settledTask);
      setSourceImportStage('ready');
    } catch (error) {
      setSourceImportStage('failed');
      setSourceError(error instanceof Error ? error.message : '视频源导入失败');
    }
  }

  async function handleSplitVideo() {
    if (!cachedSource?.localPath) {
      setSourceError('请先导入并缓存视频源。');
      return;
    }
    if (!window.surgicol?.media?.splitVideo) {
      setSourceError('当前运行环境不支持本地视频分割，请在 Electron 应用中使用。');
      return;
    }
    setIsSplitting(true);
    setSplitResult(null);
    setSelectedSplitPreviewId('');
    setSourceError('');
    try {
      const result = await window.surgicol.media.splitVideo(cachedSource.localPath, {
        folder: 'material-segments',
        fileName: sourceTask?.title || cachedSource.name,
        segments: splitPlan
      });
      setSplitResult(result);
      setSelectedSplitPreviewId(result.segments[0]?.id || '');
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : '视频分割失败');
    } finally {
      setIsSplitting(false);
    }
  }

  function handleSplitPresetChange(preset: MaterialSplitPresetKey) {
    setSplitPreset(preset);
    setSplitResult(null);
    setSelectedSplitPreviewId('');
  }

  function updateBatchSplitItem(id: string, patch: Partial<MaterialBatchSplitItem>) {
    setBatchSplitItems((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function handlePickBatchSplitSources() {
    if (!window.surgicol?.dialog?.openFiles || !window.surgicol?.media?.probeFile || !window.surgicol?.media?.splitVideo) {
      setSourceError('当前运行环境不支持批量素材分割，请在 Electron 应用中使用。');
      return;
    }
    const files = await window.surgicol.dialog.openFiles({
      title: '选择批量分割视频',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    if (!files.length) return;
    const timestamp = Date.now();
    const nextItems = files.map((localPath, index) => ({
      id: `batch-${timestamp}-${index}`,
      localPath,
      name: materialFileNameFromPath(localPath),
      status: 'queued' as const
    }));
    setBatchSplitItems((items) => {
      const existingPaths = new Set(items.map((item) => item.localPath));
      return [...items, ...nextItems.filter((item) => !existingPaths.has(item.localPath))];
    });
    setSourceError('');
  }

  async function handleBatchSplitVideos() {
    const media = window.surgicol?.media;
    if (!media?.probeFile || !media?.splitVideo) {
      setSourceError('当前运行环境不支持批量素材分割，请在 Electron 应用中使用。');
      return;
    }
    if (!batchSplitItems.length) {
      setSourceError('请先选择要批量分割的视频素材。');
      return;
    }
    setIsBatchSplitting(true);
    setSourceError('');
    const activePreset = splitPreset;
    try {
      for (const item of batchSplitItems) {
        updateBatchSplitItem(item.id, {
          status: 'probing',
          duration: undefined,
          outputDir: undefined,
          segments: undefined,
          error: undefined
        });
        try {
          const probe = await media.probeFile(item.localPath);
          const segments = buildMaterialSplitSegments(probe.duration || 0, activePreset);
          if (!segments.length) throw new Error('视频时长过短，无法生成分割片段');
          updateBatchSplitItem(item.id, { status: 'splitting', duration: probe.duration });
          const result = await media.splitVideo(item.localPath, {
            folder: 'material-batch-segments',
            fileName: item.name,
            segments
          });
          updateBatchSplitItem(item.id, {
            status: 'done',
            duration: result.duration || probe.duration,
            outputDir: result.outputDir,
            segments: result.segments
          });
        } catch (error) {
          updateBatchSplitItem(item.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : '批量分割失败'
          });
        }
      }
    } finally {
      setIsBatchSplitting(false);
    }
  }

  function removeBatchSplitItem(id: string) {
    if (isBatchSplitting) return;
    setBatchSplitItems((items) => items.filter((item) => item.id !== id));
  }

  function pointFromCropEvent(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clampNumber((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1),
      y: clampNumber((event.clientY - rect.top) / Math.max(1, rect.height), 0, 1)
    };
  }

  function selectionCropRect(start: { x: number; y: number }, end: { x: number; y: number }) {
    return clampMaterialCropRect({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    });
  }

  function handleCropPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!sourceProbe?.width || !sourceProbe?.height) return;
    const point = pointFromCropEvent(event);
    if (!point) return;
    cropDragStartRef.current = point;
    setCropPreset('free');
    setCropResult(null);
    setCropRect(clampMaterialCropRect({ x: point.x, y: point.y, width: 0.08, height: 0.08 }));
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleCropPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = cropDragStartRef.current;
    if (!start) return;
    const point = pointFromCropEvent(event);
    if (!point) return;
    setCropRect(selectionCropRect(start, point));
  }

  function handleCropPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = cropDragStartRef.current;
    cropDragStartRef.current = null;
    if (!start) return;
    const point = pointFromCropEvent(event);
    if (point) setCropRect(selectionCropRect(start, point));
  }

  function handleCropPresetChange(preset: MaterialCropPresetKey) {
    setCropPreset(preset);
    setCropResult(null);
    setCropRect(buildMaterialCropRectForPreset(sourceProbe, preset));
  }

  async function handleCropVideo() {
    if (!cachedSource?.localPath) {
      setSourceError('请先导入并缓存视频源。');
      return;
    }
    if (!window.surgicol?.media?.cropVideo) {
      setSourceError('当前运行环境不支持本地视频裁剪，请在 Electron 应用中使用。');
      return;
    }
    setIsCropping(true);
    setCropResult(null);
    setSourceError('');
    try {
      const result = await window.surgicol.media.cropVideo(cachedSource.localPath, {
        folder: 'material-crops',
        fileName: sourceTask?.title || cachedSource.name,
        crop: clampMaterialCropRect(cropRect)
      });
      setCropResult(result);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : '视频裁剪失败');
    } finally {
      setIsCropping(false);
    }
  }

  return (
    <section className="page material-library-page">
      <header className="material-library-hero">
        <div>
          <span>素材来源</span>
          <h1>素材库</h1>
          <p>把商品图、参考视频、门店素材和剪辑包装统一收纳，后续创作时可以从这里取素材。</p>
        </div>
        <NavLink to="/cloud-drive" className="material-library-primary">
          <Upload size={16} />
          <span>上传素材</span>
        </NavLink>
      </header>

      <div className="material-link-import-panel">
        <div className="material-link-form">
          <div className="material-link-heading">
            <span>视频源导入</span>
            <strong>输入平台链接，或上传本地视频</strong>
            <p>支持直链 MP4、本地视频文件，以及已接入解析服务的平台链接。请只导入已获授权的内容。</p>
          </div>
          <label className="material-service-input">
            <span>服务地址</span>
            <input value={sourceApiBase} onChange={(event) => setSourceApiBase(event.target.value)} placeholder="http://localhost:8787" />
          </label>
          <textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="粘贴视频分享文本或链接"
          />
          <div className="material-link-actions">
            <button type="button" className="material-link-primary" onClick={handleImportSourceVideo} disabled={sourceBusy}>
              <Download size={15} />
              {sourceBusy ? '导入中...' : '解析并下载'}
            </button>
            <button type="button" className="material-link-secondary" onClick={handlePickLocalVideoSource} disabled={sourceBusy}>
              <Upload size={15} />
              本地上传
            </button>
            <small>{sourceTask ? `${materialTaskStatusLabel(sourceTask)} · ${sourceTask.platform || 'unknown'}` : '视频会先进入素材源，再用于切片。'}</small>
          </div>
          {sourceError ? <p className="material-source-error">{sourceError}</p> : null}
          <div className="material-link-summary">
            <div className="material-link-summary-main">
              <span>当前素材</span>
              <strong>{sourceTask?.title || '未选择视频'}</strong>
              <p>{cachedSource?.localPath || sourceTask?.sourceUrl || '等待导入'}</p>
            </div>
            <div className="material-link-summary-facts">
              <span>
                <strong>{sourceTask ? materialTaskStatusLabel(sourceTask) : '未导入'}</strong>
                <em>状态</em>
              </span>
              <span>
                <strong>{sourceProbe ? formatSecondsLabel(sourceProbe.duration) : '--'}</strong>
                <em>时长</em>
              </span>
              <span>
                <strong>{cachedSource ? formatFileSize(cachedSource.size) : '--'}</strong>
                <em>缓存</em>
              </span>
              <span>
                <strong>{splitResult ? `${splitResult.segments.length} 段` : splitPlan.length ? `${splitPlan.length} 段` : '--'}</strong>
                <em>{splitResult ? '已分割' : '预估'}</em>
              </span>
            </div>
          </div>
        </div>

        <div className="material-import-preview">
          <div className="material-import-stage" ref={cropStageRef}>
            {sourcePreviewUrl ? (
              <video src={sourcePreviewUrl} poster={sourceThumbnail || sourceTask?.coverUrl} controls preload="metadata" />
            ) : sourceThumbnail || sourceTask?.coverUrl ? (
              <img src={sourceThumbnail || sourceTask?.coverUrl} alt="视频源封面" />
            ) : (
              <div className="material-import-placeholder">
                <PlayCircle size={32} />
                <span>视频源预览</span>
              </div>
            )}
            {sourcePreviewUrl && sourceProbe?.width && sourceProbe?.height ? (
              <div
                className={`material-crop-layer${isManualCrop ? ' manual' : ' passive'}`}
                style={cropViewportStyle}
                onPointerDown={handleCropPointerDown}
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
                onPointerCancel={() => {
                  cropDragStartRef.current = null;
                }}
                aria-label="播放区裁剪框选"
              >
                <span className="material-crop-mask top" style={{ height: `${clampMaterialCropRect(cropRect).y * 100}%` }} />
                <span className="material-crop-mask left" style={{
                  top: `${clampMaterialCropRect(cropRect).y * 100}%`,
                  width: `${clampMaterialCropRect(cropRect).x * 100}%`,
                  height: `${clampMaterialCropRect(cropRect).height * 100}%`
                }} />
                <span className="material-crop-mask right" style={{
                  top: `${clampMaterialCropRect(cropRect).y * 100}%`,
                  left: `${(clampMaterialCropRect(cropRect).x + clampMaterialCropRect(cropRect).width) * 100}%`,
                  height: `${clampMaterialCropRect(cropRect).height * 100}%`
                }} />
                <span className="material-crop-mask bottom" style={{ top: `${(clampMaterialCropRect(cropRect).y + clampMaterialCropRect(cropRect).height) * 100}%` }} />
                <span className="material-crop-box" style={materialCropBoundsStyle(cropRect)}>
                  <i className="corner tl" />
                  <i className="corner tr" />
                  <i className="corner bl" />
                  <i className="corner br" />
                </span>
              </div>
            ) : null}
          </div>
          <div className="material-import-meta">
            <div>
              <span className={`material-import-status ${sourceImportStage}`}>{sourceTask ? materialTaskStatusLabel(sourceTask) : '未导入'}</span>
              <strong>{sourceTask?.title || '等待视频源'}</strong>
              <p>{sourceTask?.sourceUrl || '导入后会在这里显示来源链接、时长和本地缓存。'}</p>
            </div>
            <div className="material-import-facts">
              <span>{sourceProbe ? formatSecondsLabel(sourceProbe.duration) : '时长 --'}</span>
              <span>{cachedSource ? formatFileSize(cachedSource.size) : '本地缓存 --'}</span>
              <span>{sourceProbe?.width && sourceProbe?.height ? `${sourceProbe.width}x${sourceProbe.height}` : '尺寸 --'}</span>
            </div>
          </div>
        </div>

        <aside className="material-generate-panel">
          <div className="material-generate-head">
            <div>
              <span>操作中心</span>
              <strong>生成、分割、裁剪集中处理</strong>
            </div>
            <WandSparkles size={18} />
          </div>
          <div className="material-generate-stats">
            <span>
              <strong>{sourceTask ? materialTaskStatusLabel(sourceTask) : '未导入'}</strong>
              <em>视频源</em>
            </span>
            <span>
              <strong>{splitResult?.segments.length || 0}</strong>
              <em>分割片段</em>
            </span>
            <span>
              <strong>{cropResult ? 1 : 0}</strong>
              <em>裁剪素材</em>
            </span>
            <span>
              <strong>{generatedMaterialCount}</strong>
              <em>可用素材</em>
            </span>
          </div>

          <div className="material-operation-section material-split-panel">
            <div className="material-split-head">
              <div>
                <span>素材分割</span>
                <strong>按当前规则生成素材片段</strong>
              </div>
              <button type="button" onClick={handleSplitVideo} disabled={!canSplit}>
                <Clapperboard size={15} />
                {isSplitting ? '分割中...' : '分割视频'}
              </button>
            </div>
            <div className="material-split-presets">
              {materialSplitPresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={splitPreset === preset.key ? 'active' : undefined}
                  onClick={() => handleSplitPresetChange(preset.key)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.detail}</span>
                </button>
              ))}
            </div>
            <div className="material-split-track" aria-label="视频分割轨道">
              {splitPlan.length ? splitPlan.slice(0, 16).map((segment) => (
                <span key={`${segment.start}-${segment.end}`} style={materialSplitTrackStyle(segment, sourceProbe?.duration || 0)}>
                  <strong>{segment.label}</strong>
                  <em>{formatSecondsLabel(segment.start)} - {formatSecondsLabel(segment.end)}</em>
                </span>
              )) : (
                <span className="empty">导入视频后显示分割轨道</span>
              )}
            </div>
            {splitResult ? (
              <div className="material-split-result">
                <strong>已生成 {splitResult.segments.length} 个素材片段</strong>
                {splitResult.segments.map((segment) => (
                  <button
                    key={segment.id}
                    type="button"
                    className={selectedSplitPreviewSegment?.id === segment.id ? 'active' : undefined}
                    onClick={() => setSelectedSplitPreviewId(segment.id)}
                  >
                    <span>{segment.label}</span>
                    <em>{formatSecondsLabel(segment.duration)} · {formatFileSize(segment.size)}</em>
                  </button>
                ))}
              </div>
            ) : null}
            <div className={`material-split-preview${selectedSplitPreviewSegment ? ' ready' : ''}`}>
              <div className="material-split-preview-head">
                <div>
                  <span>分割预览</span>
                  <strong>{selectedSplitPreviewSegment ? selectedSplitPreviewSegment.label : '等待生成素材片段'}</strong>
                </div>
                {selectedSplitPreviewSegment ? (
                  <button type="button" onClick={() => window.surgicol?.file?.reveal(selectedSplitPreviewSegment.localPath)}>
                    打开文件
                  </button>
                ) : null}
              </div>
              <div className="material-split-preview-stage">
                {selectedSplitPreviewSegment ? (
                  <video key={selectedSplitPreviewSegment.localPath} src={localFileUrl(selectedSplitPreviewSegment.localPath)} controls preload="metadata" />
                ) : (
                  <div>
                    <PlayCircle size={26} />
                    <span>分割后点击片段可在这里预览</span>
                  </div>
                )}
              </div>
              <div className="material-split-preview-meta">
                <span>{selectedSplitPreviewSegment ? `${formatSecondsLabel(selectedSplitPreviewSegment.start)} - ${formatSecondsLabel(selectedSplitPreviewSegment.end)}` : '时间 --'}</span>
                <span>{selectedSplitPreviewSegment ? formatSecondsLabel(selectedSplitPreviewSegment.duration) : '时长 --'}</span>
                <span>{selectedSplitPreviewSegment ? formatFileSize(selectedSplitPreviewSegment.size) : '大小 --'}</span>
              </div>
            </div>
            <div className="material-batch-split">
              <div className="material-batch-head">
                <div>
                  <span>批量素材</span>
                  <strong>多条视频按当前规则逐条分割</strong>
                </div>
                <div className="material-batch-actions">
                  <button type="button" onClick={handlePickBatchSplitSources} disabled={isBatchSplitting}>
                    <Upload size={15} />
                    选择视频
                  </button>
                  <button type="button" onClick={handleBatchSplitVideos} disabled={!canBatchSplit}>
                    <ListVideo size={15} />
                    {isBatchSplitting ? '处理中...' : '批量分割'}
                  </button>
                  {batchSplitItems.length ? (
                    <button
                      type="button"
                      className="icon-only"
                      aria-label="清空批量队列"
                      title="清空批量队列"
                      onClick={() => setBatchSplitItems([])}
                      disabled={isBatchSplitting}
                    >
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="material-batch-summary">
                <span>已选 {batchSplitItems.length}</span>
                <span>完成 {batchDoneCount}</span>
                <span>片段 {batchSegmentCount}</span>
              </div>
              <div className="material-batch-list">
                {batchSplitItems.length ? batchSplitItems.map((item) => (
                  <div key={item.id} className={`material-batch-item ${item.status}`}>
                    <div className="material-batch-copy">
                      <strong>{item.name}</strong>
                      <span>
                        {item.error || (item.segments?.length
                          ? `${item.segments.length} 段 · ${formatSecondsLabel(item.duration || 0)}`
                          : item.duration
                            ? formatSecondsLabel(item.duration)
                            : item.localPath)}
                      </span>
                    </div>
                    <div className="material-batch-meta">
                      <span className={`material-batch-status ${item.status}`}>{materialBatchSplitStatusLabel(item.status)}</span>
                      {item.segments?.[0] ? (
                        <button type="button" onClick={() => window.surgicol?.file?.reveal(item.outputDir || item.segments?.[0]?.localPath || item.localPath)}>
                          打开
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="icon-only"
                        aria-label={`移除 ${item.name}`}
                        title="移除"
                        onClick={() => removeBatchSplitItem(item.id)}
                        disabled={isBatchSplitting}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )) : (
                  <div className="material-batch-empty">选择多条本地视频后，会在这里显示批量队列</div>
                )}
              </div>
            </div>
          </div>

          <div className="material-operation-section material-crop-panel">
            <div className="material-crop-head">
              <div>
                <span>素材裁剪</span>
                <strong>裁剪画面后生成新素材</strong>
              </div>
              <button type="button" onClick={handleCropVideo} disabled={!canCrop}>
                <Crop size={15} />
                {isCropping ? '裁剪中...' : '裁剪视频'}
              </button>
            </div>
            <div className="material-crop-presets">
              {materialCropPresets.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={cropPreset === preset.key ? 'active' : undefined}
                  onClick={() => handleCropPresetChange(preset.key)}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.detail}</span>
                </button>
              ))}
            </div>
            <div className="material-crop-summary">
              <span>{materialCropPixelLabel(cropRect, sourceProbe)}</span>
              <span>左上 {Math.round(clampMaterialCropRect(cropRect).x * 100)}% / {Math.round(clampMaterialCropRect(cropRect).y * 100)}%</span>
              <span>{isManualCrop ? '可在播放区拖拽重新框选' : '按比例居中裁剪'}</span>
            </div>
            {cropResult ? (
              <div className="material-crop-result">
                <strong>已生成裁剪素材</strong>
                <button type="button" onClick={() => window.surgicol?.file?.reveal(cropResult.localPath)}>
                  <span>{cropResult.name}</span>
                  <em>{cropResult.width}x{cropResult.height} · {formatFileSize(cropResult.size)}</em>
                </button>
              </div>
            ) : null}
          </div>

          <div className="material-generate-actions">
            <NavLink to="/editor?workflow=viral">
              <Clapperboard size={16} />
              <span>进入剪辑生成</span>
              <ArrowRight size={15} />
            </NavLink>
            <NavLink to="/product-video/create?scenario=product-showcase">
              <Package size={16} />
              <span>商品视频生成</span>
              <ArrowRight size={15} />
            </NavLink>
            <NavLink to="/product-video/create?scenario=hot-replica">
              <Flame size={16} />
              <span>爆款复刻生成</span>
              <ArrowRight size={15} />
            </NavLink>
          </div>
          <div className="material-generate-queue">
            <div>
              <span>已生成素材</span>
              <strong>{generatedMaterialCount ? `已准备 ${generatedMaterialCount} 个素材` : '等待素材生成'}</strong>
            </div>
            {selectedSplitPreviewSegment ? (
              <button type="button" onClick={() => window.surgicol?.file?.reveal(selectedSplitPreviewSegment.localPath)}>
                <ListVideo size={15} />
                打开当前片段
              </button>
            ) : cropResult ? (
              <button type="button" onClick={() => window.surgicol?.file?.reveal(cropResult.localPath)}>
                <Crop size={15} />
                打开裁剪素材
              </button>
            ) : (
              <small>分割或裁剪后会在这里汇总。</small>
            )}
          </div>
        </aside>
      </div>

      <div className="material-library-toolbar">
        <label className="material-library-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索商品、爆款参考、门店素材、字幕模板" />
        </label>
        <div className="material-library-filters" aria-label="素材筛选">
          {materialQuickFilters.map((filter) => (
            <button key={filter} type="button" className={activeFilter === filter ? 'active' : undefined} onClick={() => setActiveFilter(filter)}>
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="material-source-grid">
        {filteredSources.length ? filteredSources.map((source) => {
          const SourceIcon = source.icon;
          return (
            <NavLink key={source.title} to={source.to} className={`material-source-card ${source.tone}`}>
              <div className="material-source-visual">
                <SourceIcon size={28} />
                <strong>{source.title}</strong>
                <span>{source.source}</span>
              </div>
              <div className="material-source-copy">
                <div>
                  <SourceIcon size={20} />
                  <strong>{source.title}</strong>
                </div>
                <p>{source.subtitle}</p>
                <div className="material-source-tags">
                  {source.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              <span className="material-source-action">
                {source.action}
                <ArrowRight size={15} />
              </span>
            </NavLink>
          );
        }) : filteredCaptionTemplates.length ? null : (
          <div className="material-source-empty">
            <strong>没有匹配的素材来源</strong>
            <span>换个关键词，或回到全部素材来源。</span>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveFilter('全部');
              }}
            >
              清除筛选
            </button>
          </div>
        )}
      </div>

      {filteredCaptionTemplates.length ? (
        <CaptionTemplateShowcase templates={filteredCaptionTemplates} />
      ) : activeFilter === '字幕模板' || normalizedQuery ? (
        <CaptionTemplateEmpty />
      ) : null}

      <div className="material-flow-panel">
        <div>
          <span>创作流向</span>
          <strong>从素材库沉淀来源，再进入网感剪辑、商品视频和批量创作。</strong>
        </div>
        <NavLink to="/editor?workflow=viral">
          <WandSparkles size={15} />
          <span>用素材创作</span>
        </NavLink>
      </div>
    </section>
  );
}

function taskPrompt(task: ProductVideoTaskThread) {
  if (task.description) return task.description;
  if (task.scenario === 'store-traffic') return '给我生成一个同城探店引流的视频';
  if (task.scenario === 'product-showcase') return '给我生成一个商品展示的视频';
  if (task.scenario === 'hot-replica') return '给我生成一个爆款复刻的视频';
  return '给我生成一个商品口播的视频';
}

function taskThumbnail(task: ProductVideoTaskThread) {
  return task.storeImages?.[0] || task.productImages?.[0] || task.productImage || '';
}

function taskStateText(task: ProductVideoTaskThread, activeTaskId: string | undefined, activePercent: number) {
  if (task.videoUrl) return '生成完成';
  if (task.finished && !task.successful) return '生成失败';
  if (task.taskId === activeTaskId) return `${Math.max(1, activePercent)}% 生成中`;
  if ((task.status || '').toLowerCase().includes('queue')) return '排队加速中';
  return task.status || '排队加速中';
}

function outputRatioStyle(ratio?: string) {
  if (ratio === '9:16') return { aspectRatio: '9 / 16', width: 'min(280px, 62vw)' };
  if (ratio === '1:1') return { aspectRatio: '1 / 1', width: 'min(420px, 72vw)' };
  return { aspectRatio: '16 / 9', width: 'min(506px, 100%)' };
}

function ProductTaskThreads({
  tasks,
  activeTaskId,
  progress,
  currentTask,
  title,
  description,
  emptyText,
  onBackToPreview,
  onResolveTaskVideo
}: {
  tasks: ProductVideoTaskThread[];
  activeTaskId?: string;
  progress: { stage: ProductVideoProgressStage; percent: number; label: string; detail: string };
  currentTask?: ProductVideoTaskThread | null;
  title: string;
  description: string;
  emptyText: string;
  onBackToPreview: () => void;
  onResolveTaskVideo?: (taskId: string, nextTask: Record<string, unknown>) => Promise<void> | void;
}) {
  const mergedTasks = currentTask && !tasks.some((task) => task.taskId === currentTask.taskId) ? [currentTask, ...tasks] : tasks;
  const visibleTasks = mergedTasks.slice(0, 10);
  const [resolvedVideoUrls, setResolvedVideoUrls] = useState<Record<string, string>>({});
  const [protectedVideoFallbacks, setProtectedVideoFallbacks] = useState<Record<string, boolean>>({});
  const [videoPreviewErrors, setVideoPreviewErrors] = useState<Record<string, boolean>>({});
  const [openingPreviewTaskId, setOpeningPreviewTaskId] = useState<string | null>(null);
  const [inlinePreviewTaskId, setInlinePreviewTaskId] = useState<string | null>(null);
  const inlineVideoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const visibleVideoSignature = visibleTasks.map((task) => `${task.taskId}:${task.videoUrl || ''}:${task.cachedVideoPath || ''}`).join('|');

  function clearVideoPreviewError(taskId: string) {
    setVideoPreviewErrors((current) => {
      if (!current[taskId]) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }

  function tryPlayInlineVideo(taskId: string) {
    const video = inlineVideoRefs.current[taskId];
    if (!video || videoPreviewErrors[taskId]) return;
    const result = video.play();
    if (result && typeof result.catch === 'function') result.catch(() => undefined);
  }

  function startInlinePreview(taskId: string) {
    clearVideoPreviewError(taskId);
    flushSync(() => {
      setInlinePreviewTaskId(taskId);
    });
    tryPlayInlineVideo(taskId);
  }

  useEffect(() => {
    let cancelled = false;
    const tasksNeedingResolvedPreview = visibleTasks.filter((task) => {
      const source = task.videoUrl?.trim();
      return Boolean(source && shouldRequestProtectedPreview(source) && !resolvedVideoUrls[task.taskId] && !protectedVideoFallbacks[task.taskId]);
    });
    if (!tasksNeedingResolvedPreview.length) return () => {
      cancelled = true;
    };
    // 历史任务里的 OSS 成片可能是私有地址，预览前先换成短时可访问链接。
    void (async () => {
      for (const task of tasksNeedingResolvedPreview) {
        const source = task.videoUrl?.trim();
        if (!source) continue;
        try {
          const accessUrl = await getProductVideoAssetAccessUrl(source);
          if (cancelled) return;
          if (!accessUrl) continue;
          setResolvedVideoUrls((current) => (current[task.taskId] === accessUrl ? current : { ...current, [task.taskId]: accessUrl }));
          setProtectedVideoFallbacks((current) => {
            if (!current[task.taskId]) return current;
            const next = { ...current };
            delete next[task.taskId];
            return next;
          });
        } catch {
          if (cancelled) return;
          if (shouldRequestProtectedPreview(source)) {
            setResolvedVideoUrls((current) => (current[task.taskId] === source ? current : { ...current, [task.taskId]: source }));
            setProtectedVideoFallbacks((current) => (current[task.taskId] ? current : { ...current, [task.taskId]: true }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [protectedVideoFallbacks, resolvedVideoUrls, visibleVideoSignature]);

  useEffect(() => {
    if (!onResolveTaskVideo || typeof window.surgicol?.media?.cacheRemoteFile !== 'function') return;
    let cancelled = false;
    const tasksNeedingCache = visibleTasks.filter((task) => {
      const source = task.videoUrl?.trim();
      return Boolean(source && !task.cachedVideoPath && /^https?:\/\//i.test(source) && !shouldRefreshExpiringVideoUrl(source, 0));
    });
    if (!tasksNeedingCache.length) return () => {
      cancelled = true;
    };
    void (async () => {
      for (const task of tasksNeedingCache) {
        const source = task.videoUrl?.trim();
        if (!source) continue;
        try {
          const cached = await cacheProductVideoAssetLocally(source, {
            folder: 'product-video',
            cacheKey: task.taskId,
            fileName: `${task.taskId}.mp4`
          });
          if (cancelled || !cached.localPath) return;
          await onResolveTaskVideo(task.taskId, {
            ...task,
            cachedVideoPath: cached.localPath,
            updatedAt: new Date().toISOString()
          });
        } catch {
          if (cancelled) return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onResolveTaskVideo, visibleTasks, visibleVideoSignature]);

  useEffect(() => {
    if (!inlinePreviewTaskId) return;
    if (visibleTasks.some((task) => task.taskId === inlinePreviewTaskId)) return;
    setInlinePreviewTaskId(null);
  }, [inlinePreviewTaskId, visibleTasks]);

  useEffect(() => {
    if (!inlinePreviewTaskId) return;
    const video = inlineVideoRefs.current[inlinePreviewTaskId];
    if (!video || videoPreviewErrors[inlinePreviewTaskId]) return;
    if (video.readyState >= 2) {
      tryPlayInlineVideo(inlinePreviewTaskId);
      return;
    }
    const handleLoadedData = () => tryPlayInlineVideo(inlinePreviewTaskId);
    video.addEventListener('loadeddata', handleLoadedData);
    return () => video.removeEventListener('loadeddata', handleLoadedData);
  }, [inlinePreviewTaskId, resolvedVideoUrls, videoPreviewErrors]);

  async function handleOpenTaskVideo(task: ProductVideoTaskThread, rawVideoUrl?: string, previewVideoUrl?: string) {
    if (inlinePreviewTaskId === task.taskId && previewVideoUrl && !videoPreviewErrors[task.taskId]) {
      const currentVideo = inlineVideoRefs.current[task.taskId];
      if (currentVideo?.paused) {
        tryPlayInlineVideo(task.taskId);
      }
      return;
    }
    if (previewVideoUrl) {
      startInlinePreview(task.taskId);
      return;
    }
    if (!rawVideoUrl) return;
    const needsProtectedPreview = shouldRequestProtectedPreview(rawVideoUrl);
    if (!needsProtectedPreview) {
      startInlinePreview(task.taskId);
      return;
    }
    setOpeningPreviewTaskId(task.taskId);
    try {
      let accessUrl = await getProductVideoAssetAccessUrl(rawVideoUrl);
      if (!accessUrl && needsProtectedPreview) accessUrl = rawVideoUrl;
      if (!accessUrl) return;
      setResolvedVideoUrls((current) => (current[task.taskId] === accessUrl ? current : { ...current, [task.taskId]: accessUrl }));
      setProtectedVideoFallbacks((current) => {
        if (!current[task.taskId]) return current;
        const next = { ...current };
        delete next[task.taskId];
        return next;
      });
      setVideoPreviewErrors((current) => {
        if (!current[task.taskId]) return current;
        const next = { ...current };
        delete next[task.taskId];
        return next;
      });
      flushSync(() => {
        setInlinePreviewTaskId(task.taskId);
      });
      tryPlayInlineVideo(task.taskId);
    } catch {
      if (needsProtectedPreview) {
        setResolvedVideoUrls((current) => (current[task.taskId] === rawVideoUrl ? current : { ...current, [task.taskId]: rawVideoUrl }));
        setProtectedVideoFallbacks((current) => ({ ...current, [task.taskId]: true }));
        startInlinePreview(task.taskId);
      }
    } finally {
      setOpeningPreviewTaskId((current) => (current === task.taskId ? null : current));
    }
  }

  return (
    <section className="product-task-history" aria-label="生成任务历史">
      <header className="product-task-history-head">
        <div className="product-task-history-title">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="product-task-filters">
          <button type="button" onClick={onBackToPreview}>
            <X size={14} />
            返回预览
          </button>
          <button type="button" aria-label="搜索任务">
            <Search size={15} />
          </button>
          <button type="button">
            时间
            <ChevronDown size={14} />
          </button>
          <button type="button">
            生成模式
            <ChevronDown size={14} />
          </button>
          <button type="button">
            操作类型
            <ChevronDown size={14} />
          </button>
        </div>
      </header>

      <div className="product-task-feed">
        {visibleTasks.map((task, index) => {
          const isActive = task.taskId === activeTaskId && !task.videoUrl;
          const stateText = taskStateText(task, activeTaskId, progress.percent);
          const thumb = taskThumbnail(task);
          const isFailed = task.finished && !task.successful;
          const sourceVideoUrl = task.videoUrl?.trim();
          const rawVideoUrl = task.cachedVideoPath?.trim() || sourceVideoUrl;
          const needsProtectedPreview = shouldRequestProtectedPreview(rawVideoUrl);
          const hasExpiredRemoteSource = !task.cachedVideoPath && shouldRefreshExpiringVideoUrl(sourceVideoUrl, 0);
          const previewVideoUrl = rawVideoUrl
            ? needsProtectedPreview
              ? resolvedVideoUrls[task.taskId] || (protectedVideoFallbacks[task.taskId] ? rawVideoUrl : undefined)
              : rawVideoUrl
            : undefined;
          const playbackVideoUrl = previewVideoUrl ? mediaPreviewUrl(previewVideoUrl) : undefined;
          const posterUrl = thumb ? mediaPreviewUrl(thumb) : undefined;
          const isInlinePreview = inlinePreviewTaskId === task.taskId && Boolean(previewVideoUrl) && !videoPreviewErrors[task.taskId];
          const shouldShowPosterFallback = Boolean(rawVideoUrl && !isInlinePreview);
          const placeholderText = rawVideoUrl
            ? openingPreviewTaskId === task.taskId
              ? '正在载入视频...'
              : '点击播放预览'
            : '预览生成中';
          return (
            <article className={`product-task-message${isActive ? ' active' : ''}${isFailed ? ' failed' : ''}`} key={task.id || task.taskId || index}>
              <div className="product-task-avatar">
                {thumb ? <img src={mediaPreviewUrl(thumb)} alt="" /> : <WandSparkles size={18} />}
              </div>
              <div className="product-task-body">
                <div className="product-task-line">
                  <strong>{taskPrompt(task)}</strong>
                </div>
                <div className="product-task-meta">
                  <span>{task.model || 'Seedance 2.0 Fast VIP'}</span>
                  <span>{task.duration || '5s'}</span>
                  <button type="button">
                    详细信息
                    <Info size={13} />
                  </button>
                </div>
                <div
                  className={`product-task-preview-card${isInlinePreview ? ' inline-playing' : ''}`}
                  role="button"
                  tabIndex={0}
                  style={outputRatioStyle(task.ratio)}
                  onClick={() => {
                    void handleOpenTaskVideo(task, rawVideoUrl, previewVideoUrl);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handleOpenTaskVideo(task, rawVideoUrl, previewVideoUrl);
                    }
                  }}
                >
                  <em className={task.videoUrl ? 'done' : isFailed ? 'failed' : ''}>{stateText}</em>
                  {rawVideoUrl ? (
                    shouldShowPosterFallback ? (
                      posterUrl ? <img src={posterUrl} alt="" /> : <span>{placeholderText}</span>
                    ) : (
                      <video
                        key={playbackVideoUrl}
                        ref={(node) => {
                          inlineVideoRefs.current[task.taskId] = node;
                        }}
                        src={playbackVideoUrl}
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                        poster={posterUrl}
                        onClick={(event) => event.stopPropagation()}
                        onLoadedData={() => {
                          clearVideoPreviewError(task.taskId);
                        }}
                        onError={() => {
                          setVideoPreviewErrors((current) => ({ ...current, [task.taskId]: true }));
                          if (needsProtectedPreview) {
                            setResolvedVideoUrls((current) => {
                              if (!current[task.taskId]) return current;
                              const next = { ...current };
                              delete next[task.taskId];
                              return next;
                            });
                          }
                        }}
                      />
                    )
                  ) : thumb ? (
                    <img src={mediaPreviewUrl(thumb)} alt="" />
                  ) : (
                    <span />
                  )}
                  {isActive ? <i style={{ width: `${Math.max(4, Math.min(progress.percent || 1, 100))}%` }} /> : null}
                </div>
                <p>
                  <CheckCircle2 size={14} />
                  {openingPreviewTaskId === task.taskId
                    ? '正在打开预览...'
                    : videoPreviewErrors[task.taskId] && hasExpiredRemoteSource
                    ? '该历史视频已过期，火山源文件仅保留 24 小时，请重新生成。'
                    : isInlinePreview
                    ? '正在播放预览，点击控件可暂停或拖动进度'
                    : task.videoUrl
                    ? '视频已生成，可点击预览'
                    : isFailed
                    ? task.message || '生成失败，请稍后重试'
                    : progress.detail || '会员加速已生效，正在为你生成视频'}
                </p>
              </div>
            </article>
          );
        })}
        {!visibleTasks.length ? <p className="product-task-empty">{emptyText}</p> : null}
      </div>
    </section>
  );
}

function ProductVideoCreateView() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const queryScenario = params.get('scenario') as ProductVideoScenarioKey | null;
  const initialScenario = productVideoScenarios.some((scenario) => scenario.key === queryScenario)
    ? queryScenario!
    : 'product-spokesperson';
  const [activeScenario, setActiveScenario] = useState<ProductVideoScenarioKey>(initialScenario);
  const [productImages, setProductImages] = useState<string[]>([]);
  const [selectedProductImageIndex, setSelectedProductImageIndex] = useState(0);
  const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
  const [storeImages, setStoreImages] = useState<string[]>([]);
  const [selectedStoreImageIndex, setSelectedStoreImageIndex] = useState(0);
  const [selectedStoreSample, setSelectedStoreSample] = useState(storeSamples[0].id);
  const [selectedSample, setSelectedSample] = useState(productSamples[0].id);
  const [description, setDescription] = useState('');
  const [scriptEnabled, setScriptEnabled] = useState(true);
  const [avatarMode, setAvatarMode] = useState<'image' | 'custom'>('image');
  const [avatarSource, setAvatarSource] = useState<'digital' | 'upload'>('digital');
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalTab, setAvatarModalTab] = useState<'digital' | 'upload'>('digital');
  const [selectedAvatarId, setSelectedAvatarId] = useState(digitalHumanAvatars[1].id);
  const [selectedAvatarVariant, setSelectedAvatarVariant] = useState(digitalHumanAvatars[1].variants[0].id);
  const [customAvatarPath, setCustomAvatarPath] = useState<string | null>(null);
  const [model, setModel] = useState('Seedance 2.0（多模态参考）');
  const [quality, setQuality] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState('5s');
  const [status, setStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTask, setGeneratedTask] = useState<ProductVideoTaskStatus | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('');
  const [currentTaskId, setCurrentTaskId] = useState('');
  const [generationScenario, setGenerationScenario] = useState<ProductVideoScenarioKey | null>(null);
  const [historyScenario, setHistoryScenario] = useState<ProductVideoScenarioKey | null>(null);
  const [previewImagePath, setPreviewImagePath] = useState<string | null>(null);
  const [taskThreadStore, setTaskThreadStore] = useState<ProductVideoTaskThreadStore>(() => createEmptyProductVideoTaskThreadStore());
  const [generationProgress, setGenerationProgress] = useState({
    stage: 'idle' as ProductVideoProgressStage,
    percent: 0,
    label: '',
    detail: ''
  });
  const uploadProgressMap = useRef<Record<string, { base: number; span: number; label: string }>>({});

  async function refreshTaskThreads() {
    setTaskThreadStore(await readProductVideoRecentTaskThreadStore());
  }

  async function handleResolveHistoryTaskVideo(taskId: string, nextTask: Record<string, unknown>) {
    setTaskThreadStore(await updateProductVideoRecentTask(taskId, nextTask));
  }

  useEffect(() => {
    if (queryScenario && productVideoScenarios.some((scenario) => scenario.key === queryScenario)) {
      setActiveScenario(queryScenario);
    }
  }, [queryScenario]);

  useEffect(() => {
    if (!['5s', '10s', '12s'].includes(duration)) {
      setDuration('5s');
    }
  }, [duration]);

  useEffect(() => {
    void refreshTaskThreads();
  }, []);

  useEffect(() => {
    if (digitalHumanAvatars.some((item) => item.id === selectedAvatarId)) return;
    setSelectedAvatarId(digitalHumanAvatars[0].id);
    setSelectedAvatarVariant(digitalHumanAvatars[0].variants[0].id);
  }, [selectedAvatarId]);

  useEffect(() => {
    const avatar = digitalHumanAvatars.find((item) => item.id === selectedAvatarId) ?? digitalHumanAvatars[0];
    if (!avatar.variants.some((look) => look.id === selectedAvatarVariant)) {
      setSelectedAvatarVariant(avatar.variants[0].id);
    }
  }, [selectedAvatarId, selectedAvatarVariant]);

  useEffect(() => {
    const unsubscribe = window.surgicol?.media?.onUploadToOssProgress?.((progress: OssUploadProgress) => {
      if (!progress.taskId) return;
      const task = uploadProgressMap.current[progress.taskId];
      if (!task) return;
      const nextPercent = Math.round(task.base + task.span * Math.max(0, Math.min(progress.percent || 0, 100)) / 100);
      const canFallbackToLocalImage = progress.status === 'failed' && progress.taskId.startsWith('product-video-upload-') && !progress.taskId.includes('-reference');
      setGenerationProgress({
        stage: progress.status === 'failed' && !canFallbackToLocalImage ? 'failed' : 'uploading',
        percent: progress.status === 'failed' ? Math.max(nextPercent, 1) : nextPercent,
        label: canFallbackToLocalImage ? '切换本地图片直传' : progress.status === 'failed' ? '上传失败' : task.label,
        detail: canFallbackToLocalImage ? 'OSS 上传超时，正在改用本地图片数据提交' : progress.message || '上传中'
      });
      if (progress.status === 'failed') {
        setStatus(canFallbackToLocalImage ? 'OSS 上传超时，正在切换本地图片直传...' : progress.message || '素材上传失败，请检查网络后重试。');
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const active = productVideoScenarios.find((scenario) => scenario.key === activeScenario) ?? productVideoScenarios[0];
  const activeSample = productSamples.find((sample) => sample.id === selectedSample) ?? productSamples[0];
  const activeStoreSample = storeSamples.find((sample) => sample.id === selectedStoreSample) ?? storeSamples[0];
  const productImage = productImages[selectedProductImageIndex] || productImages[0] || null;
  const storePreviewImage = storeImages[selectedStoreImageIndex] || storeImages[0] || null;
  const selectedAvatar = digitalHumanAvatars.find((avatar) => avatar.id === selectedAvatarId) ?? digitalHumanAvatars[0];
  const selectedAvatarLook = selectedAvatar.variants.find((look) => look.id === selectedAvatarVariant) ?? selectedAvatar.variants[0];
  const avatarPreviewUrl = customAvatarPath && avatarSource === 'upload' ? localFileUrl(customAvatarPath) : selectedAvatarLook.image || selectedAvatar.image;
  const avatarDisplayName = customAvatarPath && avatarSource === 'upload' ? '我的数字人' : selectedAvatar.name;
  const avatarPromptName =
    customAvatarPath && avatarSource === 'upload'
      ? '用户上传的自定义数字人形象'
      : `${selectedAvatar.name}，${selectedAvatar.role}。${selectedAvatar.prompt}`;
  const avatarIdentityPrompt =
    customAvatarPath && avatarSource === 'upload'
      ? '以用户上传的数字人照片为唯一人物身份参考，保持同一张脸、同一年龄感、同一发型和服装主特征。'
      : `${selectedAvatar.prompt} 当前场景：${selectedAvatarLook.label}，${selectedAvatarLook.prompt}`;
  const productVisual = productImage ? { type: 'image' as const, value: localFileUrl(productImage) } : { type: 'sample' as const, value: activeSample.color };
  const storeVisual = storePreviewImage
    ? { type: 'image' as const, value: localFileUrl(storePreviewImage) }
    : { type: 'sample' as const, value: activeStoreSample.color };
  const isShowcase = activeScenario === 'product-showcase';
  const isStoreTraffic = activeScenario === 'store-traffic';
  const isHotReplica = activeScenario === 'hot-replica';
  const isActiveScenarioGeneration = generationScenario === activeScenario && (generationProgress.stage !== 'idle' || Boolean(generatedVideoUrl));
  const activeScenarioTasks = taskThreadStore[activeScenario];
  const hasScenarioTaskHistory = activeScenarioTasks.length > 0 || isActiveScenarioGeneration;
  const historyTasks = activeScenarioTasks;
  const canOpenScenarioHistory = activeScenarioTasks.length > 0 || isActiveScenarioGeneration;
  const shouldShowScenarioHistory = isActiveScenarioGeneration || historyScenario === activeScenario;
  const historyEntryLabel = hasScenarioTaskHistory ? '查看历史任务' : '打开历史记录';
  const historyEntryHint = isActiveScenarioGeneration
    ? '当前任务正在生成，历史页会实时同步进度。'
    : activeScenarioTasks.length > 0
    ? `当前场景已有 ${activeScenarioTasks.length} 条历史记录。`
    : '当前场景还没有历史任务，首次生成后会自动保留在这里。';
  const historyPanelTitle = `${active.title}历史记录`;
  const historyPanelDescription = '当前场景的生成任务会持续保留在这里，方便随时回看和复用。';
  const historyEmptyText = '当前场景还没有历史任务，点击生成后会自动记录在这里。';
  const descriptionLimit = isHotReplica ? 3000 : isStoreTraffic || activeScenario === 'product-spokesperson' ? 500 : 200;
  const previewHeadline = isHotReplica
    ? '拆解爆款元素，一键复刻专属爆款视频。'
    : isStoreTraffic
    ? '探店视频一键生成，同城客流引进店。'
    : isShowcase
    ? '电影感运镜，打造高级感商品大片。'
    : active.title === '商品口播'
      ? '带货数字人，口播营销视频量产不停！'
      : `${active.title}视频一键生成`;
  const previewSubtext = isHotReplica
    ? '上传参考视频，AI 自动复刻爆款节奏与结构。'
    : isStoreTraffic
    ? '上传门店照片与地址，一键生成同城吸客视频。'
    : isShowcase
    ? '上传商品图，AI 生成多角度高质感展示视频。'
    : active.title === '商品口播'
      ? '上传商品图与卖点，一键生成专业带货口播视频。'
      : active.subtitle;
  const currentGenerationTask: ProductVideoTaskThread | null = isActiveScenarioGeneration
    ? {
        id: currentTaskId || 'current-generation-task',
        taskId: currentTaskId || 'current-generation-task',
        title: active.title,
        scenario: generationScenario || activeScenario,
        description: description.trim(),
        productImage: productImage || undefined,
        productImages,
        storeImages,
        referenceVideo,
        status: generationProgress.label || status,
        finished: generationProgress.stage === 'done' || generationProgress.stage === 'failed',
        successful: generationProgress.stage === 'done',
        videoUrl: generatedVideoUrl || undefined,
        message: generationProgress.detail || status,
        model,
        quality,
        ratio,
        duration,
        createdAt: new Date().toISOString()
      }
    : null;

  async function handlePickProductImage() {
    const files = await window.surgicol.dialog.openFiles({
      title: '选择商品图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (files.length) {
      setProductImages((current) => {
        const next = mergeMediaPaths(current, files);
        setSelectedProductImageIndex(Math.min(current.length, next.length - 1));
        return next;
      });
      setStatus(files.length > 1 ? `已添加 ${files.length} 张商品图，右侧预览已同步更新。` : '商品图已添加，右侧预览已同步更新。');
    }
  }

  function handleDropProductImages(files: string[]) {
    setProductImages((current) => {
      const next = mergeMediaPaths(current, files);
      setSelectedProductImageIndex(Math.min(current.length, next.length - 1));
      return next;
    });
    setStatus(files.length > 1 ? `已拖入 ${files.length} 张商品图，右侧预览已同步更新。` : '商品图已拖入，右侧预览已同步更新。');
  }

  async function handleReplaceProductImage(index: number) {
    const files = await window.surgicol.dialog.openFiles({
      title: '替换商品图片',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (files[0]) {
      setProductImages((current) => current.map((image, imageIndex) => (imageIndex === index ? files[0] : image)));
      setSelectedProductImageIndex(index);
      setStatus('商品图已替换。');
    }
  }

  function handleRemoveProductImage(index: number) {
    setProductImages((current) => {
      const next = current.filter((_, imageIndex) => imageIndex !== index);
      setSelectedProductImageIndex(Math.max(0, Math.min(selectedProductImageIndex, next.length - 1)));
      return next;
    });
    setStatus('商品图已移除。');
  }

  function handlePreviewProductImage(index: number) {
    const image = productImages[index];
    if (image) setPreviewImagePath(image);
  }

  async function handlePickReferenceVideo() {
    const files = await window.surgicol.dialog.openFiles({
      title: '选择参考视频',
      properties: ['openFile'],
      filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'm4v', 'webm'] }]
    });
    if (files[0]) {
      setReferenceVideo(files[0]);
      setStatus('参考视频已添加，右侧爆款复刻预览已同步更新。');
    }
  }

  async function handlePickStoreImages() {
    const files = await window.surgicol.dialog.openFiles({
      title: '选择门店图片',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (files.length) {
      setStoreImages((current) => {
        const next = mergeMediaPaths(current, files);
        setSelectedStoreImageIndex(Math.min(current.length, next.length - 1));
        return next;
      });
      setStatus(files.length > 1 ? `已添加 ${files.length} 张门店图，右侧探店视频预览已同步更新。` : '门店图已添加，右侧探店视频预览已同步更新。');
    }
  }

  function handleDropStoreImages(files: string[]) {
    setStoreImages((current) => {
      const next = mergeMediaPaths(current, files);
      setSelectedStoreImageIndex(Math.min(current.length, next.length - 1));
      return next;
    });
    setStatus(files.length > 1 ? `已拖入 ${files.length} 张门店图，右侧探店视频预览已同步更新。` : '门店图已拖入，右侧探店视频预览已同步更新。');
  }

  function handleInvalidImageDrop() {
    setStatus('请拖入 jpg、jpeg、png 或 webp 图片文件。');
  }

  async function handleReplaceStoreImage(index: number) {
    const files = await window.surgicol.dialog.openFiles({
      title: '替换门店图片',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (files[0]) {
      setStoreImages((current) => current.map((image, imageIndex) => (imageIndex === index ? files[0] : image)));
      setSelectedStoreImageIndex(index);
      setStatus('门店图已替换。');
    }
  }

  function handleRemoveStoreImage(index: number) {
    setStoreImages((current) => {
      const next = current.filter((_, imageIndex) => imageIndex !== index);
      setSelectedStoreImageIndex(Math.max(0, Math.min(selectedStoreImageIndex, next.length - 1)));
      return next;
    });
    setStatus('门店图已移除。');
  }

  function handlePreviewStoreImage(index: number) {
    const image = storeImages[index];
    if (image) setPreviewImagePath(image);
  }

  async function handlePickAvatarImage() {
    const files = await window.surgicol.dialog.openFiles({
      title: '上传数字人照片',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (files[0]) {
      setCustomAvatarPath(files[0]);
      setAvatarSource('upload');
      setAvatarMode('custom');
      setAvatarModalTab('upload');
      setStatus('自定义数字人形象已添加，生成时会作为口播人物参考。');
    }
  }

  function resetForm() {
    setProductImages([]);
    setSelectedProductImageIndex(0);
    setReferenceVideo(null);
    setStoreImages([]);
    setSelectedStoreImageIndex(0);
    setSelectedStoreSample(storeSamples[0].id);
    setSelectedSample(productSamples[0].id);
    setDescription('');
    setScriptEnabled(true);
    setAvatarMode('image');
    setAvatarSource('digital');
    setSelectedAvatarId(digitalHumanAvatars[1].id);
    setSelectedAvatarVariant(digitalHumanAvatars[1].variants[0].id);
    setCustomAvatarPath(null);
    setAvatarModalOpen(false);
    setAvatarModalTab('digital');
    setModel('Seedance 2.0（多模态参考）');
    setQuality('720p');
    setRatio('9:16');
    setDuration('5s');
    setStatus('');
    setIsGenerating(false);
    setGeneratedTask(null);
    setGeneratedVideoUrl('');
    setCurrentTaskId('');
    setGenerationScenario(null);
    setHistoryScenario(null);
    uploadProgressMap.current = {};
    setGenerationProgress({ stage: 'idle', percent: 0, label: '', detail: '' });
  }

  async function handleGenerate() {
    if (isGenerating) {
      setStatus(generationScenario === activeScenario ? '当前任务正在生成中，请稍等。' : '已有其他场景任务正在生成，切回对应场景可查看进度。');
      return;
    }
    if (isHotReplica && !referenceVideo) {
      setStatus('请先上传参考视频，用来拆解爆款节奏与结构。');
      return;
    }
    if (!isShowcase && !isStoreTraffic && !isHotReplica && !productImage) {
      setStatus('请先上传商品图，商品口播需要商品素材作为底稿。');
      return;
    }
    if ((isShowcase || isHotReplica) && !productImage) {
      setStatus(isHotReplica ? '请上传商品图，AI 会把商品替换进复刻视频里。' : '请先上传商品图，用来生成商品展示视频。');
      return;
    }
    if (isStoreTraffic && storeImages.length === 0) {
      setStatus('请先上传门店图片，用来生成门店引流视频。');
      return;
    }

    setIsGenerating(true);
    setGenerationScenario(activeScenario);
    setGeneratedTask(null);
    setGeneratedVideoUrl('');
    uploadProgressMap.current = {};
    setGenerationProgress({
      stage: 'submitting',
      percent: 1,
      label: '检查生成配置',
      detail: '正在确认火山视频生成服务可用'
    });

    try {
      const videoConfig = await getProductVideoConfigStatus();
      if (!videoConfig.configured) {
        throw new Error(videoConfig.message || '火山视频生成未配置完整，请检查后台 .env。');
      }
      setGenerationProgress({
        stage: 'uploading',
        percent: 3,
        label: '准备上传素材',
        detail: '正在创建 OSS 上传任务'
      });
      setStatus('正在准备素材...');
      const imagePaths = isStoreTraffic ? storeImages : productImages;
      const imageAccessUrls: string[] = [];
      const imageUploads: OssUploadResult[] = [];
      const uploadSpan = 47 / Math.max(imagePaths.length + (referenceVideo ? 1 : 0), 1);
      for (let index = 0; index < imagePaths.length; index += 1) {
        const input = {
          path: imagePaths[index],
          folder: `product-video/${activeScenario}/images/${index + 1}`,
          label: imagePaths.length > 1 ? `上传素材 ${index + 1}/${imagePaths.length}` : '上传商品素材'
        };
        const taskId = `product-video-upload-${Date.now()}-${index}`;
        uploadProgressMap.current[taskId] = {
          base: 3 + index * uploadSpan,
          span: uploadSpan,
          label: input.label
        };
        setGenerationProgress({
          stage: 'uploading',
          percent: Math.round(3 + index * uploadSpan),
          label: input.label,
          detail: '正在上传图片素材'
        });
        try {
          const uploaded = await withTimeout(
            uploadProductVideoAsset(input.path, input.folder, taskId),
            30000,
            '图片上传 OSS 超时，正在尝试本地压缩直传'
          );
          imageUploads.push(uploaded);
          setGenerationProgress({
            stage: 'signing',
            percent: Math.round(3 + (index + 0.85) * uploadSpan),
            label: '生成图片访问地址',
            detail: '正在为图片创建火山可访问的临时链接'
          });
          imageAccessUrls.push(await getProductVideoAssetAccessUrl(uploaded.mediaUrl));
        } catch (error) {
          if (isOssConfigError(error)) {
            throw new Error('图片素材必须上传到 OSS 才能稳定提供给火山访问，请先恢复 OSS AccessKey 配置。');
          }
          if (!isRecoverableImageUploadError(error)) {
            throw error;
          }
          setGenerationProgress({
            stage: 'uploading',
            percent: Math.round(3 + (index + 0.4) * uploadSpan),
            label: '切换本地图片直传',
            detail: 'OSS 图片上传超时，正在压缩图片作为兜底素材'
          });
          const inlineImage = await readProductVideoAssetAsDataUrl(input.path, { maxDimension: 720, quality: 68 });
          imageAccessUrls.push(inlineImage.dataUrl);
        }
        setGenerationProgress({
          stage: 'uploading',
          percent: Math.round(3 + (index + 1) * uploadSpan),
          label: '图片素材已准备',
          detail: '图片访问地址已准备完成'
        });
      }
      let referenceUpload = null;
      if (referenceVideo) {
        const taskId = `product-video-upload-${Date.now()}-reference`;
        uploadProgressMap.current[taskId] = {
          base: 3 + imagePaths.length * uploadSpan,
          span: uploadSpan,
          label: '上传参考视频'
        };
        try {
          referenceUpload = await withTimeout(
            uploadProductVideoAsset(referenceVideo, `product-video/${activeScenario}/references`, taskId),
            120000,
            '参考视频上传 OSS 超时，请检查网络后重试'
          );
        } catch (error) {
          if (isOssConfigError(error)) {
            throw new Error('参考视频必须上传到 OSS 才能给火山访问，请先恢复 OSS AccessKey 配置。');
          }
          throw error;
        }
      }
      setGenerationProgress({
        stage: 'signing',
        percent: 55,
        label: '生成素材访问地址',
        detail: referenceUpload ? '正在为参考视频创建临时可访问链接' : '本地图片已准备完成，正在提交生成'
      });
      const referenceAccessUrl = referenceUpload ? await getProductVideoAssetAccessUrl(referenceUpload.mediaUrl) : undefined;
      let avatarImageUrl: string | undefined;
      let avatarReferenceImages: string[] = [];
      if (avatarSource === 'upload' && customAvatarPath) {
        setGenerationProgress({
          stage: 'signing',
          percent: 60,
          label: '确认数字人设定',
          detail: '为避免真人图片风控，数字人照片仅作为本地预览，不提交给火山'
        });
      }

      setStatus('素材上传完成，正在提交火山视频生成任务...');
      setGenerationProgress({
        stage: 'submitting',
        percent: 65,
        label: '提交生成任务',
        detail: '正在连接火山视频生成模型'
      });
      const created = await createProductVideoTask({
        scenario: activeScenario,
        description: description.trim(),
        imageUrls: imageAccessUrls,
        referenceVideoUrl: referenceAccessUrl,
        scriptEnabled,
        avatarMode,
        avatarSource,
        avatarId: avatarSource === 'digital' ? selectedAvatarId : 'custom-avatar',
        avatarName: avatarPromptName,
        avatarImageUrl,
        avatarPrompt: avatarIdentityPrompt,
        avatarReferenceImages,
        identityLock: true,
        model,
        quality,
        ratio,
        duration
      });

      const savedTask = {
        id: `product-video-${Date.now()}`,
        taskId: created.taskId,
        scenario: activeScenario,
        title: active.title,
        description: description.trim(),
        productImage,
        productImages,
        referenceVideo,
        storeImages,
        imageUrls: imageUploads.map((item) => item.mediaUrl),
        imageAccessUrls,
        referenceVideoUrl: referenceUpload?.mediaUrl,
        referenceAccessUrl,
        storeSample: selectedStoreSample,
        sample: selectedSample,
        scriptEnabled,
        avatarMode,
        avatarSource,
        avatarId: avatarSource === 'digital' ? selectedAvatarId : 'custom-avatar',
        avatarName: avatarPromptName,
        avatarImageUrl,
        avatarPrompt: avatarIdentityPrompt,
        avatarReferenceImages,
        identityLock: true,
        model: created.model || model,
        quality,
        ratio,
        duration,
        status: created.status || 'submitted',
        prompt: created.prompt,
        createdAt: new Date().toISOString()
      };
      setCurrentTaskId(created.taskId);
      setTaskThreadStore(await updateProductVideoRecentTask(created.taskId, savedTask));
      setStatus(`${active.title}任务已提交，正在等待云端生成...`);
      setGenerationProgress({
        stage: 'generating',
        percent: 72,
        label: '加速生成中',
        detail: '云端正在生成视频，请保持页面打开'
      });
      await pollProductVideoTask(created.taskId, savedTask);
    } catch (error) {
      setGenerationProgress((progress) => ({
        ...progress,
        stage: 'failed',
        percent: Math.max(progress.percent, 1),
        label: '生成失败',
        detail: error instanceof Error ? error.message : '生成失败，请稍后重试。'
      }));
      setStatus(error instanceof Error ? error.message : '生成失败，请稍后重试。');
    } finally {
      setIsGenerating(false);
    }
  }

  async function pollProductVideoTask(taskId: string, savedTask: Record<string, unknown>) {
    let cacheRequested = false;
    for (let index = 0; index < 90; index += 1) {
      await delay(index === 0 ? 2500 : 5000);
      const task = await getProductVideoTaskStatus(taskId);
      setGeneratedTask(task);
      setStatus(productVideoStatusText(task));
      setGenerationProgress({
        stage: task.finished ? (task.successful ? 'done' : 'failed') : 'generating',
        percent: task.finished ? (task.successful ? 100 : 96) : Math.min(96, 72 + index * 2),
        label: task.finished ? (task.successful ? '生成完成' : '生成失败') : `${Math.min(96, 72 + index * 2)}% 加速生成中`,
        detail: task.message || (task.finished ? '任务已结束' : '云端正在渲染成片')
      });
      if (task.videoUrl) {
        setGeneratedVideoUrl(task.videoUrl);
      }
      const nextTask = {
        ...savedTask,
        status: task.status,
        successful: task.successful,
        finished: task.finished,
        videoUrl: task.videoUrl,
        message: task.message,
        updatedAt: new Date().toISOString()
      };
      setTaskThreadStore(await updateProductVideoRecentTask(taskId, nextTask));
      if (task.videoUrl && !cacheRequested && typeof window.surgicol?.media?.cacheRemoteFile === 'function') {
        cacheRequested = true;
        void (async () => {
          try {
            const cached = await cacheProductVideoAssetLocally(task.videoUrl!, {
              folder: 'product-video',
              cacheKey: taskId,
              fileName: `${taskId}.mp4`
            });
            if (!cached.localPath) return;
            setGeneratedVideoUrl(cached.localPath);
            setTaskThreadStore(await updateProductVideoRecentTask(taskId, {
              ...nextTask,
              cachedVideoPath: cached.localPath,
              updatedAt: new Date().toISOString()
            }));
          } catch {
            // Keep the remote playback URL when local caching fails.
          }
        })();
      }
      if (task.finished) return;
    }
    setStatus('任务已提交，云端仍在生成中，稍后可回到最近任务查看。');
    setGenerationProgress({
      stage: 'generating',
      percent: 96,
      label: '96% 加速生成中',
      detail: '云端仍在生成，稍后可回到最近任务查看'
    });
  }

  return (
    <section className="product-video-create page">
      <aside className={`product-create-sidebar${isShowcase ? ' showcase-mode' : ''}${isStoreTraffic ? ' store-mode' : ''}${isHotReplica ? ' replica-mode' : ''}`}>
        <div className="product-create-tabs" aria-label="商品视频类型">
          {productVideoScenarios.map((scenario) => (
            <button
              key={scenario.key}
              type="button"
              className={activeScenario === scenario.key ? 'active' : undefined}
              onClick={() => {
                setActiveScenario(scenario.key);
                navigate(`/product-video/create?scenario=${scenario.key}`, { replace: true });
              }}
            >
              {scenario.title}
            </button>
          ))}
        </div>

        {isHotReplica ? (
          <div className="product-create-field">
            <label>
              <span>参考视频</span>
              <button type="button" onClick={handlePickReferenceVideo}>
                <Upload size={15} />
                上传
              </button>
            </label>
            <button className="store-upload-zone replica-video-zone" type="button" onClick={handlePickReferenceVideo}>
              <span>
                拖拽 & <strong>上传</strong>
              </span>
              <small>试试这些</small>
              <div className="replica-reference-thumb">
                {referenceVideo ? <video src={localFileUrl(referenceVideo)} muted /> : <UserRound size={18} />}
              </div>
            </button>
          </div>
        ) : null}

        <div className="product-create-field">
          <label>
            <span>{isStoreTraffic ? '上传门店图' : isShowcase || isHotReplica ? '上传商品图' : '商品图'}</span>
            <button type="button" onClick={isStoreTraffic ? handlePickStoreImages : handlePickProductImage}>
              <Upload size={15} />
              上传
            </button>
          </label>
          {isHotReplica ? (
            <>
              <button className="store-upload-zone replica-product-zone" type="button" onClick={handlePickProductImage}>
                <span>
                  拖拽 & <strong>上传</strong>
                </span>
                <small>试试这些</small>
                <div className="store-sample-strip">
                  {productSamples.map((sample, index) => (
                    <i
                      key={sample.id}
                      className={selectedSample === sample.id && !productImage ? 'active' : undefined}
                      style={{ '--sample-color': sample.color, '--sample-index': index } as CSSProperties}
                      onClick={(event) => {
                        event.stopPropagation();
                        setProductImages([]);
                        setSelectedProductImageIndex(0);
                        setSelectedSample(sample.id);
                      }}
                    >
                      {productImages[index] ? <img src={localFileUrl(productImages[index])} alt="商品图" /> : sample.copy.slice(0, 2)}
                    </i>
                  ))}
                </div>
              </button>
              <ImageAssetManager
                title="商品图"
                images={productImages}
                selectedIndex={selectedProductImageIndex}
                sampleLabel="仅支持图片，可一次选择多张商品图"
                onUpload={handlePickProductImage}
                onSelect={setSelectedProductImageIndex}
                onPreview={handlePreviewProductImage}
                onRemove={handleRemoveProductImage}
                onDropFiles={handleDropProductImages}
                onInvalidDrop={handleInvalidImageDrop}
              />
            </>
          ) : isStoreTraffic ? (
            <ImageAssetManager
              title="门店图"
              images={storeImages}
              selectedIndex={selectedStoreImageIndex}
              sampleLabel="仅支持图片，可一次选择多张门店图"
              onUpload={handlePickStoreImages}
              onSelect={setSelectedStoreImageIndex}
              onPreview={handlePreviewStoreImage}
              onRemove={handleRemoveStoreImage}
              onDropFiles={handleDropStoreImages}
              onInvalidDrop={handleInvalidImageDrop}
            />
          ) : isShowcase ? (
            <ImageAssetManager
              title="商品图"
              images={productImages}
              selectedIndex={selectedProductImageIndex}
              sampleLabel="仅支持图片，可一次选择多张商品图"
              onUpload={handlePickProductImage}
              onSelect={setSelectedProductImageIndex}
              onPreview={handlePreviewProductImage}
              onRemove={handleRemoveProductImage}
              onDropFiles={handleDropProductImages}
              onInvalidDrop={handleInvalidImageDrop}
            />
          ) : (
            <>
              <ImageAssetManager
                title="商品图"
                images={productImages}
                selectedIndex={selectedProductImageIndex}
                sampleLabel="仅支持图片，可一次选择多张商品图"
                onUpload={handlePickProductImage}
                onSelect={setSelectedProductImageIndex}
                onPreview={handlePreviewProductImage}
                onRemove={handleRemoveProductImage}
                onDropFiles={handleDropProductImages}
                onInvalidDrop={handleInvalidImageDrop}
              />
              <div className="product-sample-row">
                {productSamples.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={selectedSample === sample.id && !productImage ? 'active' : undefined}
                    onClick={() => {
                      setProductImages([]);
                      setSelectedProductImageIndex(0);
                      setSelectedSample(sample.id);
                    }}
                    style={{ '--sample-color': sample.color } as CSSProperties}
                    aria-label={sample.name}
                  >
                    <span>{sample.copy}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {!isShowcase ? (
          <>
            <div className="product-create-field">
              <label>
                <span>{isHotReplica ? '描述你想修改的内容（可选）' : isStoreTraffic ? '门店口播文案' : '口播文案'}</span>
                <em>{description.length}/{descriptionLimit}</em>
              </label>
              <textarea
                value={description}
                maxLength={descriptionLimit}
                onChange={(event) => setDescription(event.target.value)}
                className={isHotReplica ? 'replica-description' : undefined}
                placeholder={
                  isHotReplica
                    ? '添加你的产品信息、视频风格，以及任何你想加入的具体想法'
                    : isStoreTraffic
                    ? '输入希望数字人朗读的门店口播文案，生成时会同步烧录为字幕'
                    : '输入希望数字人朗读的商品口播文案，生成时会同步烧录为字幕'
                }
              />
            </div>

            {!isStoreTraffic && !isHotReplica ? (
              <label className="product-switch-row">
                <span>
                  <strong>口播</strong>
                  <small>自动生成标题、讲解文案和结尾引导</small>
                </span>
                <input type="checkbox" checked={scriptEnabled} onChange={(event) => setScriptEnabled(event.target.checked)} />
              </label>
            ) : null}

            {!isHotReplica ? (
            <div className="product-create-field">
              <label>
                <span>数字人形象</span>
                <em>选填</em>
              </label>
              <div className="product-segmented">
                <button type="button" className={avatarMode === 'image' ? 'active' : undefined} onClick={() => setAvatarMode('image')}>
                  图片
                </button>
                <button type="button" className={avatarMode === 'custom' ? 'active' : undefined} onClick={() => setAvatarMode('custom')}>
                  自定义
                </button>
              </div>
              <div className="product-avatar-actions">
                <button
                  type="button"
                  className={avatarSource === 'digital' ? 'active' : undefined}
                  onClick={() => {
                    setAvatarSource('digital');
                    setAvatarModalTab('digital');
                    setAvatarModalOpen(true);
                  }}
                >
                  <UserRound size={15} />
                  {avatarSource === 'digital' ? selectedAvatar.name : '数字人'}
                </button>
                <button
                  type="button"
                  className={avatarSource === 'upload' ? 'active' : undefined}
                  onClick={() => {
                    setAvatarSource('upload');
                    setAvatarModalTab('upload');
                    setAvatarModalOpen(true);
                  }}
                >
                  <Upload size={15} />
                  {customAvatarPath ? '已上传' : '上传'}
                </button>
              </div>
              <button className="avatar-current-preview" type="button" onClick={() => setAvatarModalOpen(true)}>
                <AvatarFallbackImage src={avatarPreviewUrl} alt={avatarDisplayName} label={avatarDisplayName} />
                <span>
                  <strong>{avatarDisplayName}</strong>
                  <small>{avatarSource === 'upload' ? '自定义形象 · 身份锁定' : `${selectedAvatar.role} · 身份锁定`}</small>
                </span>
              </button>
            </div>
            ) : null}
          </>
        ) : null}

        <div className="product-create-field">
          <label>
            <span>模型</span>
          </label>
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            <option>Seedance 2.0（多模态参考）</option>
            <option>Seedance 1.5 Pro（有声口播）</option>
            <option>Seedance 1.0 Pro（静默展示）</option>
          </select>
        </div>

        <div className={`product-output-grid${isHotReplica ? ' replica-output-grid' : ''}`}>
          <select value={quality} onChange={(event) => setQuality(event.target.value)} aria-label="清晰度">
            <option>720p</option>
            <option>1080p</option>
          </select>
          {!isHotReplica ? (
            <>
              <select value={ratio} onChange={(event) => setRatio(event.target.value)} aria-label="比例">
                <option>9:16</option>
                <option>1:1</option>
                <option>16:9</option>
              </select>
              <select value={duration} onChange={(event) => setDuration(event.target.value)} aria-label="时长">
                <option>5s</option>
                <option>10s</option>
                <option>12s</option>
              </select>
            </>
          ) : null}
        </div>

        <div className="product-create-actions">
          <button type="button" onClick={resetForm}>
            <RotateCcw size={15} />
            重置
          </button>
          <button type="button" className="primary-action" onClick={handleGenerate} disabled={isGenerating && generationScenario === activeScenario}>
            <WandSparkles size={16} />
            {isGenerating && generationScenario === activeScenario ? '生成中...' : '生成 150 美豆'}
          </button>
        </div>
      </aside>

      <main
        className={`product-create-preview${isShowcase ? ' showcase-preview' : ''}${isStoreTraffic ? ' store-preview' : ''}${isHotReplica ? ' replica-preview' : ''}${
          shouldShowScenarioHistory ? ' generation-page' : ' guide-page'
        }`}
      >
        {shouldShowScenarioHistory ? (
          <section className="product-generation-page">
            <ProductTaskThreads
              tasks={historyTasks}
              activeTaskId={currentTaskId || currentGenerationTask?.taskId}
              progress={generationProgress}
              currentTask={currentGenerationTask}
              title={historyPanelTitle}
              description={historyPanelDescription}
              emptyText={historyEmptyText}
              onBackToPreview={() => setHistoryScenario(null)}
              onResolveTaskVideo={handleResolveHistoryTaskVideo}
            />
          </section>
        ) : (
          <>
            <section className={`product-preview-stage ${active.tone}${isShowcase ? ' product-showcase-stage' : ''}${isStoreTraffic ? ' product-store-stage' : ''}${isHotReplica ? ' product-replica-stage' : ''}`}>
              <ProductScenarioVisual
                scenario={active}
                productVisual={productVisual}
                storeVisual={storeVisual}
                referenceVideo={referenceVideo}
                sampleCopy={isStoreTraffic ? activeStoreSample.copy : activeSample.copy}
              />
            </section>

            <section className="product-preview-copy">
              <div>
                <h1>{previewHeadline}</h1>
                <p>{previewSubtext}</p>
                <div className="product-history-entry">
                  <button
                    className="product-history-return"
                    type="button"
                    onClick={() => setHistoryScenario(activeScenario)}
                    aria-label={`${historyEntryLabel}。${historyEntryHint}`}
                  >
                    <ListVideo size={15} />
                    {historyEntryLabel}
                  </button>
                  <small className="product-history-caption">{historyEntryHint}</small>
                </div>
              </div>
              {!isShowcase && !isStoreTraffic && !isHotReplica ? (
                <div className="product-preview-metrics">
                  <span>
                    <Volume2 size={15} />
                    {scriptEnabled ? '口播已开启' : '静默展示'}
                  </span>
                  <span>
                    <MonitorSmartphone size={15} />
                    {quality} · {ratio} · {duration}
                  </span>
                  <span>
                    <CheckCircle2 size={15} />
                    {model}
                  </span>
                </div>
              ) : canOpenScenarioHistory ? (
                <div className="product-preview-metrics history-entry-metrics">
                  <span>
                    <ListVideo size={15} />
                    {hasScenarioTaskHistory ? `${Math.min(historyTasks.length + (isActiveScenarioGeneration ? 1 : 0), 10)} 条当前场景记录` : '最近任务入口'}
                  </span>
                </div>
              ) : null}
            </section>
          </>
        )}
      </main>

      {previewImagePath ? (
        <div className="image-preview-overlay" role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewImagePath(null)}>
          <div className="image-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <strong>图片预览</strong>
              <button type="button" onClick={() => setPreviewImagePath(null)} aria-label="关闭">×</button>
            </header>
            <img src={localFileUrl(previewImagePath)} alt="图片预览" />
          </div>
        </div>
      ) : null}

      {avatarModalOpen ? (
        <div className="avatar-picker-overlay" role="dialog" aria-modal="true" aria-label="选择数字人">
          <div className="avatar-picker-modal">
            <header>
              <button
                type="button"
                className={avatarModalTab === 'digital' ? 'active' : undefined}
                onClick={() => setAvatarModalTab('digital')}
              >
                数字人
              </button>
              <button
                type="button"
                className={avatarModalTab === 'upload' ? 'active' : undefined}
                onClick={() => setAvatarModalTab('upload')}
              >
                上传
              </button>
              <button type="button" className="avatar-picker-close" onClick={() => setAvatarModalOpen(false)} aria-label="关闭">
                ×
              </button>
            </header>

            {avatarModalTab === 'digital' ? (
              <div className="avatar-picker-body">
                <div className="avatar-card-grid">
                  {digitalHumanAvatars.map((avatar) => (
                    <button
                      key={avatar.id}
                      type="button"
                      className={selectedAvatarId === avatar.id && avatarSource === 'digital' ? 'active' : undefined}
                      onClick={() => {
                        setSelectedAvatarId(avatar.id);
                        setSelectedAvatarVariant(avatar.variants[0].id);
                        setAvatarSource('digital');
                        setAvatarMode('image');
                      }}
                    >
                      <AvatarFallbackImage src={avatar.image} alt={avatar.name} label={avatar.name} />
                      <strong>{avatar.name}</strong>
                      <span>{avatar.role}</span>
                      <small>3 个场景位 · 同一身份</small>
                    </button>
                  ))}
                </div>
                <div className="avatar-variant-panel">
                  <button type="button" onClick={() => setAvatarModalOpen(false)}>‹ {selectedAvatar.name} · 3 个场景位同一身份</button>
                  <div className="avatar-variant-grid">
                    {selectedAvatar.variants.map((variant, index) => (
                      <button
                        key={variant.id}
                        type="button"
                        className={`${selectedAvatarVariant === variant.id && avatarSource === 'digital' ? 'active' : ''} avatar-look-card ${variant.className}`}
                        onClick={() => {
                          setSelectedAvatarVariant(variant.id);
                          setAvatarSource('digital');
                          setAvatarMode('image');
                        }}
                      >
                        <AvatarFallbackImage src={variant.image} alt={`${selectedAvatar.name} ${index + 1}`} label={`${selectedAvatar.name} ${index + 1}`} />
                        <span>{selectedAvatar.name} {index + 1} · {variant.label}</span>
                        <small>{variant.scene}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="avatar-upload-body">
                <button className="avatar-upload-drop" type="button" onClick={handlePickAvatarImage}>
                  拖拽或上传数字人照片到这里
                  <small>建议使用正面半身照，脸部清晰，光线均匀</small>
                </button>
                <strong>我的数字人形象</strong>
                {customAvatarPath ? (
                  <div className="custom-avatar-card">
                    <img src={localFileUrl(customAvatarPath)} alt="我的数字人形象" />
                    <span>{customAvatarPath.split(/[\\/]/).pop()}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomAvatarPath(null);
                        setAvatarSource('digital');
                      }}
                      aria-label="删除自定义数字人"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ) : (
                  <p>还没有上传自定义数字人。</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SettingsView() {
  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <h1>设置</h1>
          <p>Electron 本地路径、下载目录、导出目录和账号配置会在这里继续迁移。</p>
        </div>
      </header>
      <div className="settings-grid">
        <label>
          <span>网盘下载目录</span>
          <button type="button" onClick={() => window.surgicol.dialog.openFolder()}>选择目录</button>
        </label>
        <label>
          <span>剪辑导出目录</span>
          <button type="button" onClick={() => window.surgicol.dialog.openFolder()}>选择目录</button>
        </label>
      </div>
    </section>
  );
}
