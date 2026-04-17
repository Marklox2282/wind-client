import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  ChevronDown,
  Plus,
  ArrowRight,
  Package,
  Sparkles,
  Clock,
  Cpu,
} from 'lucide-react';
import {
  MinecraftLauncherService,
  LauncherProgress,
  LauncherStatus,
  LaunchOptions,
  MinecraftVersion,
} from '../services/minecraftLauncherService';
import { InstanceService, MinecraftInstance } from '../services/instanceService';

interface HomeProps {
  currentUser: string;
}

const STATUS_LABEL: Record<LauncherStatus, string> = {
  idle: 'Ready',
  preparing: 'Preparing',
  libraries: 'Downloading libraries',
  assets: 'Downloading assets',
  launching: 'Launching',
  running: 'Running',
};

export const Home: React.FC<HomeProps> = ({ currentUser }) => {
  const navigate = useNavigate();

  const [versions, setVersions] = useState<MinecraftVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('1.20.1');
  const [showPicker, setShowPicker] = useState(false);
  const [onlyReleases, setOnlyReleases] = useState(true);

  const [instances, setInstances] = useState<MinecraftInstance[]>([]);

  const [status, setStatus] = useState<LauncherStatus>('idle');
  const [progress, setProgress] = useState<LauncherProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [v, s, ins] = await Promise.all([
        MinecraftLauncherService.getAvailableVersions(),
        MinecraftLauncherService.getStatus(),
        InstanceService.getInstances(),
      ]);
      setVersions(v);
      setStatus(s.status);
      setInstances(ins);
      if (s.versionId) setSelectedVersion(s.versionId);
    })();

    const offProgress = MinecraftLauncherService.onProgress((p) => setProgress(p));
    const offStatus = MinecraftLauncherService.onStatusChanged((s) => {
      setStatus(s.status);
      if (s.status === 'idle') setProgress(null);
    });
    const offExit = MinecraftLauncherService.onExit(() => setProgress(null));

    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };
    window.addEventListener('mousedown', onClick);

    return () => {
      offProgress();
      offStatus();
      offExit();
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const busy = status !== 'idle' && status !== 'running';
  const running = status === 'running';

  const releases = useMemo(
    () => versions.filter((v) => (onlyReleases ? v.type === 'release' : true)).slice(0, 80),
    [versions, onlyReleases]
  );

  const percent = progress?.percent ?? (running ? 100 : 0);
  const statusText = busy || running ? STATUS_LABEL[status] : 'Ready';
  const substatus = useMemo(() => {
    if (running) return 'Minecraft session in progress';
    if (!progress) return `Quick play · vanilla ${selectedVersion}`;
    if (progress.current != null && progress.total != null) {
      return `${progress.stage} · ${progress.current} / ${progress.total}`;
    }
    return progress.stage;
  }, [progress, running, selectedVersion]);

  const lastPlayed = useMemo(() => {
    return [...instances]
      .filter((i) => i.lastPlayed)
      .sort((a, b) =>
        new Date(b.lastPlayed || 0).getTime() - new Date(a.lastPlayed || 0).getTime()
      )[0];
  }, [instances]);

  const handleQuickPlay = async () => {
    setError(null);
    if (running) {
      await MinecraftLauncherService.stop();
      return;
    }
    if (!selectedVersion || busy) return;

    let userUuid = '';
    let accessToken = '';
    if (window.electronAPI) {
      userUuid = (await window.electronAPI.store.get('userUuid')) || '';
      accessToken = (await window.electronAPI.store.get('accessToken')) || '';
    }
    const opts: LaunchOptions = {
      versionId: selectedVersion,
      username: currentUser,
      uuid: userUuid || '00000000-0000-0000-0000-000000000000',
      accessToken: accessToken || 'offline-token',
      minMemory: 1024,
      maxMemory: 4096,
      width: 1280,
      height: 720,
    };
    try {
      await MinecraftLauncherService.launchMinecraft(opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleLaunchInstance = async (id: string) => {
    setError(null);
    try {
      await InstanceService.launchInstance(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const formatLastPlayed = (d?: string) => {
    if (!d) return 'never';
    const ms = Date.now() - new Date(d).getTime();
    const h = Math.floor(ms / 3600000);
    const dd = Math.floor(h / 24);
    if (dd > 0) return `${dd}d ago`;
    if (h > 0) return `${h}h ago`;
    return 'just now';
  };

  return (
    <div className="h-full w-full overflow-auto surface-0">
      <div className="max-w-6xl mx-auto px-10 py-10 space-y-8">
        {/* Top strip — status + identity */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className={`w-2 h-2 rounded-full ${statusDotClass(status)}`} />
              <span className="caption">{statusText}</span>
              {(busy || running) && (
                <span className="caption text-ink-1000 dark:text-ink-0">
                  {busy ? `${Math.floor(percent)}%` : 'live'}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Welcome back,{' '}
              <span className="text-ink-500 dark:text-ink-400">{currentUser}</span>
            </h1>
          </div>
          <div className="caption">Wind Client · v1.0.0</div>
        </div>

        {/* HERO — Quick Play */}
        <section className="relative overflow-hidden rounded-2xl hairline surface-1">
          <div className="absolute inset-0 grid-noise pointer-events-none opacity-60" />
          <div className="relative p-8">
            {/* Top row: label + version picker */}
            <div className="flex items-center justify-between mb-6">
              <div className="caption">Quick play</div>
              <div className="relative" ref={pickerRef}>
                <button
                  onClick={() => !busy && setShowPicker((v) => !v)}
                  disabled={busy}
                  className="flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-mono surface-0 hairline hover:surface-2 disabled:opacity-50 transition"
                >
                  <span>Minecraft {selectedVersion}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>

                {showPicker && (
                  <div className="absolute right-0 mt-2 w-72 surface-0 hairline rounded-lg shadow-2xl z-30 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 hairline-b">
                      <span className="caption">Version</span>
                      <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={onlyReleases}
                          onChange={(e) => setOnlyReleases(e.target.checked)}
                          className="accent-ink-900 dark:accent-ink-0"
                        />
                        <span className="text-ink-500 dark:text-ink-400">Releases only</span>
                      </label>
                    </div>
                    <div className="max-h-80 overflow-y-auto py-1">
                      {releases.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setSelectedVersion(v.id);
                            setShowPicker(false);
                          }}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:surface-2 transition-colors ${
                            v.id === selectedVersion ? 'surface-2' : ''
                          }`}
                        >
                          <span className="font-mono">{v.id}</span>
                          <span className="caption">{v.type}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Big horizontal launch slab */}
            <button
              onClick={handleQuickPlay}
              disabled={busy && !running}
              className={`relative w-full h-24 rounded-xl overflow-hidden transition-all active:scale-[0.997] focus:outline-none focus:ring-2 focus:ring-ink-1000 dark:focus:ring-ink-0 ring-offset-2 ring-offset-ink-0 dark:ring-offset-ink-900 disabled:cursor-not-allowed ${
                running
                  ? 'bg-ink-900 text-ink-0 dark:bg-ink-100 dark:text-ink-1000'
                  : busy
                  ? 'surface-2'
                  : 'bg-ink-1000 text-ink-0 dark:bg-ink-0 dark:text-ink-1000 hover:brightness-110'
              }`}
            >
              {/* Progress fill overlay when busy */}
              {busy && (
                <div
                  className="absolute inset-y-0 left-0 bg-ink-1000 dark:bg-ink-0 transition-[width] duration-300"
                  style={{ width: `${percent}%` }}
                />
              )}

              <div className="relative z-10 h-full px-8 flex items-center justify-between">
                <div className="flex items-center gap-5">
                  <div
                    className={`w-14 h-14 rounded-lg flex items-center justify-center ${
                      running
                        ? 'bg-ink-0 text-ink-1000 dark:bg-ink-1000 dark:text-ink-0'
                        : busy
                        ? 'surface-0 text-ink-500'
                        : 'bg-ink-0/10 text-current'
                    }`}
                  >
                    {running ? (
                      <Square className="w-6 h-6" fill="currentColor" />
                    ) : busy ? (
                      <span className="font-mono text-sm">{Math.floor(percent)}%</span>
                    ) : (
                      <Play className="w-7 h-7 ml-0.5" fill="currentColor" />
                    )}
                  </div>
                  <div className="text-left">
                    <div className="text-2xl font-semibold tracking-tight">
                      {running ? 'Stop' : busy ? 'Working…' : 'Play'}
                    </div>
                    <div className={`text-xs mt-1 ${busy ? 'text-ink-500' : 'opacity-70'}`}>
                      {substatus}
                    </div>
                  </div>
                </div>

                {!busy && !running && (
                  <ArrowRight className="w-5 h-5 opacity-60" />
                )}
              </div>
            </button>

            {/* Secondary progress strip */}
            <div className="mt-4 h-[2px] rounded-full overflow-hidden surface-2">
              <div
                className="h-full bg-ink-1000 dark:bg-ink-0 transition-all duration-300"
                style={{ width: `${busy ? percent : running ? 100 : 0}%` }}
              />
            </div>

            {error && (
              <div className="mt-4 text-xs hairline surface-0 rounded-lg px-3 py-2 text-ink-1000 dark:text-ink-0">
                {error}
              </div>
            )}

            {/* Meta row */}
            <div className="mt-8 grid grid-cols-4 gap-6">
              <Meta icon={<Cpu className="w-3.5 h-3.5" />} label="Memory" value="1024 – 4096 MB" />
              <Meta icon={<Package className="w-3.5 h-3.5" />} label="Resolution" value="1280 × 720" />
              <Meta
                icon={<Clock className="w-3.5 h-3.5" />}
                label="Last played"
                value={lastPlayed ? lastPlayed.name : '—'}
              />
              <Meta icon={<Sparkles className="w-3.5 h-3.5" />} label="Account" value={currentUser} />
            </div>
          </div>
        </section>

        {/* INSTANCES */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="caption">Your instances</div>
            <button
              onClick={() => navigate('/instances')}
              className="text-xs text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 transition-colors flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {instances.length === 0 ? (
            <button
              onClick={() => navigate('/instances')}
              className="w-full panel p-6 flex items-center justify-center gap-3 hover:surface-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Create your first instance</span>
            </button>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {instances.slice(0, 7).map((i) => (
                <InstanceTile
                  key={i.id}
                  instance={i}
                  busy={busy || running}
                  onLaunch={() => handleLaunchInstance(i.id)}
                  formatLastPlayed={formatLastPlayed}
                />
              ))}
              <button
                onClick={() => navigate('/instances')}
                className="panel p-4 flex flex-col items-center justify-center text-ink-500 hover:text-ink-1000 dark:hover:text-ink-0 hover:surface-2 transition-colors min-h-[92px]"
              >
                <Plus className="w-5 h-5 mb-1" />
                <span className="text-xs font-medium">New instance</span>
              </button>
            </div>
          )}
        </section>

        {/* RECENT */}
        <section>
          <div className="caption mb-4">Activity</div>
          <div className="panel divide-y divide-ink-200 dark:divide-ink-800">
            {instances.length === 0 ? (
              <div className="px-4 py-6 text-sm text-ink-500 dark:text-ink-400">
                No activity yet. Create an instance or press Play to get started.
              </div>
            ) : (
              [...instances]
                .filter((i) => i.lastPlayed)
                .sort(
                  (a, b) =>
                    new Date(b.lastPlayed || 0).getTime() -
                    new Date(a.lastPlayed || 0).getTime()
                )
                .slice(0, 5)
                .map((i) => (
                  <div key={i.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="w-8 h-8 rounded-md surface-2 flex items-center justify-center text-ink-500">
                      <Play className="w-3 h-3" fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{i.name}</div>
                      <div className="caption normal-case tracking-normal font-mono mt-0.5">
                        {i.version} · {i.modLoader}
                      </div>
                    </div>
                    <div className="caption">{formatLastPlayed(i.lastPlayed)}</div>
                  </div>
                ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const statusDotClass = (s: LauncherStatus): string => {
  switch (s) {
    case 'running':
      return 'bg-ink-1000 dark:bg-ink-0 animate-pulse';
    case 'idle':
      return 'bg-ink-400 dark:bg-ink-600';
    default:
      return 'bg-ink-900 dark:bg-ink-200 animate-pulse';
  }
};

const Meta: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div>
    <div className="flex items-center gap-1.5 caption mb-1.5">
      <span className="opacity-70">{icon}</span>
      <span>{label}</span>
    </div>
    <div className="text-sm font-medium truncate">{value}</div>
  </div>
);

const InstanceTile: React.FC<{
  instance: MinecraftInstance;
  busy: boolean;
  onLaunch: () => void;
  formatLastPlayed: (d?: string) => string;
}> = ({ instance, busy, onLaunch, formatLastPlayed }) => (
  <button
    onClick={onLaunch}
    disabled={busy}
    className="group relative panel p-4 text-left hover:surface-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="text-sm font-medium line-clamp-2 tracking-tight">{instance.name}</div>
      <span className="badge">{instance.modLoader}</span>
    </div>
    <div className="caption normal-case tracking-normal font-mono mb-3">
      {instance.version}
    </div>
    <div className="flex items-center justify-between">
      <span className="caption">{formatLastPlayed(instance.lastPlayed)}</span>
      <span className="w-6 h-6 rounded-md surface-2 group-hover:bg-ink-1000 group-hover:text-ink-0 dark:group-hover:bg-ink-0 dark:group-hover:text-ink-1000 flex items-center justify-center transition-colors">
        <Play className="w-3 h-3" fill="currentColor" />
      </span>
    </div>
  </button>
);
