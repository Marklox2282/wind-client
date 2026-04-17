"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupModrinthHandlers = setupModrinthHandlers;
const electron_1 = require("electron");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const stream_1 = require("stream");
const promises_2 = require("stream/promises");
const minecraftLauncher_1 = require("./minecraftLauncher");
const BASE = 'https://api.modrinth.com/v2';
const UA = 'wind-client/1.0.0 (minecraft launcher)';
const CONTENT_FOLDER = {
    mod: 'mods',
    shader: 'shaderpacks',
    resourcepack: 'resourcepacks',
};
async function api(path) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
        throw new Error(`Modrinth ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    return (await res.json());
}
function buildSearchQuery(params) {
    const kind = params.projectType || 'mod';
    const facets = [[`project_type:${kind}`]];
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
async function downloadFileTo(url, dest) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok || !res.body) {
        throw new Error(`Download failed ${res.status} for ${url}`);
    }
    await (0, promises_2.pipeline)(stream_1.Readable.fromWeb(res.body), (0, fs_1.createWriteStream)(dest));
}
async function resolveContentDir(instance, kind) {
    const launcher = (0, minecraftLauncher_1.getMinecraftLauncher)();
    const gameDir = launcher.getGameDir(instance.gameDir);
    const dir = (0, path_1.join)(gameDir, CONTENT_FOLDER[kind]);
    await (0, promises_1.mkdir)(dir, { recursive: true });
    return dir;
}
function setupModrinthHandlers(getInstance) {
    // ---------- Modrinth proxy ----------
    electron_1.ipcMain.handle('modrinth:search', async (_e, params) => {
        const qs = buildSearchQuery(params);
        return api(`/search?${qs}`);
    });
    electron_1.ipcMain.handle('modrinth:getProject', async (_e, id) => {
        return api(`/project/${encodeURIComponent(id)}`);
    });
    electron_1.ipcMain.handle('modrinth:getVersions', async (_e, id, params = {}) => {
        const qs = new URLSearchParams();
        // Resource packs publish under the `minecraft` loader, shaders usually
        // under `iris`/`optifine`/`canvas`. For mods the user-selected loader is
        // forwarded verbatim.
        if (params.loaders?.length && (params.kind || 'mod') === 'mod') {
            qs.set('loaders', JSON.stringify(params.loaders));
        }
        if (params.gameVersions?.length)
            qs.set('game_versions', JSON.stringify(params.gameVersions));
        return api(`/project/${encodeURIComponent(id)}/version?${qs.toString()}`);
    });
    electron_1.ipcMain.handle('modrinth:getVersion', async (_e, versionId) => {
        return api(`/version/${encodeURIComponent(versionId)}`);
    });
    electron_1.ipcMain.handle('modrinth:installVersion', async (_e, params) => {
        const instance = getInstance(params.instanceId);
        if (!instance)
            throw new Error('Instance not found');
        const version = await api(`/version/${encodeURIComponent(params.versionId)}`);
        const kind = params.kind || 'mod';
        const destDir = await resolveContentDir(instance, kind);
        const installed = [];
        const installOne = async (ver) => {
            const primary = ver.files.find((f) => f.primary) || ver.files[0];
            if (!primary)
                return;
            const target = (0, path_1.join)(destDir, primary.filename);
            try {
                await (0, promises_1.stat)(target);
                return; // already present
            }
            catch {
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
                if (dep.dependency_type !== 'required')
                    continue;
                try {
                    if (dep.version_id) {
                        const depVersion = await api(`/version/${encodeURIComponent(dep.version_id)}`);
                        await installOne(depVersion);
                    }
                    else if (dep.project_id) {
                        const loaders = instance.modLoader ? [instance.modLoader] : [];
                        const qs = new URLSearchParams();
                        if (loaders.length)
                            qs.set('loaders', JSON.stringify(loaders));
                        qs.set('game_versions', JSON.stringify([instance.version]));
                        const candidates = await api(`/project/${encodeURIComponent(dep.project_id)}/version?${qs.toString()}`);
                        if (candidates[0])
                            await installOne(candidates[0]);
                    }
                }
                catch (err) {
                    console.warn('[Modrinth] dependency install failed:', dep, err);
                }
            }
        }
        return { success: true, installed };
    });
    // ---------- Generic content folder management ----------
    // `kind` decides which folder to read: mods/, shaderpacks/ or resourcepacks/.
    electron_1.ipcMain.handle('content:list', async (_e, instanceId, kind = 'mod') => {
        const instance = getInstance(instanceId);
        if (!instance)
            return [];
        try {
            const dir = await resolveContentDir(instance, kind);
            const files = await (0, promises_1.readdir)(dir);
            const result = [];
            for (const f of files) {
                // Accept both .jar (mods) and .zip (packs). Allow `.disabled` suffix.
                const base = f.replace(/\.disabled$/, '');
                if (!/\.(jar|zip)$/i.test(base))
                    continue;
                const st = await (0, promises_1.stat)((0, path_1.join)(dir, f));
                result.push({
                    filename: base,
                    rawFilename: f,
                    enabled: !f.endsWith('.disabled'),
                    size: st.size,
                    mtime: st.mtimeMs,
                });
            }
            return result.sort((a, b) => a.filename.localeCompare(b.filename));
        }
        catch {
            return [];
        }
    });
    electron_1.ipcMain.handle('content:toggle', async (_e, instanceId, rawFilename, kind = 'mod') => {
        const instance = getInstance(instanceId);
        if (!instance)
            throw new Error('Instance not found');
        const dir = await resolveContentDir(instance, kind);
        const current = (0, path_1.join)(dir, rawFilename);
        const next = rawFilename.endsWith('.disabled')
            ? (0, path_1.join)(dir, rawFilename.replace(/\.disabled$/, ''))
            : (0, path_1.join)(dir, rawFilename + '.disabled');
        await (0, promises_1.rename)(current, next);
        return { success: true };
    });
    electron_1.ipcMain.handle('content:delete', async (_e, instanceId, rawFilename, kind = 'mod') => {
        const instance = getInstance(instanceId);
        if (!instance)
            throw new Error('Instance not found');
        const dir = await resolveContentDir(instance, kind);
        await (0, promises_1.unlink)((0, path_1.join)(dir, rawFilename));
        return { success: true };
    });
    // ---------- Legacy "mods.*" aliases for backwards compatibility ----------
    electron_1.ipcMain.handle('mods:list', async (_e, instanceId) => {
        const instance = getInstance(instanceId);
        if (!instance)
            return [];
        const dir = await resolveContentDir(instance, 'mod');
        try {
            const files = await (0, promises_1.readdir)(dir);
            const result = [];
            for (const f of files) {
                if (!/\.(jar)(\.disabled)?$/.test(f))
                    continue;
                const st = await (0, promises_1.stat)((0, path_1.join)(dir, f));
                result.push({
                    filename: f.replace(/\.disabled$/, ''),
                    rawFilename: f,
                    enabled: !f.endsWith('.disabled'),
                    size: st.size,
                    mtime: st.mtimeMs,
                });
            }
            return result.sort((a, b) => a.filename.localeCompare(b.filename));
        }
        catch {
            return [];
        }
    });
    electron_1.ipcMain.handle('mods:toggle', async (_e, instanceId, rawFilename) => {
        const instance = getInstance(instanceId);
        if (!instance)
            throw new Error('Instance not found');
        const dir = await resolveContentDir(instance, 'mod');
        const current = (0, path_1.join)(dir, rawFilename);
        const next = rawFilename.endsWith('.disabled')
            ? (0, path_1.join)(dir, rawFilename.replace(/\.disabled$/, ''))
            : (0, path_1.join)(dir, rawFilename + '.disabled');
        await (0, promises_1.rename)(current, next);
        return { success: true };
    });
    electron_1.ipcMain.handle('mods:delete', async (_e, instanceId, rawFilename) => {
        const instance = getInstance(instanceId);
        if (!instance)
            throw new Error('Instance not found');
        const dir = await resolveContentDir(instance, 'mod');
        await (0, promises_1.unlink)((0, path_1.join)(dir, rawFilename));
        return { success: true };
    });
}
