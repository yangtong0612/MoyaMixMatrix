import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ArrowRight, Cloud, Clapperboard, Download, Flame, Home, LogOut, Moon, Package, Repeat2, Settings, ShoppingBag, Sparkles, Store, Sun } from 'lucide-react';
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

export function App() {
  const location = useLocation();
  const isEditorRoute = location.pathname.startsWith('/editor');
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
    <div className={`app-window theme-${theme}${isEditorRoute ? ' editor-workbench' : ''}`}>
      <header className="app-titlebar">
        <NavLink className="titlebar-brand" to="/">
          <img src={moyaMatrixLogo} alt="moya矩阵" />
          <div>
            <strong>moya矩阵</strong>
            <span>{theme === 'dark' ? '暗夜模式' : '白天模式'}</span>
          </div>
        </NavLink>
        {showShell && isEditorRoute ? (
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
  const productVideoScenarios = [
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
              to={`/editor?workflow=viral&scenario=${scenario.key}`}
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
