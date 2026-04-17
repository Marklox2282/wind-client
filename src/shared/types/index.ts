export interface User {
  id: string;
  username: string;
  uuid?: string;
  accessToken?: string;
  refreshToken?: string;
  type: 'microsoft' | 'offline';
  avatar?: string;
  email?: string;
}

export interface MinecraftVersion {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  time: string;
  releaseTime: string;
  complianceLevel: number;
  mainClass: string;
  minimumLauncherVersion?: number;
}

export interface Mod {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  fileName: string;
  filePath: string;
  enabled: boolean;
  type: 'forge' | 'fabric' | 'quilt' | 'neoforge';
  dependencies?: string[];
}

export interface Modpack {
  id: string;
  name: string;
  version: string;
  description?: string;
  minecraftVersion: string;
  loader: 'forge' | 'fabric' | 'quilt' | 'neoforge';
  loaderVersion: string;
  mods: Mod[];
  icon?: string;
  lastPlayed?: string;
}

export interface JavaVersion {
  path: string;
  version: string;
  architecture: 'x86' | 'x64';
  is64bit: boolean;
}

export interface LaunchSettings {
  ram: number;
  javaPath?: string;
  jvmArgs?: string;
  windowWidth: number;
  windowHeight: number;
  fullscreen: boolean;
}

export interface NewsItem {
  id: string;
  title: string;
  content: string;
  date: string;
  author?: string;
  imageUrl?: string;
  link?: string;
}

export interface LauncherSettings {
  theme: 'dark' | 'light';
  accentColor: string;
  backgroundType: 'static' | 'animated' | 'video';
  backgroundPath?: string;
  language: 'ru' | 'en';
  autoUpdate: boolean;
  discordRPC: boolean;
  startMaximized: boolean;
  minimizeToTray: boolean;
  /** Hex/CSS color tint for decorative cloud layers (login & splash). */
  cloudAccentColor?: string;
  /** Title shown on the startup loading screen. */
  loadingScreenTitle?: string;
  /** Subtitle / status line under the spinner while the launcher boots. */
  loadingScreenTagline?: string;
}

export interface AppState {
  user: User | null;
  selectedProfile: Modpack | null;
  profiles: Modpack[];
  news: NewsItem[];
  settings: LauncherSettings;
  isLaunching: boolean;
  launchProgress: number;
  launchStatus: string;
}
