"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPresetHandlers = setupPresetHandlers;
const electron_1 = require("electron");
const fs_1 = require("fs");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const stream_1 = require("stream");
const promises_2 = require("stream/promises");
const minecraftLauncher_1 = require("./minecraftLauncher");
const BASE = 'https://api.modrinth.com/v2';
const UA = 'wind-client/1.0.0 (minecraft launcher)';
/**
 * Curated "ready to play" pack. Mod menu + in-game cloud/sky toggles + shaders
 * installed and pre-enabled so the user's first launch matches what they
 * requested (black/custom clouds, redesigned options menu).
 *
 * All items are fetched from Modrinth at install time by slug, so we always
 * get the latest version compatible with the user's MC version + loader.
 */
const FABRIC_RECOMMENDED = [
    { slug: 'fabric-api', kind: 'mod' },
    { slug: 'sodium', kind: 'mod' }, // Performance + required by Sodium Extra
    { slug: 'iris', kind: 'mod' }, // Shader loader
    { slug: 'sodium-extra', kind: 'mod' }, // In-game toggles for clouds/fog/sun/sky
    { slug: 'reeses-sodium-options', kind: 'mod' }, // Redesigned Options menu (this is the "mod menu")
    { slug: 'modmenu', kind: 'mod' }, // Universal mod list / config menu
    { slug: 'complementary-reimagined', kind: 'shader', optional: true }, // Pre-installed shader pack
];
async function api(path) {
    const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
        throw new Error(`Modrinth ${res.status} on ${path}: ${await res.text().catch(() => res.statusText)}`);
    }
    return (await res.json());
}
async function download(url, dest) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok || !res.body)
        throw new Error(`Download failed ${res.status} for ${url}`);
    await (0, promises_2.pipeline)(stream_1.Readable.fromWeb(res.body), (0, fs_1.createWriteStream)(dest));
}
async function resolveLatest(slug, instance, kind) {
    const qs = new URLSearchParams();
    if (kind === 'mod' && instance.modLoader && instance.modLoader !== 'vanilla') {
        qs.set('loaders', JSON.stringify([instance.modLoader]));
    }
    qs.set('game_versions', JSON.stringify([instance.version]));
    const versions = await api(`/project/${encodeURIComponent(slug)}/version?${qs.toString()}`);
    // Prefer release over beta/alpha; list is already newest-first.
    return (versions.find((v) => v.version_type === 'release') || versions[0] || null);
}
function setupPresetHandlers(getInstance) {
    electron_1.ipcMain.handle('presets:installRecommended', async (_e, instanceId) => {
        const instance = getInstance(instanceId);
        if (!instance)
            throw new Error('Instance not found');
        if (instance.modLoader !== 'fabric') {
            throw new Error(`Recommended pack currently targets Fabric only — this instance uses "${instance.modLoader || 'vanilla'}".`);
        }
        const launcher = (0, minecraftLauncher_1.getMinecraftLauncher)();
        const gameDir = launcher.getGameDir(instance.gameDir);
        const modsDir = (0, path_1.join)(gameDir, 'mods');
        const shadersDir = (0, path_1.join)(gameDir, 'shaderpacks');
        const packsDir = (0, path_1.join)(gameDir, 'resourcepacks');
        await (0, promises_1.mkdir)(modsDir, { recursive: true });
        await (0, promises_1.mkdir)(shadersDir, { recursive: true });
        await (0, promises_1.mkdir)(packsDir, { recursive: true });
        const installed = [];
        const skipped = [];
        let preferredShaderFile = null;
        for (const item of FABRIC_RECOMMENDED) {
            try {
                const version = await resolveLatest(item.slug, instance, item.kind);
                if (!version) {
                    const msg = `no compatible version for ${instance.version}`;
                    if (item.optional)
                        skipped.push({ slug: item.slug, reason: msg });
                    else
                        throw new Error(msg);
                    continue;
                }
                const file = version.files.find((f) => f.primary) || version.files[0];
                if (!file)
                    continue;
                const dir = item.kind === 'mod' ? modsDir : item.kind === 'shader' ? shadersDir : packsDir;
                const target = (0, path_1.join)(dir, file.filename);
                try {
                    await (0, promises_1.stat)(target);
                    installed.push(file.filename);
                    if (item.kind === 'shader' && !preferredShaderFile)
                        preferredShaderFile = file.filename;
                    continue;
                }
                catch {
                    /* not present */
                }
                await download(file.url, target);
                installed.push(file.filename);
                if (item.kind === 'shader' && !preferredShaderFile)
                    preferredShaderFile = file.filename;
            }
            catch (err) {
                const reason = err instanceof Error ? err.message : String(err);
                if (item.optional) {
                    skipped.push({ slug: item.slug, reason });
                    console.warn(`[Presets] Skipping optional ${item.slug}: ${reason}`);
                }
                else {
                    throw new Error(`Failed to install ${item.slug}: ${reason}`);
                }
            }
        }
        // Pre-enable the shader in Iris so the user literally sees custom clouds
        // on first launch without opening any menu. Iris reads this file on init.
        if (preferredShaderFile) {
            try {
                const irisConfigPath = (0, path_1.join)(gameDir, 'config', 'iris.properties');
                await (0, promises_1.mkdir)((0, path_1.join)(gameDir, 'config'), { recursive: true });
                if (!(0, fs_1.existsSync)(irisConfigPath)) {
                    (0, fs_1.writeFileSync)(irisConfigPath, [
                        '# Written by wind-client recommended pack installer',
                        `shaderPack=${preferredShaderFile}`,
                        'enableShaders=true',
                        '',
                    ].join('\n'));
                }
            }
            catch (e) {
                console.warn('[Presets] Could not seed iris.properties:', e);
            }
        }
        return { success: true, installed, skipped, shader: preferredShaderFile };
    });
}
