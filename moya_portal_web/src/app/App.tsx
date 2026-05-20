import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Clapperboard,
  Download,
  Eye,
  Flame,
  Home,
  ImagePlus,
  Info,
  ListVideo,
  LogOut,
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
  Upload,
  UserRound,
  Volume2,
  WandSparkles
} from 'lucide-react';
import { CloudDrivePage } from '@/features/cloud-drive/CloudDrivePage';
import { getMe, type AuthTokenResponse } from '@/features/cloud-drive/api/netdisk';
import { AuthPage } from '@/features/cloud-drive/components/AuthPage';
import { useCloudDriveStore } from '@/features/cloud-drive/cloudDriveStore';
import { EditorPage } from '@/features/editor/EditorPage';
import {
  createProductVideoTask,
  getProductVideoAssetAccessUrl,
  getProductVideoConfigStatus,
  getProductVideoTaskStatus,
  readProductVideoAssetAsDataUrl,
  uploadProductVideoAsset,
  type ProductVideoTaskStatus
} from '@/features/product-video/productVideoApi';
import moyaMatrixLogo from '@/assets/moya-matrix-logo.svg';
import type { OssUploadProgress, OssUploadResult } from '@/shared/types/electron';

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/cloud-drive', label: '网盘', icon: Cloud },
  { to: '/editor', label: '剪辑', icon: Clapperboard },
  { to: '/transfers', label: '传输', icon: Download },
  { to: '/settings', label: '设置', icon: Settings }
];

type AuthStatus = 'checking' | 'anonymous' | 'authenticated';
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
  message?: string;
  model?: string;
  quality?: string;
  ratio?: string;
  duration?: string;
  createdAt?: string;
  updatedAt?: string;
};

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
  return /^(https?:|data:|blob:|moya-media:)/i.test(path) ? path : localFileUrl(path);
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

function productVideoStatusText(task: ProductVideoTaskStatus) {
  if (task.videoUrl) return '生成完成，右侧已显示成片预览。';
  if (task.finished && !task.successful) return task.message || '生成失败，请检查素材或火山任务状态。';
  const normalized = (task.status || '').toLowerCase();
  if (normalized.includes('queue') || normalized.includes('pending')) return '任务排队中，正在等待云端调度...';
  if (normalized.includes('running') || normalized.includes('process') || normalized.includes('generat')) return '云端生成中，请稍等...';
  return task.status ? `云端状态：${task.status}` : '云端生成中，请稍等...';
}

function updateProductVideoRecentTask(taskId: string, nextTask: Record<string, unknown>) {
  const existing = JSON.parse(localStorage.getItem('moya-product-video-tasks') ?? '[]') as Array<Record<string, unknown>>;
  const next = existing.map((task) => (task.taskId === taskId ? { ...task, ...nextTask } : task));
  if (!next.some((task) => task.taskId === taskId)) {
    next.unshift(nextTask);
  }
  localStorage.setItem('moya-product-video-tasks', JSON.stringify(next.slice(0, 12)));
}

function readProductVideoRecentTasks() {
  try {
    return JSON.parse(localStorage.getItem('moya-product-video-tasks') ?? '[]') as ProductVideoTaskThread[];
  } catch {
    return [];
  }
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
  const isEditorRoute = location.pathname.startsWith('/editor');
  const isProductCreateRoute = location.pathname.startsWith('/product-video/create');
  const isCloudRoute = location.pathname.startsWith('/cloud-drive') || location.pathname.startsWith('/transfers');
  const isProtectedRoute = location.pathname.startsWith('/cloud-drive') || location.pathname.startsWith('/transfers');
  const cloudStore = useCloudDriveStore();
  const [authStatus, setAuthStatus] = useState<AuthStatus>(() => (localStorage.getItem('access') ? 'checking' : 'anonymous'));
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('moya-theme') === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    let canceled = false;
    async function restoreSession() {
      const token = localStorage.getItem('access');
      if (!token) {
        setAuthStatus('anonymous');
        return;
      }
      try {
        const user = await getMe();
        if (canceled) return;
        cloudStore.setCurrentUser(user);
        setAuthStatus('authenticated');
      } catch {
        if (canceled) return;
        expireSession();
      }
    }

    restoreSession();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    const handler = () => expireSession();
    window.addEventListener('moya-auth-expired', handler);
    return () => window.removeEventListener('moya-auth-expired', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('moya-theme', theme);
    document.documentElement.dataset.theme = theme;
    window.surgicol?.app?.setTitlebarTheme(theme).catch(() => undefined);
  }, [theme]);

  async function handleAuthenticated(token: AuthTokenResponse) {
    localStorage.setItem('access', token.token);
    const user = await getMe();
    cloudStore.setCurrentUser(user);
    setAuthStatus('authenticated');
  }

  function expireSession() {
    localStorage.removeItem('access');
    cloudStore.clearWorkspace();
    setAuthStatus('anonymous');
  }

  const isAuthenticated = authStatus === 'authenticated';
  const showShell = isAuthenticated || !isProtectedRoute;

  return (
    <div className={`app-window theme-${theme}${isEditorRoute || isProductCreateRoute ? ' editor-workbench' : ''}${isCloudRoute ? ' cloud-workbench' : ''}`}>
      <header className="app-titlebar">
        <NavLink className="titlebar-brand" to="/">
          <img src={moyaMatrixLogo} alt="moya矩阵" />
          <div>
            <strong>moya矩阵</strong>
            <span>{theme === 'dark' ? '暗夜模式' : '白天模式'}</span>
          </div>
        </NavLink>
        {showShell && (isEditorRoute || isProductCreateRoute) ? (
          <nav className="titlebar-nav" aria-label="功能切换">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
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
          {isAuthenticated ? (
            <button className="logout-button" type="button" onClick={expireSession}>
              <LogOut size={15} />
              <span>退出</span>
            </button>
          ) : null}
        </div>
      </header>

      {authStatus === 'checking' && isProtectedRoute ? (
        <section className="auth-screen">
          <div className="auth-card">
            <div className="auth-message">正在恢复登录状态...</div>
          </div>
        </section>
      ) : null}

      {authStatus === 'anonymous' && isProtectedRoute ? <AuthPage onAuthenticated={handleAuthenticated} /> : null}

      {showShell ? (
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
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}>
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="app-main">
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/cloud-drive" element={isAuthenticated ? <CloudDrivePage /> : <Navigate to="/cloud-drive" replace />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/product-video/create" element={<ProductVideoCreateView />} />
            <Route path="/transfers" element={isAuthenticated ? <CloudDrivePage initialMenu="transport" /> : <Navigate to="/transfers" replace />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
      ) : null}
    </div>
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
          <span>登录后管理素材、分享和传输任务</span>
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
  onBackToPreview,
  onOpenVideo
}: {
  tasks: ProductVideoTaskThread[];
  activeTaskId?: string;
  progress: { stage: ProductVideoProgressStage; percent: number; label: string; detail: string };
  currentTask?: ProductVideoTaskThread | null;
  onBackToPreview: () => void;
  onOpenVideo: (url: string) => void;
}) {
  const mergedTasks = currentTask && !tasks.some((task) => task.taskId === currentTask.taskId) ? [currentTask, ...tasks] : tasks;
  const visibleTasks = mergedTasks.slice(0, 10);
  return (
    <section className="product-task-history" aria-label="生成任务历史">
      <header className="product-task-history-head">
        <h2>今天</h2>
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
                <button
                  className="product-task-preview-card"
                  type="button"
                  style={outputRatioStyle(task.ratio)}
                  onClick={() => task.videoUrl && onOpenVideo(task.videoUrl)}
                >
                  <em className={task.videoUrl ? 'done' : isFailed ? 'failed' : ''}>{stateText}</em>
                  {task.videoUrl ? (
                    <video src={task.videoUrl} controls playsInline />
                  ) : thumb ? (
                    <img src={mediaPreviewUrl(thumb)} alt="" />
                  ) : (
                    <span />
                  )}
                  {isActive ? <i style={{ width: `${Math.max(4, Math.min(progress.percent || 1, 100))}%` }} /> : null}
                </button>
                <p>
                  <CheckCircle2 size={14} />
                  {task.videoUrl ? '视频已生成，可点击预览' : isFailed ? task.message || '生成失败，请稍后重试' : progress.detail || '会员加速已生效，正在为你生成视频'}
                </p>
              </div>
            </article>
          );
        })}
        {!visibleTasks.length ? <p className="product-task-empty">每次点击生成都会在这里新建一条任务记录。</p> : null}
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
  const [taskThreads, setTaskThreads] = useState<ProductVideoTaskThread[]>(() => readProductVideoRecentTasks());
  const [generationProgress, setGenerationProgress] = useState({
    stage: 'idle' as ProductVideoProgressStage,
    percent: 0,
    label: '',
    detail: ''
  });
  const uploadProgressMap = useRef<Record<string, { base: number; span: number; label: string }>>({});

  function refreshTaskThreads() {
    setTaskThreads(readProductVideoRecentTasks());
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
  const activeScenarioTasks = taskThreads.filter((task) => !task.scenario || task.scenario === activeScenario);
  const canOpenScenarioHistory = activeScenarioTasks.length > 0 || isActiveScenarioGeneration;
  const shouldShowScenarioHistory = isActiveScenarioGeneration || historyScenario === activeScenario;
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
      const existing = JSON.parse(localStorage.getItem('moya-product-video-tasks') ?? '[]') as unknown[];
      localStorage.setItem('moya-product-video-tasks', JSON.stringify([savedTask, ...existing].slice(0, 12)));
      refreshTaskThreads();
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
      updateProductVideoRecentTask(taskId, {
        ...savedTask,
        status: task.status,
        successful: task.successful,
        finished: task.finished,
        videoUrl: task.videoUrl,
        message: task.message,
        updatedAt: new Date().toISOString()
      });
      refreshTaskThreads();
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
              tasks={activeScenarioTasks}
              activeTaskId={currentTaskId || currentGenerationTask?.taskId}
              progress={generationProgress}
              currentTask={currentGenerationTask}
              onBackToPreview={() => setHistoryScenario(null)}
              onOpenVideo={setGeneratedVideoUrl}
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
                {canOpenScenarioHistory ? (
                  <button className="product-history-return" type="button" onClick={() => setHistoryScenario(activeScenario)}>
                    <ListVideo size={15} />
                    查看历史任务
                  </button>
                ) : null}
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
