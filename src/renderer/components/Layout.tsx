import React, { useEffect, useState } from 'react';
import { Home, Package, Newspaper, Settings, Gamepad2, LogOut } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
import { LaunchStatusBar } from './LaunchStatusBar';

interface LayoutProps {
  children: React.ReactNode;
  currentUser?: string | null;
  onLogout?: () => void;
}

const nav = [
  { id: 'home', label: 'Home', icon: Home, path: '/' },
  { id: 'instances', label: 'Instances', icon: Gamepad2, path: '/instances' },
  { id: 'mods', label: 'Mods', icon: Package, path: '/mods' },
  { id: 'news', label: 'News', icon: Newspaper, path: '/news' },
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
];

export const Layout: React.FC<LayoutProps> = ({ children, currentUser, onLogout }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    if (!window.electronAPI?.app) return;
    window.electronAPI.app.getVersion().then(setAppVersion).catch(() => setAppVersion(''));
  }, []);

  const initials = (currentUser || '?')
    .split(/[\s_-]/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="h-full w-full flex flex-col surface-0 text-ink-900 dark:text-ink-0">
      {/* Title bar */}
      <div className="title-bar drag">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-[5px] bg-ink-1000 dark:bg-ink-0 flex items-center justify-center">
            <span className="text-[10px] font-bold text-ink-0 dark:text-ink-1000">W</span>
          </div>
          <span className="text-xs font-medium tracking-wide">Wind Client</span>
        </div>
        <div className="flex items-center gap-1 no-drag">
          <ThemeToggle />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-[220px] hairline-r flex flex-col surface-0">
          {/* Profile */}
          <div className="p-4 hairline-b">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-ink-1000 dark:bg-ink-0 text-ink-0 dark:text-ink-1000 flex items-center justify-center text-xs font-semibold">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{currentUser || 'Guest'}</div>
                <div className="caption mt-0.5">Online</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {nav.map((item) => {
              const Icon = item.icon;
              const active = location.pathname === item.path;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.path)}
                  className={`nav-item ${active ? 'active' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 hairline-t">
            <button onClick={onLogout} className="nav-item">
              <LogOut className="w-4 h-4" />
              <span>Sign out</span>
            </button>
            <div className="caption mt-3 px-3">{appVersion ? `v${appVersion}` : ''}</div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden surface-0 relative">
          <LaunchStatusBar />
          <div className="flex-1 overflow-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};
