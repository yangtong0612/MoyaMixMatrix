import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Cloud, Clapperboard, Download, Moon, Settings, Sun } from 'lucide-react';
import { CloudDrivePage } from '@/features/cloud-drive/CloudDrivePage';
import { EditorPage } from '@/features/editor/EditorPage';
import moyaMatrixLogo from '@/assets/moya-matrix-logo.svg';

const navItems = [
  { to: '/cloud-drive', label: '网盘', icon: Cloud },
  { to: '/editor', label: '剪辑', icon: Clapperboard },
  { to: '/transfers', label: '传输', icon: Download },
  { to: '/settings', label: '设置', icon: Settings }
];

export function App() {
  const location = useLocation();
  const isEditorRoute = location.pathname.startsWith('/editor');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('moya-theme') === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('moya-theme', theme);
    document.documentElement.dataset.theme = theme;
    window.surgicol?.app?.setTitlebarTheme(theme).catch(() => undefined);
  }, [theme]);

  return (
    <div className={`app-window theme-${theme}${isEditorRoute ? ' editor-workbench' : ''}`}>
      <header className="app-titlebar">
        <div className="titlebar-brand">
          <img src={moyaMatrixLogo} alt="moya矩阵" />
          <div>
            <strong>moya矩阵</strong>
            <span>{theme === 'dark' ? '暗夜模式' : '白天模式'}</span>
          </div>
        </div>
        {isEditorRoute ? (
          <nav className="titlebar-nav" aria-label="功能切换">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
                <item.icon size={14} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        ) : null}
        <button className="theme-toggle" type="button" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{theme === 'dark' ? '白天' : '暗夜'}</span>
        </button>
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
            <Route path="/" element={<Navigate to="/cloud-drive" replace />} />
            <Route path="/cloud-drive" element={<CloudDrivePage />} />
            <Route path="/editor" element={<EditorPage />} />
            <Route path="/transfers" element={<CloudDrivePage initialMenu="transport" />} />
            <Route path="/settings" element={<SettingsView />} />
          </Routes>
        </main>
      </div>
    </div>
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
