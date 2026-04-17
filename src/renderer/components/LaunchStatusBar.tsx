import React, { useEffect, useState } from 'react';
import { Square, Loader2 } from 'lucide-react';
import {
  MinecraftLauncherService,
  LauncherProgress,
  LauncherStatus,
} from '../services/minecraftLauncherService';

const STATUS_LABEL: Record<LauncherStatus, string> = {
  idle: 'Ready',
  preparing: 'Preparing',
  libraries: 'Downloading libraries',
  assets: 'Downloading assets',
  launching: 'Launching',
  running: 'Running',
};

/**
 * Thin top-of-page banner that is always mounted in Layout. It subscribes to
 * the launcher event stream and shows live progress while Minecraft is being
 * fetched / launched, and a "Running" indicator with Stop button while the
 * game is live. When status is `idle` the bar collapses to 0 height.
 */
export const LaunchStatusBar: React.FC = () => {
  const [status, setStatus] = useState<LauncherStatus>('idle');
  const [progress, setProgress] = useState<LauncherProgress | null>(null);

  useEffect(() => {
    (async () => {
      const s = await MinecraftLauncherService.getStatus();
      setStatus(s.status);
    })();

    const offStatus = MinecraftLauncherService.onStatusChanged((s) => {
      setStatus(s.status);
      if (s.status === 'idle') setProgress(null);
    });
    const offProgress = MinecraftLauncherService.onProgress((p) => setProgress(p));
    const offExit = MinecraftLauncherService.onExit(() => setProgress(null));

    return () => {
      offStatus();
      offProgress();
      offExit();
    };
  }, []);

  if (status === 'idle') return null;

  const running = status === 'running';
  const percent = progress?.percent ?? (running ? 100 : 0);
  const stage = progress?.stage || STATUS_LABEL[status];
  const sub =
    progress?.current != null && progress?.total != null
      ? `${progress.current} / ${progress.total}`
      : null;

  return (
    <div className="hairline-b surface-1 relative overflow-hidden animate-slide-up">
      {/* Progress fill in the background */}
      {!running && (
        <div
          className="absolute inset-y-0 left-0 bg-ink-1000/10 dark:bg-ink-0/10 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      )}

      <div className="relative z-10 flex items-center gap-4 h-10 px-6">
        {running ? (
          <span className="w-1.5 h-1.5 rounded-full bg-ink-1000 dark:bg-ink-0 animate-pulse" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-500" />
        )}
        <span className="text-xs font-medium text-ink-1000 dark:text-ink-0">{stage}</span>
        {sub && <span className="caption">{sub}</span>}
        {!running && (
          <span className="caption font-mono ml-auto">{Math.floor(percent)}%</span>
        )}
        {running && (
          <>
            <span className="caption ml-auto">Minecraft session</span>
            <button
              onClick={() => MinecraftLauncherService.stop()}
              className="h-6 px-2 rounded-md text-[11px] font-medium hairline hover:surface-2 flex items-center gap-1.5 transition-colors"
            >
              <Square className="w-3 h-3" fill="currentColor" />
              Stop
            </button>
          </>
        )}
      </div>

      {/* Thin progress indicator line at the bottom edge */}
      {!running && (
        <div
          className="absolute bottom-0 left-0 h-[1px] bg-ink-1000 dark:bg-ink-0 transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
};
