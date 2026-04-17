import { ipcMain } from 'electron';
import Store from 'electron-store';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getMinecraftLauncher } from './minecraftLauncher';

/**
 * CurseForge Core API v1 integration.
 *
 * Requires an API key (free at https://console.curseforge.com). We read it from:
 *   1. `process.env.CURSEFORGE_API_KEY`            (build-time / env)
 *   2. electron-store key `settings.curseforgeApiKey` (user-provided via UI)
 *
 * If no key is configured, all handlers throw a descriptive error that the
 * renderer displays as a banner with instructions — Modrinth keeps working
 * regardless.
 */

const BASE = 'https://api.curseforge.com/v1';
const UA = 'wind-client/1.0.0 (minecraft launcher)';

// CurseForge class IDs for Minecraft category tree.
// Reference: https://docs.curseforge.com/rest-api/#get-categories (game 432).
const GAME_ID_MINECRAFT = 432;
const CLASS_MOD = 6;
const CLASS_RESOURCEPACK = 12;
const CLASS_SHADER = 6552;

type Kind = 'mod' | 'shader' | 'resourcepack';

const CLASS_ID: Record<Kind, number> = {
  mod: CLASS_MOD,
  shader: CLASS_SHADER,
  resourcepack: CLASS_RESOURCEPACK,
};

const CONTENT_FOLDER: Record<Kind, string> = {
  mod: 'mods',
  shader: 'shaderpacks',
  resourcepack: 'resourcepacks',
};

// ModLoaderType enum from the CF API spec.
const MOD_LOADER_TYPE: Record<string, number> = {
  forge: 1,
  cauldron: 2,
  liteloader: 3,
  fabric: 4,
  quilt: 5,
  neoforge: 6,
};

type InstanceLike = {
  id: string;
  gameDir: string;
  modLoader?: string;
  version: string;
};

const store = new Store<any>();

function getApiKey(): string | null {
  const fromEnv = process.env.CURSEFORGE_API_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const settings = (store.get('settings') as any) || {};
  const fromStore = settings.curseforgeApiKey;
  if (typeof fromStore === 'string' && fromStore.trim()) return fromStore.trim();
  return null;
}

async function cfApi<T>(path: string, init?: RequestInit): Promise<T> {
  const key = getApiKey();
  if (!key) {
    throw new Error(
      'CurseForge API key not configured. Add one in Settings → CurseForge (free key from console.curseforge.com).'
    );
  }
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'User-Agent': UA,
      'x-api-key': key,
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    // Treat auth failures as "no key configured" so the renderer flips back
    // to the key-input screen instead of showing a raw 403 every search.
    if (res.status === 401 || res.status === 403) {
      const settings = (store.get('settings') as any) || {};
      if (settings.curseforgeApiKey) {
        store.set('settings', { ...settings, curseforgeApiKey: undefined });
      }
      throw new Error(
        'CurseForge API key missing or invalid. Generate a new one at console.curseforge.com/#/api-keys and paste it again.'
      );
    }
    throw new Error(
      `CurseForge ${res.status}: ${await res.text().catch(() => res.statusText)}`
    );
  }
  return (await res.json()) as T;
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) throw new Error(`Download failed ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
}

export function setupCurseForgeHandlers(getInstance: (id: string) => InstanceLike | null): void {
  ipcMain.handle('curseforge:hasKey', () => {
    const key = getApiKey();
    if (!key) return { hasKey: false, preview: null, length: 0 };
    const preview =
      key.length > 12 ? `${key.slice(0, 6)}…${key.slice(-4)}` : `${key.slice(0, 3)}…`;
    return { hasKey: true, preview, length: key.length };
  });

  ipcMain.handle('curseforge:setKey', async (_e, key: string) => {
    const trimmed = (key || '').trim();
    if (!trimmed) {
      // Explicit clear
      const settings = (store.get('settings') as any) || {};
      store.set('settings', { ...settings, curseforgeApiKey: undefined });
      return { success: true, hasKey: false };
    }

    // Validate the key against a cheap endpoint before persisting so the
    // user doesn't end up with a bad key silently saved.
    try {
      const res = await fetch(`${BASE}/games/${GAME_ID_MINECRAFT}`, {
        headers: { 'User-Agent': UA, 'x-api-key': trimmed, Accept: 'application/json' },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => res.statusText);
        throw new Error(
          res.status === 401 || res.status === 403
            ? `Key rejected by CurseForge (HTTP ${res.status}). Double-check you copied the full key without quotes.`
            : `CurseForge validation failed: HTTP ${res.status} — ${body}`
        );
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Could not reach CurseForge to validate key: ${err.message}`);
      }
      throw err;
    }

    const settings = (store.get('settings') as any) || {};
    store.set('settings', { ...settings, curseforgeApiKey: trimmed });
    return { success: true, hasKey: true };
  });

  ipcMain.handle(
    'curseforge:search',
    async (
      _e,
      params: {
        query?: string;
        kind?: Kind;
        loader?: string;
        gameVersion?: string;
        pageSize?: number;
        index?: number;
        sortField?: number;
      }
    ) => {
      const kind: Kind = params.kind || 'mod';
      const qs = new URLSearchParams();
      qs.set('gameId', String(GAME_ID_MINECRAFT));
      qs.set('classId', String(CLASS_ID[kind]));
      qs.set('searchFilter', params.query || '');
      qs.set('pageSize', String(params.pageSize ?? 30));
      qs.set('index', String(params.index ?? 0));
      // 2 = Popularity, 6 = TotalDownloads, 1 = Featured.
      qs.set('sortField', String(params.sortField ?? 2));
      qs.set('sortOrder', 'desc');
      if (params.gameVersion) qs.set('gameVersion', params.gameVersion);
      if (kind === 'mod' && params.loader && params.loader !== 'vanilla') {
        const lt = MOD_LOADER_TYPE[params.loader.toLowerCase()];
        if (lt) qs.set('modLoaderType', String(lt));
      }
      return cfApi<{ data: any[]; pagination: any }>(`/mods/search?${qs.toString()}`);
    }
  );

  ipcMain.handle('curseforge:getMod', async (_e, modId: number) => {
    return cfApi<{ data: any }>(`/mods/${modId}`);
  });

  ipcMain.handle(
    'curseforge:getFiles',
    async (
      _e,
      params: { modId: number; loader?: string; gameVersion?: string; kind?: Kind }
    ) => {
      const qs = new URLSearchParams();
      qs.set('pageSize', '50');
      if (params.gameVersion) qs.set('gameVersion', params.gameVersion);
      if ((params.kind || 'mod') === 'mod' && params.loader && params.loader !== 'vanilla') {
        const lt = MOD_LOADER_TYPE[params.loader.toLowerCase()];
        if (lt) qs.set('modLoaderType', String(lt));
      }
      return cfApi<{ data: any[] }>(`/mods/${params.modId}/files?${qs.toString()}`);
    }
  );

  ipcMain.handle(
    'curseforge:installFile',
    async (
      _e,
      params: { instanceId: string; modId: number; fileId: number; kind?: Kind }
    ) => {
      const instance = getInstance(params.instanceId);
      if (!instance) throw new Error('Instance not found');

      const kind: Kind = params.kind || 'mod';
      const file = await cfApi<{ data: any }>(`/mods/${params.modId}/files/${params.fileId}`);
      const data = file.data;

      // Some authors disable 3rd-party distribution — CF returns null `downloadUrl`.
      // The well-known fallback is edge.forgecdn.net/files/<p1>/<p2>/<filename>
      // where p1 = first 4 digits of id, p2 = next 3 digits (stripped of leading zeros).
      let url: string | null = data.downloadUrl || null;
      if (!url) {
        const idStr = String(data.id);
        if (idStr.length >= 4) {
          const p1 = idStr.slice(0, 4).replace(/^0+/, '') || '0';
          const p2 = idStr.slice(4).replace(/^0+/, '') || '0';
          url = `https://edge.forgecdn.net/files/${p1}/${p2}/${encodeURIComponent(data.fileName)}`;
        }
      }
      if (!url) {
        throw new Error(
          `This mod's author has disabled third-party downloads and no fallback URL was available.`
        );
      }

      const launcher = getMinecraftLauncher();
      const gameDir = launcher.getGameDir(instance.gameDir);
      const destDir = join(gameDir, CONTENT_FOLDER[kind]);
      await mkdir(destDir, { recursive: true });
      const target = join(destDir, data.fileName);

      try {
        await stat(target);
        return { success: true, installed: [{ name: data.fileName, path: target }] };
      } catch {
        /* not present */
      }

      await download(url, target);

      const installed = [{ name: data.fileName, path: target }];

      // Follow required dependencies (relationType 3) — mods only.
      if (kind === 'mod' && Array.isArray(data.dependencies)) {
        for (const dep of data.dependencies) {
          if (dep.relationType !== 3) continue;
          try {
            const filesRes = await cfApi<{ data: any[] }>(
              `/mods/${dep.modId}/files?pageSize=5&gameVersion=${encodeURIComponent(instance.version)}${
                instance.modLoader && MOD_LOADER_TYPE[instance.modLoader]
                  ? `&modLoaderType=${MOD_LOADER_TYPE[instance.modLoader]}`
                  : ''
              }`
            );
            const pick = filesRes.data[0];
            if (!pick) continue;
            const depTarget = join(destDir, pick.fileName);
            try {
              await stat(depTarget);
            } catch {
              const depUrl: string | null =
                pick.downloadUrl ||
                (() => {
                  const idStr = String(pick.id);
                  if (idStr.length < 4) return null;
                  const p1 = idStr.slice(0, 4).replace(/^0+/, '') || '0';
                  const p2 = idStr.slice(4).replace(/^0+/, '') || '0';
                  return `https://edge.forgecdn.net/files/${p1}/${p2}/${encodeURIComponent(pick.fileName)}`;
                })();
              if (depUrl) {
                await download(depUrl, depTarget);
                installed.push({ name: pick.fileName, path: depTarget });
              }
            }
          } catch (err) {
            console.warn('[CurseForge] dependency install failed:', dep, err);
          }
        }
      }

      return { success: true, installed };
    }
  );
}
