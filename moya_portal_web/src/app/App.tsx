import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Cloud, Clapperboard, Download, Home, LogOut, Moon, Settings, Sun } from 'lucide-react';
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
  return (
    <section className="page home-page">
      <div className="home-panel">
        <img src={moyaMatrixLogo} alt="moya矩阵" />
        <div>
          <h1>moya矩阵</h1>
          <p>一站式编、拍、剪、投、管的智能内容工作台。</p>
        </div>
        <NavLink to="/editor" className="home-workbench-action">
          <Clapperboard size={17} />
          <span>进入主工作台</span>
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
