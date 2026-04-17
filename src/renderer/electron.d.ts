export {};

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

interface UpdaterCheckResult {
  ok: boolean;
  reason?: string;
  updateInfo?: { version?: string; releaseDate?: string };
  isUpdateAvailable?: boolean;
  error?: string;
}

interface ElectronAPI {
  app: {
    getVersion: () => Promise<string>;
  };
  updater: {
    checkForUpdates: () => Promise<UpdaterCheckResult>;
    quitAndInstall: () => Promise<void>;
    onStatus: (cb: (payload: Record<string, unknown>) => void) => () => void;
  };
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
    clear: () => Promise<void>;
  };
  launcher: {
    getInstalledVersions: () => Promise<any[]>;
    getAvailableVersions: () => Promise<any[]>;
    downloadVersion: (versionId: string) => Promise<any>;
    launchMinecraft: (options: any) => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    getStatus: () => Promise<{ status: LauncherStatus; versionId: string | null }>;
    getInstances: () => Promise<any[]>;
    saveInstance: (instance: any) => Promise<void>;
    deleteInstance: (id: string) => Promise<void>;
    launchInstance: (options: any) => Promise<any>;
    installMod: (instanceId: string, modInfo: any) => Promise<void>;
    removeMod: (instanceId: string, modId: string) => Promise<void>;
    onProgress: (cb: (p: LauncherProgress) => void) => () => void;
    onStatusChanged: (
      cb: (s: { status: LauncherStatus; versionId: string | null }) => void
    ) => () => void;
    onExit: (cb: (e: { code: number | null; logPath: string }) => void) => () => void;
  };
  oauth: {
    authenticate: (opts?: { forceAccountPicker?: boolean }) => Promise<{
      username: string;
      uuid: string;
      accessToken: string;
      refreshToken: string;
      ownsMinecraft: boolean;
      minecraftProfile?: any;
    }>;
    signOut: () => Promise<{ success: boolean }>;
  };
  modrinth: {
    search: (params: {
      query?: string;
      loaders?: string[];
      gameVersions?: string[];
      projectType?: string;
      limit?: number;
      offset?: number;
      index?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
    }) => Promise<{
      hits: ModrinthHit[];
      total_hits: number;
      offset: number;
      limit: number;
    }>;
    getProject: (id: string) => Promise<ModrinthProject>;
    getVersions: (
      id: string,
      params?: { loaders?: string[]; gameVersions?: string[]; kind?: ContentKind }
    ) => Promise<ModrinthVersion[]>;
    getVersion: (versionId: string) => Promise<ModrinthVersion>;
    installVersion: (params: {
      instanceId: string;
      versionId: string;
      kind?: ContentKind;
      withDependencies?: boolean;
    }) => Promise<{ success: boolean; installed: Array<{ name: string; path: string }> }>;
  };
  mods: {
    list: (instanceId: string) => Promise<ContentFile[]>;
    toggle: (instanceId: string, rawFilename: string) => Promise<{ success: boolean }>;
    delete: (instanceId: string, rawFilename: string) => Promise<{ success: boolean }>;
  };
  curseforge: {
    hasKey: () => Promise<{ hasKey: boolean; preview?: string | null; length?: number }>;
    setKey: (key: string) => Promise<{ success: boolean; hasKey: boolean }>;
    search: (params: {
      query?: string;
      kind?: ContentKind;
      loader?: string;
      gameVersion?: string;
      pageSize?: number;
      index?: number;
      sortField?: number;
    }) => Promise<{ data: CurseForgeMod[]; pagination: { index: number; pageSize: number; resultCount: number; totalCount: number } }>;
    getMod: (modId: number) => Promise<{ data: CurseForgeMod }>;
    getFiles: (params: {
      modId: number;
      loader?: string;
      gameVersion?: string;
      kind?: ContentKind;
    }) => Promise<{ data: CurseForgeFile[] }>;
    installFile: (params: {
      instanceId: string;
      modId: number;
      fileId: number;
      kind?: ContentKind;
    }) => Promise<{ success: boolean; installed: Array<{ name: string; path: string }> }>;
  };
  presets: {
    installRecommended: (instanceId: string) => Promise<{
      success: boolean;
      installed: string[];
      skipped: Array<{ slug: string; reason: string }>;
      shader: string | null;
    }>;
  };
  content: {
    list: (instanceId: string, kind: ContentKind) => Promise<ContentFile[]>;
    toggle: (
      instanceId: string,
      rawFilename: string,
      kind: ContentKind
    ) => Promise<{ success: boolean }>;
    delete: (
      instanceId: string,
      rawFilename: string,
      kind: ContentKind
    ) => Promise<{ success: boolean }>;
  };
}

export type ContentKind = 'mod' | 'shader' | 'resourcepack';

export interface CurseForgeMod {
  id: number;
  name: string;
  slug: string;
  summary: string;
  downloadCount: number;
  logo?: { url: string; thumbnailUrl?: string } | null;
  authors: Array<{ name: string }>;
  links?: { websiteUrl?: string };
  latestFilesIndexes?: Array<{
    fileId: number;
    gameVersion: string;
    modLoader?: number;
    filename: string;
  }>;
}

export interface CurseForgeFile {
  id: number;
  modId: number;
  displayName: string;
  fileName: string;
  releaseType: number; // 1=release, 2=beta, 3=alpha
  fileDate: string;
  fileLength: number;
  downloadUrl: string | null;
  gameVersions: string[];
  dependencies: Array<{ modId: number; relationType: number }>;
}

export interface ContentFile {
  filename: string;
  rawFilename: string;
  enabled: boolean;
  size: number;
  mtime: number;
}

export interface ModrinthHit {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  categories: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
  author: string;
  project_type: string;
  latest_version?: string;
  versions?: string[];
  display_categories?: string[];
}

export interface ModrinthProject {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  categories: string[];
  downloads: number;
  followers: number;
  icon_url: string | null;
  project_type: string;
  game_versions: string[];
  loaders: string[];
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  loaders: string[];
  version_type: 'release' | 'beta' | 'alpha';
  date_published: string;
  downloads: number;
  files: Array<{
    url: string;
    filename: string;
    primary: boolean;
    size: number;
  }>;
  dependencies: Array<{
    version_id: string | null;
    project_id: string | null;
    dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
  }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
