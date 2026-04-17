import React, { useState } from 'react';
import { User, LogIn } from 'lucide-react';
import { RealElectronOAuthService } from '../services/realElectronOAuthService';
import { CloudBackdrop } from '../components/CloudBackdrop';
import type { BootAppearance } from '../types/appearance';

interface LoginProps {
  onLogin: (username: string, uuid?: string, accessToken?: string, refreshToken?: string) => void;
  appearance: BootAppearance;
}

export const Login: React.FC<LoginProps> = ({ onLogin, appearance }) => {
  const [tab, setTab] = useState<'microsoft' | 'offline'>('microsoft');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMicrosoft = async (forceSwitch = false) => {
    setLoading(true);
    setError(null);
    try {
      if (forceSwitch) {
        // Force-wipe the embedded login session so the account picker shows up
        // even if the user previously signed in without logging out.
        await RealElectronOAuthService.signOut();
      }
      const r = await RealElectronOAuthService.authenticate({ forceAccountPicker: true });
      onLogin(r.username, r.uuid, r.accessToken, r.refreshToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleOffline = async () => {
    if (!username.trim()) return;
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username.trim())) {
      setError('Username must be 3–16 chars: letters, numbers, underscore');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await RealElectronOAuthService.authenticateOffline(username.trim());
      onLogin(r.username, r.uuid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create offline profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center surface-0 text-ink-900 dark:text-ink-0 relative overflow-hidden">
      <CloudBackdrop color={appearance.cloudAccentColor} />
      <div className="grid-noise absolute inset-0 pointer-events-none opacity-60" />
      <div className="relative z-10 w-full max-w-sm px-8 animate-fade-in">
        {/* Brand */}
        <div className="mb-10 text-center">
          <div className="inline-flex w-10 h-10 rounded-lg bg-ink-1000 dark:bg-ink-0 items-center justify-center mb-4">
            <span className="text-sm font-bold text-ink-0 dark:text-ink-1000">W</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{appearance.loadingScreenTitle}</h1>
          <p className="caption mt-2">Minecraft Launcher</p>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 p-1 rounded-lg surface-1 hairline mb-6">
          {(['microsoft', 'offline'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 text-xs font-medium rounded-md transition-colors ${
                tab === t
                  ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                  : 'text-ink-500 hover:text-ink-900 dark:hover:text-ink-0'
              }`}
            >
              {t === 'microsoft' ? 'Microsoft' : 'Offline'}
            </button>
          ))}
        </div>

        {/* Body */}
        {tab === 'microsoft' ? (
          <div>
            <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
              Sign in with your Microsoft account to play Minecraft online.
            </p>
            <button
              onClick={() => handleMicrosoft(false)}
              disabled={loading}
              className="btn-primary w-full h-10 text-sm disabled:opacity-50"
            >
              {loading ? (
                <span className="w-3 h-3 rounded-full border border-current border-t-transparent animate-spin" />
              ) : (
                <LogIn className="w-4 h-4" />
              )}
              {loading ? 'Connecting…' : 'Sign in with Microsoft'}
            </button>

            <button
              type="button"
              onClick={() => handleMicrosoft(true)}
              disabled={loading}
              className="mt-3 w-full text-center text-xs text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 transition-colors disabled:opacity-50"
            >
              Use a different account
            </button>
          </div>
        ) : (
          <div>
            <label className="caption block mb-2">Username</label>
            <div className="relative mb-4">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleOffline()}
                placeholder="Player"
                className="input pl-9"
              />
            </div>
            <button
              onClick={handleOffline}
              disabled={loading || !username.trim()}
              className="btn-primary w-full h-10 text-sm disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Continue'}
            </button>
            <p className="caption mt-4 text-center">No internet required</p>
          </div>
        )}

        {error && (
          <div className="mt-4 text-xs hairline surface-1 rounded-lg px-3 py-2 text-ink-1000 dark:text-ink-0">
            {error}
          </div>
        )}

        <div className="caption text-center mt-8">v1.0.0</div>
      </div>
    </div>
  );
};
