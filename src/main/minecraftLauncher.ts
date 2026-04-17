import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { EventEmitter } from 'events';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, createWriteStream, unlinkSync } from 'fs';
import * as https from 'https';
import * as http from 'http';
import type { IncomingMessage } from 'http';

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
  javaPath?: string;
  /** Extra JVM arguments appended AFTER the profile's own args. */
  extraJvmArgs?: string[];
  /** Extra environment variables for the spawned process. */
  env?: Record<string, string>;
  /** Mod loader to install on top of versionId (e.g. 'fabric'). */
  modLoader?: string;
  /** Specific mod-loader version. When omitted, the latest stable is picked. */
  modLoaderVersion?: string;
}

export type LauncherStatus =
  | 'idle'
  | 'preparing'
  | 'libraries'
  | 'assets'
  | 'launching'
  | 'running';

export interface LauncherProgress {
  status: LauncherStatus;
  stage: string;
  percent: number;
  current?: number;
  total?: number;
}

interface ParsedLibName {
  group: string;
  artifact: string;
  version: string;
  classifier?: string;
}

type OSName = 'windows' | 'osx' | 'linux';

const CURRENT_OS: OSName =
  process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';

const NATIVE_EXTENSIONS: Record<OSName, string[]> = {
  windows: ['.dll'],
  osx: ['.dylib', '.jnilib'],
  linux: ['.so'],
};

export class MinecraftLauncher extends EventEmitter {
  private static readonly MANIFEST_URL =
    'https://launchermeta.mojang.com/mc/game/version_manifest.json';
  private static readonly ASSETS_URL = 'https://resources.download.minecraft.net/';

  private minecraftDir: string;
  private versionsDir: string;
  private librariesDir: string;
  private assetsDir: string;
  private nativesRoot: string;

  private currentProcess: ChildProcess | null = null;
  private currentStatus: LauncherStatus = 'idle';
  private currentVersionId: string | null = null;

  constructor() {
    super();
    this.minecraftDir = join(app.getPath('userData'), '.minecraft');
    this.versionsDir = join(this.minecraftDir, 'versions');
    this.librariesDir = join(this.minecraftDir, 'libraries');
    this.assetsDir = join(this.minecraftDir, 'assets');
    this.nativesRoot = join(this.minecraftDir, 'natives');
    this.ensureDir(this.minecraftDir);
    this.ensureDir(this.versionsDir);
    this.ensureDir(this.librariesDir);
    this.ensureDir(this.assetsDir);
    this.ensureDir(this.nativesRoot);
  }

  getStatus(): { status: LauncherStatus; versionId: string | null } {
    return { status: this.currentStatus, versionId: this.currentVersionId };
  }

  /** Absolute path for an instance's game directory (or the root .minecraft). */
  getGameDir(relativeGameDir?: string): string {
    return relativeGameDir ? join(this.minecraftDir, relativeGameDir) : this.minecraftDir;
  }

  getMinecraftDir(): string {
    return this.minecraftDir;
  }

  stop(): boolean {
    if (!this.currentProcess || this.currentProcess.killed) return false;
    try {
      if (process.platform === 'win32' && this.currentProcess.pid) {
        spawn('taskkill', ['/PID', String(this.currentProcess.pid), '/T', '/F'], {
          detached: true,
          stdio: 'ignore',
        });
      } else {
        this.currentProcess.kill('SIGTERM');
      }
      return true;
    } catch (e) {
      console.error('[Launcher] Failed to stop process:', e);
      return false;
    }
  }

  private setStatus(status: LauncherStatus): void {
    this.currentStatus = status;
    this.emit('status', { status, versionId: this.currentVersionId });
  }

  private emitProgress(p: LauncherProgress): void {
    this.emit('progress', p);
  }

  async launch(options: LaunchOptions): Promise<void> {
    if (this.currentStatus === 'running') {
      throw new Error('Minecraft is already running');
    }
    if (this.currentStatus !== 'idle') {
      // Stale busy state (e.g. previous aborted prepare). Reset and continue.
      console.warn('[Launcher] Resetting stale status from', this.currentStatus);
      this.setStatus('idle');
    }

    this.currentVersionId = options.versionId;
    this.setStatus('preparing');
    this.emitProgress({ status: 'preparing', stage: 'Resolving version', percent: 0 });

    try {
      // Resolve mod-loader first (no status change in the installer itself).
      const effectiveVersionId = await this.installModLoader(
        options.modLoader,
        options.versionId,
        options.modLoaderVersion
      );
      this.currentVersionId = effectiveVersionId;

      const versionJson = await this.ensureVersion(effectiveVersionId);
      const merged = await this.resolveInheritance(versionJson);

      this.emitProgress({ status: 'preparing', stage: 'Version resolved', percent: 5 });

      const { classpath, nativesDir } = await this.prepareLibrariesAndNatives(merged);

      await this.downloadAssets(merged);

      this.setStatus('launching');
      this.emitProgress({ status: 'launching', stage: 'Preparing Java', percent: 95 });

      const javaPath = options.javaPath || (await this.findJava());

      this.emitProgress({ status: 'launching', stage: 'Starting Minecraft', percent: 99 });

      await this.launchProcess(javaPath, classpath, nativesDir, merged, options);

      this.setStatus('running');
      this.emitProgress({ status: 'running', stage: 'Running', percent: 100 });
    } catch (err) {
      this.setStatus('idle');
      this.currentVersionId = null;
      throw err;
    }
  }

  // ---------- Version JSON ----------

  private async ensureVersion(versionId: string): Promise<any> {
    const versionDir = join(this.versionsDir, versionId);
    const jsonPath = join(versionDir, `${versionId}.json`);
    const jarPath = join(versionDir, `${versionId}.jar`);

    this.ensureDir(versionDir);

    if (!existsSync(jsonPath)) {
      const manifest = await this.fetchJson<{ versions: Array<{ id: string; url: string }> }>(
        MinecraftLauncher.MANIFEST_URL
      );
      const entry = manifest.versions.find((v) => v.id === versionId);
      if (!entry) {
        throw new Error(
          `Minecraft version "${versionId}" does not exist. Pick an existing release.`
        );
      }
      const json = await this.fetchJson<any>(entry.url);
      writeFileSync(jsonPath, JSON.stringify(json, null, 2));
    }

    const versionJson = JSON.parse(readFileSync(jsonPath, 'utf-8'));

    // Profiles that inherit from another version (Fabric/Forge/Quilt) don't
    // ship a client JAR — the parent provides it. Only download when present.
    const clientUrl = versionJson.downloads?.client?.url;
    if (clientUrl && !existsSync(jarPath)) {
      await this.downloadFile(clientUrl, jarPath);
    }
    return versionJson;
  }

  private async resolveInheritance(versionJson: any): Promise<any> {
    if (!versionJson.inheritsFrom) {
      return { ...versionJson, _rootId: versionJson.id };
    }
    const parent = await this.ensureVersion(versionJson.inheritsFrom);
    const resolvedParent = await this.resolveInheritance(parent);
    return this.mergeVersionJson(resolvedParent, versionJson);
  }

  private mergeVersionJson(parent: any, child: any): any {
    const merged = { ...parent, ...child };

    // Libraries — child first so its overrides win. Later de-duplicated by
    // group:artifact in prepareLibrariesAndNatives.
    merged.libraries = [...(child.libraries || []), ...(parent.libraries || [])];

    if (child.arguments || parent.arguments) {
      merged.arguments = {
        game: [...(parent.arguments?.game || []), ...(child.arguments?.game || [])],
        jvm: [...(parent.arguments?.jvm || []), ...(child.arguments?.jvm || [])],
      };
    }
    merged.mainClass = child.mainClass || parent.mainClass;
    merged.id = child.id || parent.id;
    merged.assetIndex = child.assetIndex || parent.assetIndex;
    merged.downloads = child.downloads || parent.downloads;
    merged.assets = child.assets || parent.assets;
    merged.type = child.type || parent.type;
    // Preserve the root vanilla id — its folder holds the real client JAR.
    merged._rootId = parent._rootId || parent.id;
    return merged;
  }

  // ---------- Mod loader installers ----------

  /**
   * Install (download the profile JSON for) a Fabric loader on top of a
   * Minecraft version. Returns the profile id that can be launched.
   */
  async installFabric(mcVersion: string, loaderVersion?: string): Promise<string> {
    // Pick the latest stable loader if not specified.
    if (!loaderVersion) {
      const list = await this.fetchJson<Array<{ loader: { version: string; stable: boolean } }>>(
        `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}`
      );
      if (!list.length) {
        throw new Error(`No Fabric loader available for Minecraft ${mcVersion}`);
      }
      const stable = list.find((l) => l.loader.stable) || list[0];
      loaderVersion = stable.loader.version;
    }

    const profileId = `fabric-loader-${loaderVersion}-${mcVersion}`;
    const versionDir = join(this.versionsDir, profileId);
    const jsonPath = join(versionDir, `${profileId}.json`);

    if (!existsSync(jsonPath)) {
      this.ensureDir(versionDir);
      const profileJson = await this.fetchJson<any>(
        `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
      );
      writeFileSync(jsonPath, JSON.stringify(profileJson, null, 2));
    }
    return profileId;
  }

  /**
   * Install Forge for a given Minecraft version. Uses the official Forge
   * installer JAR in headless `--installClient` mode because modern Forge
   * (1.17+) does binary patching of the client JAR which cannot be replicated
   * without running their installer.
   */
  async installForge(mcVersion: string, forgeVersion?: string): Promise<string> {
    // Resolve the promoted build if the user didn't pick a specific one.
    if (!forgeVersion) {
      const promos = await this.fetchJson<{ promos: Record<string, string> }>(
        'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
      );
      forgeVersion =
        promos.promos[`${mcVersion}-recommended`] ||
        promos.promos[`${mcVersion}-latest`];
      if (!forgeVersion) {
        throw new Error(
          `No Forge build published for Minecraft ${mcVersion}. Pick a supported version.`
        );
      }
    }

    // If already installed, reuse it.
    const existing = this.findForgeProfile(mcVersion, forgeVersion);
    if (existing) return existing;

    // The installer needs the vanilla client present and a (possibly empty)
    // launcher_profiles.json to write into.
    await this.ensureVersion(mcVersion);
    this.ensureLauncherProfilesJson();

    const fullVersion = `${mcVersion}-${forgeVersion}`;
    const installerPath = join(this.minecraftDir, `forge-${fullVersion}-installer.jar`);
    if (!existsSync(installerPath)) {
      this.emitProgress({
        status: 'preparing',
        stage: 'Downloading Forge installer',
        percent: 2,
      });
      const url = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`;
      await this.downloadFile(url, installerPath);
    }

    this.emitProgress({
      status: 'preparing',
      stage: 'Installing Forge — may take a minute',
      percent: 3,
    });

    const javaPath = await this.findJava();
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        javaPath,
        ['-jar', installerPath, '--installClient', this.minecraftDir],
        { cwd: this.minecraftDir, stdio: ['ignore', 'pipe', 'pipe'] }
      );
      proc.stdout?.on('data', (d) => console.log('[Forge]', d.toString().trim()));
      proc.stderr?.on('data', (d) => console.warn('[Forge]', d.toString().trim()));
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Forge installer exited with code ${code}`));
      });
    });

    const profile = this.findForgeProfile(mcVersion, forgeVersion);
    if (!profile) {
      throw new Error('Forge installer completed but no version profile was created');
    }
    return profile;
  }

  /**
   * Forge's installer picks slightly different folder names across versions
   * (`1.20.1-forge-47.3.0`, `forge-1.20.1-47.3.0`, etc.) so we look it up by
   * matching both the MC version and the forge version in the folder name.
   */
  private findForgeProfile(mcVersion: string, forgeVersion: string): string | null {
    if (!existsSync(this.versionsDir)) return null;
    try {
      const dirs = readdirSync(this.versionsDir);
      for (const d of dirs) {
        const jsonExists = existsSync(join(this.versionsDir, d, `${d}.json`));
        if (!jsonExists) continue;
        const lower = d.toLowerCase();
        if (!lower.includes('forge')) continue;
        if (!d.includes(forgeVersion)) continue;
        if (!d.includes(mcVersion)) continue;
        return d;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private ensureLauncherProfilesJson(): void {
    const p = join(this.minecraftDir, 'launcher_profiles.json');
    if (existsSync(p)) return;
    writeFileSync(
      p,
      JSON.stringify(
        {
          profiles: {},
          settings: {},
          version: 3,
          selectedUser: { account: '', profile: '' },
        },
        null,
        2
      )
    );
  }

  /**
   * Dispatch installer for a supported mod loader. Returns the version id to
   * launch with. For vanilla just returns the input unchanged.
   */
  async installModLoader(
    loader: string | undefined,
    mcVersion: string,
    loaderVersion?: string
  ): Promise<string> {
    switch (loader) {
      case 'fabric':
        return this.installFabric(mcVersion, loaderVersion);
      case 'forge':
        return this.installForge(mcVersion, loaderVersion);
      case 'vanilla':
      case undefined:
      case '':
        return mcVersion;
      case 'quilt':
      case 'neoforge':
        throw new Error(`Mod loader "${loader}" is not supported yet.`);
      default:
        throw new Error(`Unknown mod loader "${loader}".`);
    }
  }

  // ---------- Libraries & Natives ----------

  private parseLibName(name: string): ParsedLibName | null {
    const parts = name.split(':');
    if (parts.length === 3) return { group: parts[0], artifact: parts[1], version: parts[2] };
    if (parts.length === 4)
      return { group: parts[0], artifact: parts[1], version: parts[2], classifier: parts[3] };
    return null;
  }

  private libJarFileName(p: ParsedLibName): string {
    return p.classifier
      ? `${p.artifact}-${p.version}-${p.classifier}.jar`
      : `${p.artifact}-${p.version}.jar`;
  }

  private libDir(p: ParsedLibName): string {
    return join(this.librariesDir, p.group.replace(/\./g, '/'), p.artifact, p.version);
  }

  private libJarPath(p: ParsedLibName): string {
    return join(this.libDir(p), this.libJarFileName(p));
  }

  private ruleApplies(lib: any): boolean {
    if (!lib.rules) return true;
    let allowed = false;
    for (const rule of lib.rules) {
      let match = true;
      if (rule.os) {
        if (rule.os.name && rule.os.name !== CURRENT_OS) match = false;
        if (rule.os.arch && rule.os.arch !== process.arch) match = false;
        if (rule.os.version) {
          // Soft skip: we don't compare Windows/macOS release versions.
          // Treat as a match so rules stay permissive instead of silently
          // blocking required libs.
        }
      }
      if (rule.features) {
        // We don't announce any feature flags (demo_user, custom_resolution…)
        // so feature-gated rules don't apply to us.
        match = false;
      }
      if (match) allowed = rule.action === 'allow';
    }
    return allowed;
  }

  private getNativeClassifierKey(lib: any): string | null {
    const parsed = this.parseLibName(lib.name);
    if (parsed?.classifier && parsed.classifier.startsWith('natives-')) {
      return parsed.classifier.includes(CURRENT_OS) ? parsed.classifier : null;
    }
    if (lib.natives && lib.natives[CURRENT_OS]) {
      return (lib.natives[CURRENT_OS] as string).replace(
        '${arch}',
        process.arch === 'x64' ? '64' : '32'
      );
    }
    return null;
  }

  private async prepareLibrariesAndNatives(
    versionJson: any
  ): Promise<{ classpath: string; nativesDir: string }> {
    this.setStatus('libraries');
    const nativesDir = join(this.nativesRoot, versionJson.id);
    this.ensureDir(nativesDir);

    const rawLibraries: any[] = (versionJson.libraries || []).filter((l: any) =>
      this.ruleApplies(l)
    );

    // De-duplicate by group:artifact:classifier — child libs come first in
    // the merged list so their version wins over the parent's.
    const seen = new Set<string>();
    const libraries: any[] = [];
    for (const lib of rawLibraries) {
      const p = this.parseLibName(lib.name);
      if (!p) continue;
      const key = `${p.group}:${p.artifact}:${p.classifier || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      libraries.push(lib);
    }

    const total = libraries.length;
    const classpathSet = new Set<string>();

    for (let i = 0; i < libraries.length; i++) {
      const lib = libraries[i];
      const parsed = this.parseLibName(lib.name);
      if (!parsed) continue;

      const artifactDl = lib.downloads?.artifact;

      // Pick the exact location from the profile if it specifies `path`,
      // otherwise fall back to the standard maven layout. This matters for
      // mod-loaders (Forge, NeoForge) whose installer drops jars at specific
      // paths without URLs.
      const jarPath = artifactDl?.path
        ? join(this.librariesDir, artifactDl.path)
        : this.libJarPath(parsed);

      // Download if a URL is known and file is missing.
      if (artifactDl?.url && !existsSync(jarPath)) {
        this.ensureDir(dirname(jarPath));
        try {
          await this.downloadFile(artifactDl.url, jarPath);
        } catch (e) {
          console.warn('[Launcher] lib download failed', lib.name, e);
        }
      }

      // Legacy <1.13 style: neither `downloads.artifact` nor classifiers —
      // synthesize a Maven URL from the lib.url (e.g. forge's own maven).
      if (!artifactDl && !lib.downloads?.classifiers) {
        const mavenPath = `${parsed.group.replace(/\./g, '/')}/${parsed.artifact}/${parsed.version}/${this.libJarFileName(parsed)}`;
        const fallbackPath = join(this.librariesDir, mavenPath);
        if (!existsSync(fallbackPath)) {
          const url = (lib.url || 'https://libraries.minecraft.net/') + mavenPath;
          this.ensureDir(dirname(fallbackPath));
          try {
            await this.downloadFile(url, fallbackPath);
          } catch (e) {
            console.warn('[Launcher] legacy lib download failed', lib.name, e);
          }
        }
        if (existsSync(fallbackPath)) classpathSet.add(fallbackPath);
        // Continue to next lib for legacy path.
      } else {
        // Modern path: add/extract once the expected file exists. For libs
        // where `downloads.artifact` has no URL (installer-generated), the
        // file is already on disk thanks to the loader installer.
        const isNativeArtifact = parsed.classifier?.startsWith('natives-') ?? false;
        if (isNativeArtifact) {
          if (parsed.classifier!.includes(CURRENT_OS) && existsSync(jarPath)) {
            this.extractNativesFromJar(jarPath, nativesDir, lib.extract?.exclude);
          }
        } else if (existsSync(jarPath)) {
          classpathSet.add(jarPath);
        } else {
          console.warn('[Launcher] missing library (no file):', lib.name, '→', jarPath);
        }
      }

      // Legacy-style native classifiers under `downloads.classifiers`
      const classifiers = lib.downloads?.classifiers;
      if (classifiers) {
        const key = this.getNativeClassifierKey(lib);
        if (key && classifiers[key]) {
          const cdl = classifiers[key];
          const classifiedParsed: ParsedLibName = { ...parsed, classifier: key };
          const cPath = cdl.path ? join(this.librariesDir, cdl.path) : this.libJarPath(classifiedParsed);
          if (!existsSync(cPath) && cdl.url) {
            this.ensureDir(dirname(cPath));
            try {
              await this.downloadFile(cdl.url, cPath);
            } catch (e) {
              console.warn('[Launcher] native download failed', lib.name, e);
            }
          }
          if (existsSync(cPath)) {
            this.extractNativesFromJar(cPath, nativesDir, lib.extract?.exclude);
          }
        }
      }

      const percent = 5 + Math.floor(((i + 1) / total) * 35); // 5%..40%
      this.emitProgress({
        status: 'libraries',
        stage: `Downloading libraries`,
        percent,
        current: i + 1,
        total,
      });
    }

    // The real client JAR lives in the ROOT version folder (the vanilla one
    // when running Fabric/Forge). `_rootId` is set during inheritance merge.
    const rootId = versionJson._rootId || versionJson.id;
    const versionJar = join(this.versionsDir, rootId, `${rootId}.jar`);
    classpathSet.add(versionJar);

    const separator = process.platform === 'win32' ? ';' : ':';
    return { classpath: Array.from(classpathSet).join(separator), nativesDir };
  }

  private extractNativesFromJar(jarPath: string, nativesDir: string, excludes: string[] = []): void {
    try {
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(jarPath);
      const entries = zip.getEntries();
      const exts = NATIVE_EXTENSIONS[CURRENT_OS];
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName: string = entry.entryName;
        if (entryName.startsWith('META-INF/')) continue;
        if (excludes.some((e) => entryName.startsWith(e))) continue;
        const lower = entryName.toLowerCase();
        if (!exts.some((ext) => lower.endsWith(ext))) continue;
        if (CURRENT_OS === 'windows' && (lower.includes('/arm') || lower.includes('/x86/'))) continue;
        try {
          zip.extractEntryTo(entryName, nativesDir, false, true);
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('[Launcher] native extract error:', jarPath, e);
    }
  }

  // ---------- Assets ----------

  private async downloadAssets(versionJson: any): Promise<void> {
    this.setStatus('assets');
    const assetIndex = versionJson.assetIndex;
    if (!assetIndex?.url) return;

    const indexesDir = join(this.assetsDir, 'indexes');
    const objectsDir = join(this.assetsDir, 'objects');
    this.ensureDir(indexesDir);
    this.ensureDir(objectsDir);

    const indexPath = join(indexesDir, `${assetIndex.id}.json`);
    if (!existsSync(indexPath)) {
      await this.downloadFile(assetIndex.url, indexPath);
    }

    const assets = JSON.parse(readFileSync(indexPath, 'utf-8')) as {
      objects: Record<string, { hash: string; size: number }>;
    };
    const entries = Object.entries(assets.objects);
    const total = entries.length;
    let processed = 0;
    let lastPercent = -1;

    const concurrency = 16;
    let i = 0;

    const worker = async () => {
      while (i < entries.length) {
        const idx = i++;
        const [, obj] = entries[idx];
        const hash = obj.hash;
        const prefix = hash.substring(0, 2);
        const dir = join(objectsDir, prefix);
        const file = join(dir, hash);
        if (!existsSync(file)) {
          this.ensureDir(dir);
          try {
            await this.downloadFile(`${MinecraftLauncher.ASSETS_URL}${prefix}/${hash}`, file);
          } catch {
            // ignore single asset failure
          }
        }
        processed++;
        const percent = 40 + Math.floor((processed / total) * 55); // 40%..95%
        if (percent !== lastPercent) {
          lastPercent = percent;
          this.emitProgress({
            status: 'assets',
            stage: 'Downloading assets',
            percent,
            current: processed,
            total,
          });
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  }

  // ---------- Java ----------

  private async findJava(): Promise<string> {
    if (process.env.JAVA_HOME) {
      const candidate =
        process.platform === 'win32'
          ? join(process.env.JAVA_HOME, 'bin', 'javaw.exe')
          : join(process.env.JAVA_HOME, 'bin', 'java');
      if (existsSync(candidate)) return candidate;
    }

    if (process.platform === 'win32') {
      const roots = [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\Microsoft',
        'C:\\Program Files\\Zulu',
        'C:\\Program Files (x86)\\Java',
      ];
      const fs = require('fs');
      const path = require('path');
      for (const root of roots) {
        if (!existsSync(root)) continue;
        try {
          const subs = fs.readdirSync(root) as string[];
          subs.sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
            const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
            return numB - numA;
          });
          for (const sub of subs) {
            const javaw = path.join(root, sub, 'bin', 'javaw.exe');
            if (existsSync(javaw)) return javaw;
            const java = path.join(root, sub, 'bin', 'java.exe');
            if (existsSync(java)) return java;
          }
        } catch {
          /* ignore */
        }
      }
      return 'javaw';
    }
    return 'java';
  }

  // ---------- Launch ----------

  /**
   * Write a minimal `options.txt` into the game dir on very first launch so
   * the user gets sensible defaults out of the box:
   *   - Music muted
   *   - VSync off + unlimited FPS
   *   - Narrator disabled (also skips the "Enable narrator?" accessibility
   *     prompt that otherwise appears on the very first launch).
   *   - Skips the intro tutorial overlay
   *
   * If `options.txt` already exists we leave it completely alone so user
   * changes are never overwritten.
   */
  private ensureDefaultOptions(gameDir: string): void {
    const optionsPath = join(gameDir, 'options.txt');
    if (existsSync(optionsPath)) return;

    const defaults: Record<string, string> = {
      // Accessibility / onboarding
      narrator: '0',
      tutorialStep: 'none',
      // UI
      guiScale: '2', // Fixed 2× interface scale (user-requested default)
      // Performance
      maxFps: '260', // 260 in MC == "Unlimited"
      enableVsync: 'false',
      // Audio — mute music but keep everything else at default volume
      'soundCategory_music': '0.0',
      'soundCategory_record': '0.0',
      // Enable the built-in "Programmer Art" resource pack by default so the
      // launcher's monochrome aesthetic flows into the game's icons/blocks.
      resourcePacks: '["vanilla","programmer_art"]',
      incompatibleResourcePacks: '[]',
    };

    try {
      const content = Object.entries(defaults)
        .map(([k, v]) => `${k}:${v}`)
        .join('\n') + '\n';
      writeFileSync(optionsPath, content);
      console.log('[Launcher] Seeded default options.txt at', optionsPath);
    } catch (e) {
      console.warn('[Launcher] Failed to seed options.txt:', e);
    }
  }

  /**
   * Build the full JVM + game argument lists by substituting Mojang's
   * `${variable}` placeholders from the profile JSON (`arguments.jvm` /
   * `arguments.game`). Supports:
   *   - Modern profile format (1.13+) with an `arguments` block and rule-gated
   *     argument objects.
   *   - Legacy format (≤ 1.12) with a flat `minecraftArguments` string.
   *
   * Mod-loaders like Forge rely on this because they inject loader-specific
   * args (`--launchTarget fmlclient`, `-p <modulepath>`, `--add-modules …`)
   * that MUST be forwarded — a hard-coded arg list breaks them.
   */
  private buildLaunchArgs(
    versionJson: any,
    options: LaunchOptions,
    gameDir: string,
    classpath: string,
    nativesPath: string
  ): { jvmArgs: string[]; gameArgs: string[] } {
    const userType =
      options.accessToken && options.accessToken !== 'offline-token' ? 'msa' : 'legacy';

    const vars: Record<string, string> = {
      auth_player_name: options.username,
      version_name: versionJson.id,
      game_directory: gameDir,
      assets_root: this.assetsDir,
      game_assets: this.assetsDir,
      assets_index_name: versionJson.assetIndex?.id || versionJson.assets || 'legacy',
      auth_uuid: options.uuid.replace(/-/g, ''),
      auth_access_token: options.accessToken || '0',
      auth_session: options.accessToken || '0',
      clientid: '',
      auth_xuid: '',
      user_type: userType,
      user_properties: '{}',
      version_type: versionJson.type || 'release',
      natives_directory: nativesPath,
      launcher_name: 'wind-client',
      launcher_version: '1.0.0',
      library_directory: this.librariesDir,
      classpath_separator: process.platform === 'win32' ? ';' : ':',
      classpath: classpath,
      resolution_width: String(options.width || 1280),
      resolution_height: String(options.height || 720),
    };

    const substitute = (s: string): string =>
      s.replace(/\$\{([^}]+)\}/g, (_, key) => (key in vars ? vars[key] : ''));

    const processArg = (arg: any): string[] => {
      if (typeof arg === 'string') return [substitute(arg)];
      if (arg && typeof arg === 'object') {
        if (arg.rules && !this.ruleApplies(arg)) return [];
        const val = arg.value;
        if (val == null) return [];
        const arr = Array.isArray(val) ? val : [val];
        return arr.map((v: any) => (typeof v === 'string' ? substitute(v) : String(v)));
      }
      return [];
    };

    const jvmArgs: string[] = [
      `-Xms${options.minMemory || 1024}M`,
      `-Xmx${options.maxMemory || 4096}M`,
      '-Dfile.encoding=UTF-8',
    ];
    let gameArgs: string[] = [];

    if (versionJson.arguments) {
      for (const a of versionJson.arguments.jvm || []) jvmArgs.push(...processArg(a));
      for (const a of versionJson.arguments.game || []) gameArgs.push(...processArg(a));
    } else if (versionJson.minecraftArguments) {
      // Legacy format (<= 1.12)
      gameArgs = versionJson.minecraftArguments.split(/\s+/).map(substitute);
    }

    // Ensure the essentials are present even if the profile omits them.
    const has = (arr: string[], needle: string) => arr.some((a) => a.includes(needle));
    if (!has(jvmArgs, 'java.library.path')) {
      jvmArgs.push(`-Djava.library.path=${nativesPath}`);
    }
    jvmArgs.push(`-Dorg.lwjgl.librarypath=${nativesPath}`);
    if (!has(jvmArgs, '-cp')) {
      jvmArgs.push('-cp', classpath);
    }

    // No classic args at all (shouldn't happen) — fall back to a sane set.
    if (gameArgs.length === 0) {
      gameArgs = [
        '--username', options.username,
        '--version', versionJson.id,
        '--gameDir', gameDir,
        '--assetsDir', this.assetsDir,
        '--assetIndex', vars.assets_index_name,
        '--uuid', vars.auth_uuid,
        '--accessToken', vars.auth_access_token,
        '--userType', userType,
        '--versionType', vars.version_type,
      ];
    }

    if (options.width && options.height && !gameArgs.includes('--width')) {
      gameArgs.push('--width', String(options.width), '--height', String(options.height));
    }
    if (options.fullscreen && !gameArgs.includes('--fullscreen')) {
      gameArgs.push('--fullscreen');
    }

    return { jvmArgs, gameArgs };
  }

  private async launchProcess(
    javaPath: string,
    classpath: string,
    nativesPath: string,
    versionJson: any,
    options: LaunchOptions
  ): Promise<void> {
    const gameDir = options.gameDir ? join(this.minecraftDir, options.gameDir) : this.minecraftDir;
    this.ensureDir(gameDir);

    this.ensureDefaultOptions(gameDir);

    const { jvmArgs, gameArgs } = this.buildLaunchArgs(
      versionJson,
      options,
      gameDir,
      classpath,
      nativesPath
    );
    const mainClass = versionJson.mainClass || 'net.minecraft.client.main.Main';

    // Append user-provided custom JVM args right before the main class so
    // they win over profile defaults (e.g. custom -Xmx, -XX:+UseG1GC).
    const extra = options.extraJvmArgs?.filter((a) => a && a.trim().length > 0) || [];
    const args = [...jvmArgs, ...extra, mainClass, ...gameArgs];

    const mc = spawn(javaPath, args, {
      cwd: gameDir,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(options.env || {}) },
    });

    this.currentProcess = mc;

    const logsDir = join(app.getPath('userData'), 'logs');
    this.ensureDir(logsDir);
    const logPath = join(logsDir, `mc-${versionJson.id}-${Date.now()}.log`);
    const logStream = createWriteStream(logPath, { flags: 'a' });

    mc.stdout?.on('data', (d) => logStream.write(d));
    mc.stderr?.on('data', (d) => logStream.write(d));

    mc.on('error', (err) => {
      console.error('[Launcher] process error:', err);
      logStream.end();
    });

    mc.on('exit', (code) => {
      console.log('[Launcher] exited with code', code, 'log:', logPath);
      logStream.end();
      this.currentProcess = null;
      this.currentVersionId = null;
      this.setStatus('idle');
      this.emit('exit', { code, logPath });
    });
  }

  // ---------- Utilities ----------

  private ensureDir(p: string): void {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }

  private fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      this.httpGet(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  private downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmp = dest + '.part';
      const file = createWriteStream(tmp);
      const req = this.httpGet(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          file.close();
          try { unlinkSync(tmp); } catch { /* ignore */ }
          this.downloadFile(res.headers.location, dest).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          file.close();
          try { unlinkSync(tmp); } catch { /* ignore */ }
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              const fs = require('fs');
              fs.renameSync(tmp, dest);
              resolve();
            } catch (e) { reject(e); }
          });
        });
        res.on('error', (e) => {
          file.close();
          try { unlinkSync(tmp); } catch { /* ignore */ }
          reject(e);
        });
      });
      req.on('error', (err) => {
        file.close();
        try { unlinkSync(tmp); } catch { /* ignore */ }
        reject(err);
      });
      req.setTimeout(60000, () => {
        req.destroy(new Error(`Timeout for ${url}`));
      });
    });
  }

  private httpGet(url: string, cb: (res: IncomingMessage) => void) {
    const mod = url.startsWith('https:') ? https : http;
    return mod.get(url, { timeout: 60000 }, cb);
  }
}

let launcher: MinecraftLauncher | null = null;

export function getMinecraftLauncher(): MinecraftLauncher {
  if (!launcher) launcher = new MinecraftLauncher();
  return launcher;
}

export async function launchMinecraft(options: LaunchOptions): Promise<void> {
  return getMinecraftLauncher().launch(options);
}
