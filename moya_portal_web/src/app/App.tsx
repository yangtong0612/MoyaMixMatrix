import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Clapperboard,
  Download,
  Flame,
  Home,
  ImagePlus,
  LogOut,
  MonitorSmartphone,
  Moon,
  Package,
  PlayCircle,
  Repeat2,
  RotateCcw,
  Settings,
  ShoppingBag,
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
  getProductVideoTaskStatus,
  readProductVideoAssetAsDataUrl,
  uploadProductVideoAsset,
  type ProductVideoTaskStatus
} from '@/features/product-video/productVideoApi';
import moyaMatrixLogo from '@/assets/moya-matrix-logo.svg';
import type { OssUploadProgress } from '@/shared/types/electron';

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

const digitalHumanAvatars = [
  {
    id: 'linzhixia',
    name: '林知夏',
    role: '商务女主持',
    prompt: '中国年轻女性，干练西装，适合商品口播、企业介绍和直播带货，镜头表现自然亲和。',
    scenes: 3,
    image: 'https://images.pexels.com/photos/26728100/pexels-photo-26728100.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: [
      'https://images.pexels.com/photos/26728100/pexels-photo-26728100.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/27086757/pexels-photo-27086757.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/21044845/pexels-photo-21044845.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop'
    ]
  },
  {
    id: 'suwanwan',
    name: '苏绾绾',
    role: '汉服国风女主',
    prompt: '中国女性，汉服或新中式国风造型，适合茶饮、文旅、国潮商品和礼品场景，气质温婉精致。',
    scenes: 3,
    image: 'https://images.pexels.com/photos/18077457/pexels-photo-18077457.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: [
      'https://images.pexels.com/photos/18077457/pexels-photo-18077457.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/19055839/pexels-photo-19055839.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/19243941/pexels-photo-19243941.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop'
    ]
  },
  {
    id: 'jiangchen',
    name: '江晨',
    role: '商务男主持',
    prompt: '中国年轻男性，商务西装，适合科技数码、课程咨询、招商加盟和高客单产品讲解，表达专业可信。',
    scenes: 3,
    image: 'https://images.pexels.com/photos/16241480/pexels-photo-16241480.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: [
      'https://images.pexels.com/photos/16241480/pexels-photo-16241480.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/21044803/pexels-photo-21044803.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/21044809/pexels-photo-21044809.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop'
    ]
  },
  {
    id: 'xumengting',
    name: '许梦婷',
    role: '白大褂顾问',
    prompt: '中国女性，白大褂或专业顾问制服，适合美业、护肤、健康管理和门店咨询场景，语气温柔专业。',
    scenes: 3,
    image: 'https://images.pexels.com/photos/8442819/pexels-photo-8442819.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: [
      'https://images.pexels.com/photos/8442819/pexels-photo-8442819.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/5452201/pexels-photo-5452201.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/5214959/pexels-photo-5214959.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop'
    ]
  },
  {
    id: 'zhouye',
    name: '周野',
    role: '餐饮工作服男主',
    prompt: '中国男性，餐饮、厨师或门店工作服造型，适合餐厅探店、本地生活团购和到店引流，表现热情接地气。',
    scenes: 3,
    image: 'https://images.pexels.com/photos/12291879/pexels-photo-12291879.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: [
      'https://images.pexels.com/photos/12291879/pexels-photo-12291879.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/33615812/pexels-photo-33615812.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/33615818/pexels-photo-33615818.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop'
    ]
  },
  {
    id: 'xiaoning',
    name: '夏宁',
    role: '门店制服女导购',
    prompt: '中国女性，门店导购、前台或服务制服造型，适合门店引流、活动介绍和新品推荐，表达清爽有亲和力。',
    scenes: 3,
    image: 'https://images.pexels.com/photos/30870216/pexels-photo-30870216.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
    variants: [
      'https://images.pexels.com/photos/30870216/pexels-photo-30870216.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/14230736/pexels-photo-14230736.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop',
      'https://images.pexels.com/photos/33615812/pexels-photo-33615812.jpeg?auto=compress&cs=tinysrgb&w=420&h=560&fit=crop'
    ]
  }
];

function localFileUrl(filePath: string) {
  return `moya-media://file?path=${encodeURIComponent(filePath)}`;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function isOssConfigError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /OSS.*(未配置|endpoint|访问密钥|AccessKey|access key|未启用)/i.test(message);
}

export function App() {
  const location = useLocation();
  const isEditorRoute = location.pathname.startsWith('/editor');
  const isProductCreateRoute = location.pathname.startsWith('/product-video/create');
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
    <div className={`app-window theme-${theme}${isEditorRoute || isProductCreateRoute ? ' editor-workbench' : ''}`}>
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

function ProductVideoCreateView() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const queryScenario = params.get('scenario') as ProductVideoScenarioKey | null;
  const initialScenario = productVideoScenarios.some((scenario) => scenario.key === queryScenario)
    ? queryScenario!
    : 'product-spokesperson';
  const [activeScenario, setActiveScenario] = useState<ProductVideoScenarioKey>(initialScenario);
  const [productImage, setProductImage] = useState<string | null>(null);
  const [referenceVideo, setReferenceVideo] = useState<string | null>(null);
  const [storeImages, setStoreImages] = useState<string[]>([]);
  const [selectedStoreSample, setSelectedStoreSample] = useState(storeSamples[0].id);
  const [selectedSample, setSelectedSample] = useState(productSamples[0].id);
  const [description, setDescription] = useState('');
  const [scriptEnabled, setScriptEnabled] = useState(true);
  const [avatarMode, setAvatarMode] = useState<'image' | 'custom'>('image');
  const [avatarSource, setAvatarSource] = useState<'digital' | 'upload'>('digital');
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarModalTab, setAvatarModalTab] = useState<'digital' | 'upload'>('digital');
  const [selectedAvatarId, setSelectedAvatarId] = useState(digitalHumanAvatars[1].id);
  const [selectedAvatarVariant, setSelectedAvatarVariant] = useState(digitalHumanAvatars[1].variants[0]);
  const [customAvatarPath, setCustomAvatarPath] = useState<string | null>(null);
  const [model, setModel] = useState('Seedance 1.5 Pro（有声口播）');
  const [quality, setQuality] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState('5s');
  const [status, setStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedTask, setGeneratedTask] = useState<ProductVideoTaskStatus | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState('');
  const [generationProgress, setGenerationProgress] = useState({
    stage: 'idle' as ProductVideoProgressStage,
    percent: 0,
    label: '',
    detail: ''
  });
  const uploadProgressMap = useRef<Record<string, { base: number; span: number; label: string }>>({});

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
    const unsubscribe = window.surgicol?.media?.onUploadToOssProgress?.((progress: OssUploadProgress) => {
      if (!progress.taskId) return;
      const task = uploadProgressMap.current[progress.taskId];
      if (!task) return;
      const nextPercent = Math.round(task.base + task.span * Math.max(0, Math.min(progress.percent || 0, 100)) / 100);
      setGenerationProgress({
        stage: progress.status === 'failed' ? 'failed' : 'uploading',
        percent: progress.status === 'failed' ? Math.max(nextPercent, 1) : nextPercent,
        label: progress.status === 'failed' ? '上传失败' : task.label,
        detail: progress.message || '上传中'
      });
      if (progress.status === 'failed') {
        setStatus(progress.message || '素材上传失败，请检查网络后重试。');
      }
    });
    return () => {
      unsubscribe?.();
    };
  }, []);

  const active = productVideoScenarios.find((scenario) => scenario.key === activeScenario) ?? productVideoScenarios[0];
  const activeSample = productSamples.find((sample) => sample.id === selectedSample) ?? productSamples[0];
  const activeStoreSample = storeSamples.find((sample) => sample.id === selectedStoreSample) ?? storeSamples[0];
  const selectedAvatar = digitalHumanAvatars.find((avatar) => avatar.id === selectedAvatarId) ?? digitalHumanAvatars[0];
  const avatarPreviewUrl = customAvatarPath && avatarSource === 'upload' ? localFileUrl(customAvatarPath) : selectedAvatarVariant || selectedAvatar.image;
  const avatarDisplayName = customAvatarPath && avatarSource === 'upload' ? '我的数字人' : selectedAvatar.name;
  const avatarPromptName =
    customAvatarPath && avatarSource === 'upload'
      ? '用户上传的自定义数字人形象'
      : `${selectedAvatar.name}，${selectedAvatar.role}。${selectedAvatar.prompt}`;
  const productVisual = productImage ? { type: 'image' as const, value: localFileUrl(productImage) } : { type: 'sample' as const, value: activeSample.color };
  const storeVisual = storeImages[0]
    ? { type: 'image' as const, value: localFileUrl(storeImages[0]) }
    : { type: 'sample' as const, value: activeStoreSample.color };
  const isShowcase = activeScenario === 'product-showcase';
  const isStoreTraffic = activeScenario === 'store-traffic';
  const isHotReplica = activeScenario === 'hot-replica';
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

  async function handlePickProductImage() {
    const files = await window.surgicol.dialog.openFiles({
      title: '选择商品图片',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (files[0]) {
      setProductImage(files[0]);
      setStatus('商品图已添加，右侧预览已同步更新。');
    }
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
      setStoreImages(files.slice(0, 6));
      setStatus('门店图已添加，右侧探店视频预览已同步更新。');
    }
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
    setProductImage(null);
    setReferenceVideo(null);
    setStoreImages([]);
    setSelectedStoreSample(storeSamples[0].id);
    setSelectedSample(productSamples[0].id);
    setDescription('');
    setScriptEnabled(true);
    setAvatarMode('image');
    setAvatarSource('digital');
    setSelectedAvatarId(digitalHumanAvatars[1].id);
    setSelectedAvatarVariant(digitalHumanAvatars[1].variants[0]);
    setCustomAvatarPath(null);
    setAvatarModalOpen(false);
    setAvatarModalTab('digital');
    setModel('Seedance 1.5 Pro（有声口播）');
    setQuality('720p');
    setRatio('9:16');
    setDuration('5s');
    setStatus('');
    setIsGenerating(false);
    setGeneratedTask(null);
    setGeneratedVideoUrl('');
    uploadProgressMap.current = {};
    setGenerationProgress({ stage: 'idle', percent: 0, label: '', detail: '' });
  }

  async function handleGenerate() {
    if (isGenerating) return;
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
    setGeneratedTask(null);
    setGeneratedVideoUrl('');
    uploadProgressMap.current = {};
    setGenerationProgress({
      stage: 'uploading',
      percent: 3,
      label: '准备上传素材',
      detail: '正在创建 OSS 上传任务'
    });

    try {
      setStatus('正在准备素材...');
      const imagePaths = isStoreTraffic ? storeImages : productImage ? [productImage] : [];
      const imageAccessUrls: string[] = [];
      const imageUploads = [];
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
        try {
          const uploaded = await uploadProductVideoAsset(input.path, input.folder, taskId);
          imageUploads.push(uploaded);
          imageAccessUrls.push(await getProductVideoAssetAccessUrl(uploaded.mediaUrl));
        } catch (error) {
          if (!isOssConfigError(error)) throw error;
          setStatus('OSS 配置未恢复，正在使用本地图片直传兜底...');
          setGenerationProgress({
            stage: 'uploading',
            percent: Math.round(3 + (index + 1) * uploadSpan),
            label: '本地图片直传',
            detail: 'OSS 密钥未配置，已改用本地图片数据提交火山生成'
          });
          const inlineImage = await readProductVideoAssetAsDataUrl(input.path);
          imageAccessUrls.push(inlineImage.dataUrl);
        }
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
          referenceUpload = await uploadProductVideoAsset(referenceVideo, `product-video/${activeScenario}/references`, taskId);
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
        detail: imageUploads.length === imagePaths.length ? '正在为火山引擎创建临时可访问链接' : '本地图片已准备完成，正在提交生成'
      });
      const referenceAccessUrl = referenceUpload ? await getProductVideoAssetAccessUrl(referenceUpload.mediaUrl) : undefined;
      let avatarImageUrl = avatarSource === 'digital' ? selectedAvatarVariant || selectedAvatar.image : undefined;
      if (avatarSource === 'upload' && customAvatarPath) {
        setGenerationProgress({
          stage: 'signing',
          percent: 60,
          label: '上传数字人形象',
          detail: '正在为自定义数字人创建参考图'
        });
        try {
          const avatarUpload = await uploadProductVideoAsset(customAvatarPath, `product-video/${activeScenario}/avatars`);
          avatarImageUrl = await getProductVideoAssetAccessUrl(avatarUpload.mediaUrl);
        } catch (error) {
          if (!isOssConfigError(error)) throw error;
          const inlineAvatar = await readProductVideoAssetAsDataUrl(customAvatarPath);
          avatarImageUrl = inlineAvatar.dataUrl;
        }
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
        model: created.model || model,
        quality,
        ratio,
        duration,
        status: created.status || 'submitted',
        prompt: created.prompt,
        createdAt: new Date().toISOString()
      };
      const existing = JSON.parse(localStorage.getItem('moya-product-video-tasks') ?? '[]') as unknown[];
      localStorage.setItem('moya-product-video-tasks', JSON.stringify([savedTask, ...existing].slice(0, 12)));
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
                      setProductImage(null);
                      setSelectedSample(sample.id);
                    }}
                  >
                    {productImage && index === 0 ? <img src={localFileUrl(productImage)} alt="商品图" /> : sample.copy.slice(0, 2)}
                  </i>
                ))}
              </div>
            </button>
          ) : isStoreTraffic ? (
            <button className="store-upload-zone" type="button" onClick={handlePickStoreImages}>
              <span>
                拖拽 & <strong>上传</strong>
              </span>
              <small>试试这些</small>
              <div className="store-sample-strip">
                {storeSamples.map((sample, index) => (
                  <i
                    key={sample.id}
                    className={selectedStoreSample === sample.id && !storeImages.length ? 'active' : undefined}
                    style={{ '--sample-color': sample.color, '--sample-index': index } as CSSProperties}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStoreImages([]);
                      setSelectedStoreSample(sample.id);
                    }}
                  >
                    {storeImages[index] ? <img src={localFileUrl(storeImages[index])} alt="门店图" /> : sample.copy.slice(0, 2)}
                  </i>
                ))}
              </div>
            </button>
          ) : isShowcase ? (
            <div className="showcase-upload-panel">
              <button
                type="button"
                className="showcase-upload-thumb"
                onClick={() => {
                  setProductImage(null);
                  setSelectedSample(activeSample.id);
                }}
                style={{ '--sample-color': activeSample.color } as CSSProperties}
              >
                {productImage ? <img src={localFileUrl(productImage)} alt="商品图预览" /> : <span>{activeSample.copy}</span>}
              </button>
              <button className="showcase-upload-add" type="button" onClick={handlePickProductImage} aria-label="添加商品图">
                <ImagePlus size={18} />
              </button>
            </div>
          ) : (
            <>
              <button className="product-upload-zone" type="button" onClick={handlePickProductImage}>
                {productImage ? (
                  <img src={localFileUrl(productImage)} alt="商品图预览" />
                ) : (
                  <>
                    <ImagePlus size={28} />
                    <strong>拖入或上传商品图</strong>
                    <span>支持 JPG / PNG / WebP</span>
                  </>
                )}
              </button>
              <div className="product-sample-row">
                {productSamples.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    className={selectedSample === sample.id && !productImage ? 'active' : undefined}
                    onClick={() => {
                      setProductImage(null);
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
                <img src={avatarPreviewUrl} alt={avatarDisplayName} />
                <span>
                  <strong>{avatarDisplayName}</strong>
                  <small>{avatarSource === 'upload' ? '自定义形象' : selectedAvatar.role}</small>
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
          <button type="button" className="primary-action" onClick={handleGenerate} disabled={isGenerating}>
            <WandSparkles size={16} />
            {isGenerating ? '生成中...' : '生成 150 美豆'}
          </button>
        </div>
      </aside>

      <main
        className={`product-create-preview${isShowcase ? ' showcase-preview' : ''}${isStoreTraffic ? ' store-preview' : ''}${isHotReplica ? ' replica-preview' : ''}${
          generationProgress.stage !== 'idle' || generatedVideoUrl ? ' generation-page' : ' guide-page'
        }`}
      >
        {generationProgress.stage !== 'idle' || generatedVideoUrl ? (
          <section className="product-generation-page">
            {generatedVideoUrl ? (
              <div className="product-generated-video-card">
                <video src={generatedVideoUrl} controls playsInline />
                <span>{active.title}成片预览</span>
              </div>
            ) : (
              <div className={`product-generation-live-card progress-${generationProgress.stage}`}>
              <div className="product-generation-card-stack" aria-hidden="true">
                <span className="product-generation-card ghost-card" />
                <span className="product-generation-card active-card">
                  <span className="generation-card-media">
                    {isStoreTraffic && storeVisual.type === 'image' ? (
                      <img src={storeVisual.value} alt="" />
                    ) : productVisual.type === 'image' ? (
                      <img src={productVisual.value} alt="" />
                    ) : avatarSource === 'digital' ? (
                      <img src={avatarPreviewUrl} alt="" />
                    ) : (
                      <strong>{isStoreTraffic ? activeStoreSample.copy : activeSample.copy}</strong>
                    )}
                  </span>
                  <span className="generation-card-caption">{active.title}</span>
                </span>
                <span className="product-generation-card mini-card">
                  <WandSparkles size={22} />
                </span>
              </div>
              <div className="product-generation-live-copy">
                <span>{generationProgress.stage === 'failed' ? '任务异常' : '云端生成任务'}</span>
                <strong>{generationProgress.label || status || `${active.title}生成中`}</strong>
                <p>{generationProgress.detail || status || '正在处理素材并渲染成片'}</p>
                <div className="product-progress-track large">
                  <i style={{ width: `${Math.max(3, Math.min(generationProgress.percent || 1, 100))}%` }} />
                </div>
                <div className="product-generation-live-meta">
                  <span>{generationProgress.percent || 1}%</span>
                  <span>{quality} · {ratio} · {duration}</span>
                </div>
                <div className="product-generation-steps">
                  <span className={generationProgress.percent >= 12 ? 'active' : undefined}>上传素材</span>
                  <span className={generationProgress.percent >= 55 ? 'active' : undefined}>生成链接</span>
                  <span className={generationProgress.percent >= 65 ? 'active' : undefined}>提交任务</span>
                  <span className={generationProgress.percent >= 72 ? 'active' : undefined}>渲染成片</span>
                </div>
              </div>
            </div>
            )}
          </section>
        ) : (
          <>
            <div className="product-preview-toolbar">
              <NavLink to="/">
                <Home size={15} />
                首页
              </NavLink>
              <NavLink to="/editor?workflow=viral">
                <Sparkles size={15} />
                网感剪辑
              </NavLink>
            </div>

            <section className={`product-preview-stage ${active.tone}${isShowcase ? ' product-showcase-stage' : ''}${isStoreTraffic ? ' product-store-stage' : ''}${isHotReplica ? ' product-replica-stage' : ''}`}>
              {isHotReplica ? (
            <div className="replica-demo-canvas">
              <div className="replica-video-card">
                <strong>爆款视频</strong>
                <div className="replica-phone replica-source-phone">
                  {referenceVideo ? <video src={localFileUrl(referenceVideo)} muted /> : <UserRound size={42} />}
                  <PlayCircle className="replica-play" size={28} />
                </div>
              </div>
              <div className="replica-middle-card">
                <div className="replica-product-object" style={{ '--sample-color': activeSample.color } as CSSProperties}>
                  {productVisual.type === 'image' ? <img src={productVisual.value} alt="商品图" /> : <span>{activeSample.copy}</span>}
                </div>
                <span>商品图</span>
                <ArrowRight className="replica-curve-arrow" size={38} />
              </div>
              <div className="replica-video-card">
                <strong>AI 复刻</strong>
                <div className="replica-phone replica-result-phone">
                  <div className="replica-result-person">
                    <UserRound size={34} />
                    <div className="replica-result-product" style={{ '--sample-color': activeSample.color } as CSSProperties}>
                      {productVisual.type === 'image' ? <img src={productVisual.value} alt="复刻商品" /> : <span>{activeSample.copy}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : isStoreTraffic ? (
            <div className="store-demo-canvas">
              <div className="store-source-card">
                <strong>上传多张门店图</strong>
                <div className="store-source-frame">
                  <div className="store-photo-stack" style={{ '--sample-color': activeStoreSample.color } as CSSProperties}>
                    <span className="store-photo-bg" />
                    <span className="store-photo-main">
                      {storeVisual.type === 'image' ? <img src={storeVisual.value} alt="门店预览" /> : activeStoreSample.copy}
                    </span>
                    <PlayCircle className="store-photo-play" size={34} />
                  </div>
                </div>
              </div>
            </div>
          ) : isShowcase ? (
            <div className="showcase-demo-canvas">
              <div className="showcase-source-card">
                <strong>上传一张商品图</strong>
                <div className="showcase-source-frame">
                  <div className="showcase-product-object" style={{ '--sample-color': activeSample.color } as CSSProperties}>
                    {productVisual.type === 'image' ? <img src={productVisual.value} alt="商品预览" /> : <span>{activeSample.copy}</span>}
                  </div>
                </div>
              </div>
              <ArrowRight className="showcase-curve-arrow" size={38} />
              <div className="showcase-generated-card">
                <em>AI生成</em>
                <div className="showcase-person">
                  <div className="showcase-person-head">
                    <UserRound size={30} />
                  </div>
                  <div className="showcase-person-body">
                    <div className="showcase-hand-product" style={{ '--sample-color': activeSample.color } as CSSProperties}>
                      {productVisual.type === 'image' ? <img src={productVisual.value} alt="展示视频商品" /> : <span>{activeSample.copy}</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="product-flow-card product-shot-card">
                <div className="product-shot-image" style={{ '--sample-color': activeSample.color } as CSSProperties}>
                  {productVisual.type === 'image' ? <img src={productVisual.value} alt="商品预览" /> : <strong>{activeSample.name}</strong>}
                </div>
                <span>商品图</span>
              </div>

              <ArrowRight className="product-flow-arrow" size={26} />

              <div className="product-flow-card product-avatar-card">
                <div className="product-avatar-video">
                  <div className="avatar-head avatar-head-image">
                    <img src={avatarPreviewUrl} alt={avatarDisplayName} />
                  </div>
                  <div className="avatar-caption">
                    {scriptEnabled ? (description || `${activeSample.name}，今天这款真的适合日常通勤。`) : '展示产品核心卖点'}
                  </div>
                  <PlayCircle className="avatar-play" size={28} />
                </div>
                <span>数字人口播成片</span>
              </div>
            </>
          )}
            </section>

            <section className="product-preview-copy">
              <div>
                <h1>{previewHeadline}</h1>
                <p>{previewSubtext}</p>
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
                        setSelectedAvatarVariant(avatar.variants[0]);
                        setAvatarSource('digital');
                        setAvatarMode('image');
                      }}
                    >
                      <img src={avatar.image} alt={avatar.name} />
                      <strong>{avatar.name}</strong>
                      <span>{avatar.role}</span>
                      <small>{avatar.scenes} 套外观</small>
                    </button>
                  ))}
                </div>
                <div className="avatar-variant-panel">
                  <button type="button" onClick={() => setAvatarModalOpen(false)}>‹ {selectedAvatar.name}</button>
                  <div className="avatar-variant-grid">
                    {selectedAvatar.variants.map((variant, index) => (
                      <button
                        key={variant}
                        type="button"
                        className={selectedAvatarVariant === variant && avatarSource === 'digital' ? 'active' : undefined}
                        onClick={() => {
                          setSelectedAvatarVariant(variant);
                          setAvatarSource('digital');
                          setAvatarMode('image');
                        }}
                      >
                        <img src={variant} alt={`${selectedAvatar.name} ${index + 1}`} />
                        <span>{selectedAvatar.role} {index + 1}</span>
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
