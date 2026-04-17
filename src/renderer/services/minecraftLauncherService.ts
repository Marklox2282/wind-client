import type { LauncherProgress, LauncherStatus } from '../electron.d';

export interface MinecraftVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  time: string;
  releaseTime: string;
  url: string;
  mainClass?: string;
}

export interface LaunchOptions {
  versionId: string;
  username: string;
  uuid: string;
  accessToken: string;
  gameDir?: string;
  minMemory?: number;
  maxMemory?: number;
  width?: number;
  height?: number;
  fullscreen?: boolean;
}

export type { LauncherProgress, LauncherStatus };

export class MinecraftLauncherService {
  static async getAvailableVersions(): Promise<MinecraftVersion[]> {
    try {
      if (window.electronAPI) {
        return await window.electronAPI.launcher.getAvailableVersions();
      }
      const r = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
      const m = await r.json();
      return m.versions;
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  static async getInstalledVersions(): Promise<MinecraftVersion[]> {
    try {
      if (window.electronAPI) return await window.electronAPI.launcher.getInstalledVersions();
      return [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  static async launchMinecraft(options: LaunchOptions): Promise<void> {
    if (!window.electronAPI) {
      console.log('Simulated launch:', options);
      return;
    }
    const result = await window.electronAPI.launcher.launchMinecraft(options);
    if (result && result.success === false) {
      throw new Error(result.error || 'Launch failed');
    }
  }

  static async stop(): Promise<boolean> {
    if (!window.electronAPI) return false;
    const r = await window.electronAPI.launcher.stop();
    return r.success;
  }

  static async getStatus(): Promise<{ status: LauncherStatus; versionId: string | null }> {
    if (!window.electronAPI) return { status: 'idle', versionId: null };
    return window.electronAPI.launcher.getStatus();
  }

  static onProgress(cb: (p: LauncherProgress) => void): () => void {
    if (!window.electronAPI) return () => {};
    return window.electronAPI.launcher.onProgress(cb);
  }

  static onStatusChanged(
    cb: (s: { status: LauncherStatus; versionId: string | null }) => void
  ): () => void {
    if (!window.electronAPI) return () => {};
    return window.electronAPI.launcher.onStatusChanged(cb);
  }

  static onExit(cb: (e: { code: number | null; logPath: string }) => void): () => void {
    if (!window.electronAPI) return () => {};
    return window.electronAPI.launcher.onExit(cb);
  }
}
