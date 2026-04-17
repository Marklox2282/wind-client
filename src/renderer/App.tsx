import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Home } from './pages/Home';
import { Mods } from './pages/Mods';
import { Settings } from './pages/Settings';
import { News } from './pages/News';
import { Instances } from './pages/Instances';
import { useThemeEffect } from './hooks/useThemeEffect';
import { RealElectronOAuthService } from './services/realElectronOAuthService';
import { CloudBackdrop } from './components/CloudBackdrop';
import { DEFAULT_BOOT_APPEARANCE, type BootAppearance } from './types/appearance';

function App() {
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appearance, setAppearance] = useState<BootAppearance>(DEFAULT_BOOT_APPEARANCE);

  useThemeEffect();

  useEffect(() => {
    const boot = async () => {
      try {
        if (window.electronAPI) {
          const [savedUser, cloud, title, tag] = await Promise.all([
            window.electronAPI.store.get('currentUser'),
            window.electronAPI.store.get('settings.cloudAccentColor'),
            window.electronAPI.store.get('settings.loadingScreenTitle'),
            window.electronAPI.store.get('settings.loadingScreenTagline'),
          ]);
          setCurrentUser(savedUser || null);
          setAppearance({
            cloudAccentColor:
              typeof cloud === 'string' && cloud.trim()
                ? cloud.trim()
                : DEFAULT_BOOT_APPEARANCE.cloudAccentColor,
            loadingScreenTitle:
              typeof title === 'string' && title.trim()
                ? title.trim()
                : DEFAULT_BOOT_APPEARANCE.loadingScreenTitle,
            loadingScreenTagline:
              typeof tag === 'string' && tag.trim()
                ? tag.trim()
                : DEFAULT_BOOT_APPEARANCE.loadingScreenTagline,
          });
        } else {
          setCurrentUser(localStorage.getItem('currentUser'));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    boot();
  }, []);

  const handleLogin = (
    username: string,
    uuid?: string,
    accessToken?: string,
    refreshToken?: string
  ) => {
    setCurrentUser(username);
    if (window.electronAPI) {
      window.electronAPI.store.set('currentUser', username);
      if (uuid) window.electronAPI.store.set('userUuid', uuid);
      if (accessToken) window.electronAPI.store.set('accessToken', accessToken);
      if (refreshToken) window.electronAPI.store.set('refreshToken', refreshToken);
    } else {
      localStorage.setItem('currentUser', username);
      if (uuid) localStorage.setItem('userUuid', uuid);
    }
  };

  const handleLogout = async () => {
    setCurrentUser(null);
    if (window.electronAPI) {
      // Remove only auth-related keys so things like theme / instances stay.
      await Promise.all([
        window.electronAPI.store.delete('currentUser'),
        window.electronAPI.store.delete('userUuid'),
        window.electronAPI.store.delete('accessToken'),
        window.electronAPI.store.delete('refreshToken'),
      ]);
    } else {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('userUuid');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
    // Wipe the embedded Microsoft login cookies/storage so the next sign-in
    // shows the account picker instead of re-using the previous account.
    await RealElectronOAuthService.signOut();
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center surface-0 text-ink-900 dark:text-ink-0 relative overflow-hidden">
        <CloudBackdrop color={appearance.cloudAccentColor} />
        <div className="grid-noise absolute inset-0 pointer-events-none opacity-50" />
        <div className="relative z-10 flex flex-col items-center gap-4 text-center px-8 animate-fade-in">
          <div className="text-lg font-semibold tracking-tight">{appearance.loadingScreenTitle}</div>
          <div
            className="w-7 h-7 rounded-full border-2 border-ink-300 dark:border-ink-700 animate-spin"
            style={{
              borderTopColor: appearance.cloudAccentColor,
            }}
          />
          <div className="caption">{appearance.loadingScreenTagline}</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} appearance={appearance} />;
  }

  return (
    <div className="h-screen w-screen overflow-hidden">
      <Layout currentUser={currentUser} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Home currentUser={currentUser} />} />
          <Route path="/instances" element={<Instances />} />
          <Route path="/mods" element={<Mods />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/news" element={<News />} />
          <Route path="/login" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </div>
  );
}

export default App;
