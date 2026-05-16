import { useEffect, useState, type CSSProperties } from 'react';
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
import moyaMatrixLogo from '@/assets/moya-matrix-logo.svg';

const navItems = [
  { to: '/', label: '首页', icon: Home },
  { to: '/cloud-drive', label: '网盘', icon: Cloud },
  { to: '/editor', label: '剪辑', icon: Clapperboard },
  { to: '/transfers', label: '传输', icon: Download },
  { to: '/settings', label: '设置', icon: Settings }
];

type AuthStatus = 'checking' | 'anonymous' | 'authenticated';
type ProductVideoScenarioKey = 'product-spokesperson' | 'product-showcase' | 'store-traffic' | 'hot-replica';

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

function localFileUrl(filePath: string) {
  return `file:///${filePath.replace(/\\/g, '/')}`;
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
  const [model, setModel] = useState('Seedance 2.0');
  const [quality, setQuality] = useState('720p');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState('15s');
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (queryScenario && productVideoScenarios.some((scenario) => scenario.key === queryScenario)) {
      setActiveScenario(queryScenario);
    }
  }, [queryScenario]);

  const active = productVideoScenarios.find((scenario) => scenario.key === activeScenario) ?? productVideoScenarios[0];
  const activeSample = productSamples.find((sample) => sample.id === selectedSample) ?? productSamples[0];
  const activeStoreSample = storeSamples.find((sample) => sample.id === selectedStoreSample) ?? storeSamples[0];
  const productVisual = productImage ? { type: 'image' as const, value: localFileUrl(productImage) } : { type: 'sample' as const, value: activeSample.color };
  const storeVisual = storeImages[0]
    ? { type: 'image' as const, value: localFileUrl(storeImages[0]) }
    : { type: 'sample' as const, value: activeStoreSample.color };
  const isShowcase = activeScenario === 'product-showcase';
  const isStoreTraffic = activeScenario === 'store-traffic';
  const isHotReplica = activeScenario === 'hot-replica';
  const descriptionLimit = isHotReplica ? 3000 : 50;
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
    setModel('Seedance 2.0');
    setQuality('720p');
    setRatio('9:16');
    setDuration('15s');
    setStatus('');
  }

  function handleGenerate() {
    if (isHotReplica && !referenceVideo) {
      setStatus('请先上传参考视频，用来拆解爆款节奏与结构。');
      return;
    }
    if (isHotReplica && !productImage) {
      setStatus('请上传商品图，AI 会把商品替换进复刻视频里。');
      return;
    }

    const savedTask = {
      id: `product-video-${Date.now()}`,
      scenario: activeScenario,
      title: active.title,
      description: description.trim(),
      productImage,
      referenceVideo,
      storeImages,
      storeSample: selectedStoreSample,
      sample: selectedSample,
      scriptEnabled,
      avatarMode,
      avatarSource,
      model,
      quality,
      ratio,
      duration,
      createdAt: new Date().toISOString()
    };
    const existing = JSON.parse(localStorage.getItem('moya-product-video-tasks') ?? '[]') as unknown[];
    localStorage.setItem('moya-product-video-tasks', JSON.stringify([savedTask, ...existing].slice(0, 12)));
    setStatus(`${active.title}生成任务已创建，可在当前页面继续调整，也会保留到本地最近任务。`);
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
            <span>{isStoreTraffic || isShowcase || isHotReplica ? '上传商品图' : '商品图'}</span>
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
                <span>{isHotReplica ? '描述你想修改的内容（可选）' : isStoreTraffic ? '描述你的门店服务（可选）' : '产品描述'}</span>
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
                    ? '添加你的门店信息、视频风格，以及任何你想加入的具体想法'
                    : '输入商品卖点，例如：轻薄透气、防晒不闷、适合夏季通勤'
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
                <button type="button" className={avatarSource === 'digital' ? 'active' : undefined} onClick={() => setAvatarSource('digital')}>
                  <UserRound size={15} />
                  数字人
                </button>
                <button type="button" className={avatarSource === 'upload' ? 'active' : undefined} onClick={() => setAvatarSource('upload')}>
                  <Upload size={15} />
                  上传
                </button>
              </div>
            </div>
            ) : null}
          </>
        ) : null}

        <div className="product-create-field">
          <label>
            <span>模型</span>
          </label>
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            <option>Seedance 2.0</option>
            <option>口播增强模型</option>
            <option>商品展示模型</option>
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
                <option>15s</option>
                <option>30s</option>
                <option>60s</option>
              </select>
            </>
          ) : null}
        </div>

        {status ? <div className="product-create-status">{status}</div> : null}

        <div className="product-create-actions">
          <button type="button" onClick={resetForm}>
            <RotateCcw size={15} />
            重置
          </button>
          <button type="button" className="primary-action" onClick={handleGenerate}>
            <WandSparkles size={16} />
            生成 150 美豆
          </button>
        </div>
      </aside>

      <main className={`product-create-preview${isShowcase ? ' showcase-preview' : ''}${isStoreTraffic ? ' store-preview' : ''}${isHotReplica ? ' replica-preview' : ''}`}>
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
                  <div className="avatar-head">
                    <UserRound size={34} />
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
      </main>
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
