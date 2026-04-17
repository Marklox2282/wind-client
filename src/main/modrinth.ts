import { ipcMain } from 'electron';
import { createWriteStream } from 'fs';
import { mkdir, readdir, rename, stat, unlink } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { getMinecraftLauncher } from './minecraftLauncher';

const BASE = 'https://api.modrinth.com/v2';
const UA = 'wind-client/1.0.0 (minecraft launcher)';

type InstanceLike = {
  id: string;
  gameDir: string;
  modLoader?: string;
  modLoaderVersion?: string;
  version: string;
};

/**
 * Modrinth `project_type` values we expose to the UI. Each maps to a concrete
 * folder inside the instance (`mods`, `shaderpacks`, `resourcepacks`).
 */
export type ContentKind = 'mod' | 'shader' | 'resourcepack';

const CONTENT_FOLDER: Record<ContentKind, string> = {
  mod: 'mods',
  shader: 'shaderpacks',
  resourcepack: 'resourcepacks',
};

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    throw new Error(`Modrinth ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return (await res.json()) as T;
}

interface SearchParams {
  query?: string;
  loaders?: string[];
  gameVersions?: string[];
  projectType?: ContentKind;
  limit?: number;
  offset?: number;
  index?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
}

function buildSearchQuery(params: SearchParams): string {
  const kind: ContentKind = params.projectType || 'mod';
  const facets: string[][] = [[`project_type:${kind}`]];

  // Shaders and resource packs aren't loader-specific in Modrinth's index.
  if (kind === 'mod' && params.loaders?.length) {
    facets.push(params.loaders.map((l) => `categories:${l}`));
  }
  if (params.gameVersions?.length) {
    facets.push(params.gameVersions.map((v) => `versions:${v}`));
  }

  const qs = new URLSearchParams({
    query: params.query || '',
    facets: JSON.stringify(facets),
    limit: String(params.limit ?? 20),
    offset: String(params.offset ?? 0),
    index: params.index || 'relevance',
  });
  return qs.toString();
}

async function downloadFileTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok || !res.body) {
    throw new Error(`Download failed ${res.status} for ${url}`);
  }
  await pipeline(Readable.fromWeb(res.body as any), createWriteStream(dest));
}

async function resolveContentDir(
  instance: InstanceLike,
  kind: ContentKind
): Promise<string> {
  const launcher = getMinecraftLauncher();
  const gameDir = launcher.getGameDir(instance.gameDir);
  const dir = join(gameDir, CONTENT_FOLDER[kind]);
  await mkdir(dir, { recursive: true });
  return dir;
}

export function setupModrinthHandlers(getInstance: (id: string) => InstanceLike | null): void {
  // ---------- Modrinth proxy ----------

  ipcMain.handle('modrinth:search', async (_e, params: SearchParams) => {
    const qs = buildSearchQuery(params);
    return api(`/search?${qs}`);
  });

  ipcMain.handle('modrinth:getProject', async (_e, id: string) => {
    return api(`/project/${encodeURIComponent(id)}`);
  });

  ipcMain.handle(
    'modrinth:getVersions',
    async (
      _e,
      id: string,
      params: { loaders?: string[]; gameVersions?: string[]; kind?: ContentKind } = {}
    ) => {
      const qs = new URLSearchParams();
      // Resource packs publish under the `minecraft` loader, shaders usually
      // under `iris`/`optifine`/`canvas`. For mods the user-selected loader is
      // forwarded verbatim.
      if (params.loaders?.length && (params.kind || 'mod') === 'mod') {
        qs.set('loaders', JSON.stringify(params.loaders));
      }
      if (params.gameVersions?.length) qs.set('game_versions', JSON.stringify(params.gameVersions));
      return api(`/project/${encodeURIComponent(id)}/version?${qs.toString()}`);
    }
  );

  ipcMain.handle('modrinth:getVersion', async (_e, versionId: string) => {
    return api(`/version/${encodeURIComponent(versionId)}`);
  });

  ipcMain.handle(
    'modrinth:installVersion',
    async (
      _e,
      params: {
        instanceId: string;
        versionId: string;
        kind?: ContentKind;
        withDependencies?: boolean;
      }
    ) => {
      const instance = getInstance(params.instanceId);
      if (!instance) throw new Error('Instance not found');

      const version = await api<any>(`/version/${encodeURIComponent(params.versionId)}`);
      const kind: ContentKind = params.kind || 'mod';
      const destDir = await resolveContentDir(instance, kind);

      const installed: Array<{ name: string; path: string }> = [];
      const installOne = async (ver: any) => {
        const primary = ver.files.find((f: any) => f.primary) || ver.files[0];
        if (!primary) return;
        const target = join(destDir, primary.filename);
        try {
          await stat(target);
          return; // already present
        } catch {
          /* not present */
        }
        await downloadFileTo(primary.url, target);
        installed.push({ name: primary.filename, path: target });
      };

      await installOne(version);

      // Only mods have runtime dependency resolution — resource/shader packs
      // rarely declare deps in Modrinth.
      if (kind === 'mod' && params.withDependencies !== false) {
        for (const dep of version.dependencies || []) {
          if (dep.dependency_type !== 'required') continue;
          try {
            if (dep.version_id) {
              const depVersion = await api<any>(`/version/${encodeURIComponent(dep.version_id)}`);
              await installOne(depVersion);
            } else if (dep.project_id) {
              const loaders: string[] = instance.modLoader ? [instance.modLoader] : [];
              const qs = new URLSearchParams();
              if (loaders.length) qs.set('loaders', JSON.stringify(loaders));
              qs.set('game_versions', JSON.stringify([instance.version]));
              const candidates = await api<any[]>(
                `/project/${encodeURIComponent(dep.project_id)}/version?${qs.toString()}`
              );
              if (candidates[0]) await installOne(candidates[0]);
            }
          } catch (err) {
            console.warn('[Modrinth] dependency install failed:', dep, err);
          }
        }
      }

      return { success: true, installed };
    }
  );

  // ---------- Generic content folder management ----------
  // `kind` decides which folder to read: mods/, shaderpacks/ or resourcepacks/.

  ipcMain.handle('content:list', async (_e, instanceId: string, kind: ContentKind = 'mod') => {
    const instance = getInstance(instanceId);
    if (!instance) return [];
    try {
      const dir = await resolveContentDir(instance, kind);
      const files = await readdir(dir);
      const result = [];
      for (const f of files) {
        // Accept both .jar (mods) and .zip (packs). Allow `.disabled` suffix.
        const base = f.replace(/\.disabled$/, '');
        if (!/\.(jar|zip)$/i.test(base)) continue;
        const st = await stat(join(dir, f));
        result.push({
          filename: base,
          rawFilename: f,
          enabled: !f.endsWith('.disabled'),
          size: st.size,
          mtime: st.mtimeMs,
        });
      }
      return result.sort((a, b) => a.filename.localeCompare(b.filename));
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    'content:toggle',
    async (_e, instanceId: string, rawFilename: string, kind: ContentKind = 'mod') => {
      const instance = getInstance(instanceId);
      if (!instance) throw new Error('Instance not found');
      const dir = await resolveContentDir(instance, kind);
      const current = join(dir, rawFilename);
      const next = rawFilename.endsWith('.disabled')
        ? join(dir, rawFilename.replace(/\.disabled$/, ''))
        : join(dir, rawFilename + '.disabled');
      await rename(current, next);
      return { success: true };
    }
  );

  ipcMain.handle(
    'content:delete',
    async (_e, instanceId: string, rawFilename: string, kind: ContentKind = 'mod') => {
      const instance = getInstance(instanceId);
      if (!instance) throw new Error('Instance not found');
      const dir = await resolveContentDir(instance, kind);
      await unlink(join(dir, rawFilename));
      return { success: true };
    }
  );

  // ---------- Legacy "mods.*" aliases for backwards compatibility ----------
  ipcMain.handle('mods:list', async (_e, instanceId: string) => {
    const instance = getInstance(instanceId);
    if (!instance) return [];
    const dir = await resolveContentDir(instance, 'mod');
    try {
      const files = await readdir(dir);
      const result = [];
      for (const f of files) {
        if (!/\.(jar)(\.disabled)?$/.test(f)) continue;
        const st = await stat(join(dir, f));
        result.push({
          filename: f.replace(/\.disabled$/, ''),
          rawFilename: f,
          enabled: !f.endsWith('.disabled'),
          size: st.size,
          mtime: st.mtimeMs,
        });
      }
      return result.sort((a, b) => a.filename.localeCompare(b.filename));
    } catch {
      return [];
    }
  });

  ipcMain.handle('mods:toggle', async (_e, instanceId: string, rawFilename: string) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('Instance not found');
    const dir = await resolveContentDir(instance, 'mod');
    const current = join(dir, rawFilename);
    const next = rawFilename.endsWith('.disabled')
      ? join(dir, rawFilename.replace(/\.disabled$/, ''))
      : join(dir, rawFilename + '.disabled');
    await rename(current, next);
    return { success: true };
  });

  ipcMain.handle('mods:delete', async (_e, instanceId: string, rawFilename: string) => {
    const instance = getInstance(instanceId);
    if (!instance) throw new Error('Instance not found');
    const dir = await resolveContentDir(instance, 'mod');
    await unlink(join(dir, rawFilename));
    return { success: true };
  });
}
