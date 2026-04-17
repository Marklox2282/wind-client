import React, { useEffect, useState } from 'react';
import { useThemeStore } from '../store/useThemeStore';
import { DEFAULT_BOOT_APPEARANCE } from '../types/appearance';

const DEFAULT_CLOUD = DEFAULT_BOOT_APPEARANCE.cloudAccentColor;
const DEFAULT_LOAD_TITLE = DEFAULT_BOOT_APPEARANCE.loadingScreenTitle;
const DEFAULT_LOAD_TAGLINE = DEFAULT_BOOT_APPEARANCE.loadingScreenTagline;

export const Settings: React.FC = () => {
  const { theme, setTheme } = useThemeStore();
  const [ram, setRam] = useState(4);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [startMaximized, setStartMaximized] = useState(false);
  const [discordRpc, setDiscordRpc] = useState(false);
  const [resolution, setResolution] = useState('1280x720');
  const [language, setLanguage] = useState<'en' | 'ru'>('en');
  const [cloudAccentColor, setCloudAccentColor] = useState(DEFAULT_CLOUD);
  const [loadingScreenTitle, setLoadingScreenTitle] = useState(DEFAULT_LOAD_TITLE);
  const [loadingScreenTagline, setLoadingScreenTagline] = useState(DEFAULT_LOAD_TAGLINE);
  const [updateCheckBusy, setUpdateCheckBusy] = useState(false);
  const [updateCheckHint, setUpdateCheckHint] = useState<string | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    (async () => {
      const [au, sm, cloud, lt, lg] = await Promise.all([
        window.electronAPI.store.get('settings.autoUpdate'),
        window.electronAPI.store.get('settings.startMaximized'),
        window.electronAPI.store.get('settings.cloudAccentColor'),
        window.electronAPI.store.get('settings.loadingScreenTitle'),
        window.electronAPI.store.get('settings.loadingScreenTagline'),
      ]);
      if (typeof au === 'boolean') setAutoUpdate(au);
      if (typeof sm === 'boolean') setStartMaximized(sm);
      if (typeof cloud === 'string' && cloud.trim()) setCloudAccentColor(cloud.trim());
      if (typeof lt === 'string' && lt.trim()) setLoadingScreenTitle(lt.trim());
      if (typeof lg === 'string' && lg.trim()) setLoadingScreenTagline(lg.trim());
    })();
  }, []);

  const persist = (key: string, value: unknown) => {
    if (window.electronAPI) void window.electronAPI.store.set(key, value);
  };

  const handleCheckUpdates = async () => {
    if (!window.electronAPI?.updater) return;
    setUpdateCheckBusy(true);
    setUpdateCheckHint(null);
    try {
      const r = await window.electronAPI.updater.checkForUpdates();
      if (r.reason === 'dev') {
        setUpdateCheckHint('Updates run only in packaged builds (or WIND_FORCE_UPDATER=1 in dev).');
      } else if (!r.ok) {
        setUpdateCheckHint(r.error || 'Check failed');
      } else if (r.isUpdateAvailable) {
        setUpdateCheckHint(`Update ${r.updateInfo?.version ?? ''} found — downloading…`);
      } else {
        setUpdateCheckHint('You are on the latest version.');
      }
    } catch (e) {
      setUpdateCheckHint(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setUpdateCheckBusy(false);
    }
  };

  return (
    <div className="h-full p-10 overflow-auto">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10">
          <div className="caption mb-2">Settings</div>
          <h1 className="text-2xl font-semibold tracking-tight">Preferences</h1>
        </div>

        <Section title="Appearance">
          <Row label="Theme" desc="Switch between light and dark UI">
            <div className="flex gap-1 p-1 rounded-lg hairline">
              {(['light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`h-7 px-3 text-xs font-medium rounded-md transition-colors ${
                    theme === t
                      ? 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000'
                      : 'text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0'
                  }`}
                >
                  {t === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
          </Row>
          <Row
            label="Cloud tint"
            desc="Color for decorative clouds on the sign-in screen and boot splash"
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(cloudAccentColor) ? cloudAccentColor : DEFAULT_CLOUD}
                onChange={(e) => {
                  const v = e.target.value;
                  setCloudAccentColor(v);
                  persist('settings.cloudAccentColor', v);
                }}
                className="h-8 w-12 rounded cursor-pointer border-0 bg-transparent"
              />
              <input
                type="text"
                value={cloudAccentColor}
                onChange={(e) => setCloudAccentColor(e.target.value)}
                onBlur={() => persist('settings.cloudAccentColor', cloudAccentColor || DEFAULT_CLOUD)}
                className="input h-8 w-28 text-xs font-mono"
                placeholder={DEFAULT_CLOUD}
              />
            </div>
          </Row>
          <Row label="Boot title" desc="Shown above the spinner while the launcher loads">
            <input
              type="text"
              value={loadingScreenTitle}
              onChange={(e) => setLoadingScreenTitle(e.target.value)}
              onBlur={() =>
                persist('settings.loadingScreenTitle', loadingScreenTitle.trim() || DEFAULT_LOAD_TITLE)
              }
              className="input h-8 w-56 text-xs"
              maxLength={48}
            />
          </Row>
          <Row label="Boot subtitle" desc="Line under the title during startup">
            <input
              type="text"
              value={loadingScreenTagline}
              onChange={(e) => setLoadingScreenTagline(e.target.value)}
              onBlur={() =>
                persist(
                  'settings.loadingScreenTagline',
                  loadingScreenTagline.trim() || DEFAULT_LOAD_TAGLINE
                )
              }
              className="input h-8 w-56 text-xs"
              maxLength={64}
            />
          </Row>
          <Row label="Language" desc="UI language">
            <Select
              value={language}
              onChange={(v) => setLanguage(v as 'en' | 'ru')}
              options={[
                { value: 'en', label: 'English' },
                { value: 'ru', label: 'Russian' },
              ]}
            />
          </Row>
        </Section>

        <Section title="Minecraft">
          <Row label="Memory" desc={`${ram} GB RAM allocated to the game`}>
            <div className="flex items-center gap-3 w-56">
              <input
                type="range"
                min={1}
                max={16}
                value={ram}
                onChange={(e) => setRam(Number(e.target.value))}
                className="flex-1 accent-ink-1000 dark:accent-ink-0"
              />
              <span className="text-xs font-mono w-12 text-right">{ram} GB</span>
            </div>
          </Row>
          <Row label="Window size" desc="Default resolution">
            <Select
              value={resolution}
              onChange={setResolution}
              options={[
                { value: '854x480', label: '854 × 480' },
                { value: '1280x720', label: '1280 × 720' },
                { value: '1920x1080', label: '1920 × 1080' },
                { value: '2560x1440', label: '2560 × 1440' },
              ]}
            />
          </Row>
        </Section>

        <Section title="General">
          <Row label="Start maximized" desc="Open the launcher maximized">
            <Toggle
              value={startMaximized}
              onChange={(v) => {
                setStartMaximized(v);
                persist('settings.startMaximized', v);
              }}
            />
          </Row>
          <Row label="Auto-update" desc="Periodically check GitHub Releases for a newer build">
            <Toggle
              value={autoUpdate}
              onChange={(v) => {
                setAutoUpdate(v);
                persist('settings.autoUpdate', v);
              }}
            />
          </Row>
          <Row label="Check now" desc="Query the update server once (uses your packaged feed)">
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={updateCheckBusy}
                className="btn-secondary h-8 px-3 text-xs disabled:opacity-50"
              >
                {updateCheckBusy ? 'Checking…' : 'Check for updates'}
              </button>
              {updateCheckHint && (
                <div className="text-[11px] text-ink-500 dark:text-ink-400 max-w-[220px] text-right">
                  {updateCheckHint}
                </div>
              )}
            </div>
          </Row>
          <Row label="Discord RPC" desc="Show status in Discord">
            <Toggle value={discordRpc} onChange={setDiscordRpc} />
          </Row>
        </Section>
      </div>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-10">
    <div className="caption mb-3">{title}</div>
    <div className="panel divide-y divide-ink-200 dark:divide-ink-800">{children}</div>
  </section>
);

const Row: React.FC<{ label: string; desc?: string; children: React.ReactNode }> = ({
  label,
  desc,
  children,
}) => (
  <div className="flex items-center justify-between px-4 py-3.5 gap-6">
    <div className="min-w-0">
      <div className="text-sm font-medium">{label}</div>
      {desc && <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{desc}</div>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <button
    onClick={() => onChange(!value)}
    className={`relative w-10 h-6 rounded-full transition-colors ${
      value ? 'bg-ink-1000 dark:bg-ink-0' : 'surface-2 hairline'
    }`}
  >
    <span
      className={`absolute top-0.5 w-5 h-5 rounded-full transition-all shadow-sm ${
        value
          ? 'left-[18px] bg-ink-0 dark:bg-ink-1000'
          : 'left-0.5 bg-ink-500 dark:bg-ink-400'
      }`}
    />
  </button>
);

const Select: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}> = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="input h-8 w-48 text-xs"
  >
    {options.map((o) => (
      <option key={o.value} value={o.value} className="bg-ink-0 dark:bg-ink-900">
        {o.label}
      </option>
    ))}
  </select>
);
