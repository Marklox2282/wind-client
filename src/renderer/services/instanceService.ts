export interface MinecraftInstance {
  id: string;
  name: string;
  version: string;
  modLoader: 'vanilla' | 'fabric' | 'forge' | 'quilt';
  modLoaderVersion?: string;
  gameDir: string;
  javaVersion?: string;
  javaPath?: string;
  /** Extra JVM arguments, space-separated. Appended after the profile args. */
  jvmArgs?: string;
  /** Custom environment variables, one per line `KEY=VALUE`. */
  envVars?: string;
  minMemory?: number;
  maxMemory?: number;
  windowWidth?: number;
  windowHeight?: number;
  fullscreen?: boolean;
  icon?: string;
  lastPlayed?: string;
  totalTime?: number;
  mods: ModInfo[];
  resourcePacks: ResourcePackInfo[];
  shaderPacks: ShaderPackInfo[];
  created: string;
  updated: string;
}

export interface ModInfo {
  id: string;
  name: string;
  version: string;
  fileName: string;
  enabled: boolean;
  dependencies?: string[];
  description?: string;
  author?: string;
  downloadUrl?: string;
  fileSize?: number;
}

export interface ResourcePackInfo {
  id: string;
  name: string;
  fileName: string;
  enabled: boolean;
  description?: string;
  fileSize?: number;
}

export interface ShaderPackInfo {
  id: string;
  name: string;
  fileName: string;
  enabled: boolean;
  compatibleVersion?: string;
  description?: string;
  fileSize?: number;
}

export interface CreateInstanceOptions {
  name: string;
  version: string;
  modLoader: 'vanilla' | 'fabric' | 'forge' | 'quilt';
  modLoaderVersion?: string;
  icon?: string;
}

export class InstanceService {
  private static readonly INSTANCES_KEY = 'minecraft_instances';
  private static readonly DEFAULT_SETTINGS = {
    minMemory: 1024,
    maxMemory: 4096,
    windowWidth: 854,
    windowHeight: 480,
    fullscreen: false
  };
  private static isLaunching = false;

  static async getInstances(): Promise<MinecraftInstance[]> {
    try {
      console.log('InstanceService.getInstances() called');
      if (window.electronAPI) {
        const result = await window.electronAPI.launcher.getInstances();
        console.log('InstanceService.getInstances() got:', result?.length, 'instances');
        return result || [];
      }

      // Fallback to localStorage
      const instances = localStorage.getItem(this.INSTANCES_KEY);
      return instances ? JSON.parse(instances) : [];
    } catch (error) {
      console.error('Failed to get instances:', error);
      return [];
    }
  }

  static async createInstance(options: CreateInstanceOptions): Promise<MinecraftInstance> {
    try {
      console.log('InstanceService.createInstance() called with:', options.name, options.version);
      const instance: MinecraftInstance = {
        id: this.generateId(),
        name: options.name,
        version: options.version,
        modLoader: options.modLoader,
        modLoaderVersion: options.modLoaderVersion,
        gameDir: `instances/${this.sanitizeName(options.name)}`,
        ...this.DEFAULT_SETTINGS,
        icon: options.icon || 'grass',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        mods: [],
        resourcePacks: [],
        shaderPacks: []
      };

      const instances = await this.getInstances();
      instances.push(instance);

      if (window.electronAPI) {
        await window.electronAPI.launcher.saveInstance(instance);
      } else {
        localStorage.setItem(this.INSTANCES_KEY, JSON.stringify(instances));
      }

      return instance;
    } catch (error) {
      console.error('Failed to create instance:', error);
      throw error;
    }
  }

  static async updateInstance(id: string, updates: Partial<MinecraftInstance>): Promise<MinecraftInstance> {
    try {
      const instances = await this.getInstances();
      const index = instances.findIndex(i => i.id === id);
      
      if (index === -1) {
        throw new Error('Instance not found');
      }

      instances[index] = {
        ...instances[index],
        ...updates,
        updated: new Date().toISOString()
      };

      if (window.electronAPI) {
        await window.electronAPI.launcher.saveInstance(instances[index]);
      } else {
        localStorage.setItem(this.INSTANCES_KEY, JSON.stringify(instances));
      }

      return instances[index];
    } catch (error) {
      console.error('Failed to update instance:', error);
      throw error;
    }
  }

  static async deleteInstance(id: string): Promise<void> {
    try {
      const instances = await this.getInstances();
      const filteredInstances = instances.filter(i => i.id !== id);

      if (window.electronAPI) {
        await window.electronAPI.launcher.deleteInstance(id);
      } else {
        localStorage.setItem(this.INSTANCES_KEY, JSON.stringify(filteredInstances));
      }
    } catch (error) {
      console.error('Failed to delete instance:', error);
      throw error;
    }
  }

  static async duplicateInstance(id: string, newName: string): Promise<MinecraftInstance> {
    try {
      const instances = await this.getInstances();
      const originalInstance = instances.find(i => i.id === id);
      
      if (!originalInstance) {
        throw new Error('Instance not found');
      }

      const duplicated: MinecraftInstance = {
        ...originalInstance,
        id: this.generateId(),
        name: newName,
        gameDir: `instances/${this.sanitizeName(newName)}`,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        lastPlayed: undefined,
        totalTime: 0
      };

      instances.push(duplicated);

      if (window.electronAPI) {
        await window.electronAPI.launcher.saveInstance(duplicated);
      } else {
        localStorage.setItem(this.INSTANCES_KEY, JSON.stringify(instances));
      }

      return duplicated;
    } catch (error) {
      console.error('Failed to duplicate instance:', error);
      throw error;
    }
  }

  static async launchInstance(id: string): Promise<void> {
    if (this.isLaunching) {
      console.log('Launch already in progress, skipping...');
      return;
    }
    this.isLaunching = true;

    try {
      const instances = await this.getInstances();
      const instance = instances.find((i) => i.id === id);
      if (!instance) throw new Error('Instance not found');

      await this.updateInstance(id, {
        lastPlayed: new Date().toISOString(),
        totalTime: (instance.totalTime || 0) + 1,
      });

      let username = 'Player';
      let userUuid = '';
      let accessToken = '';

      if (window.electronAPI) {
        username = (await window.electronAPI.store.get('currentUser')) || 'Player';
        userUuid = (await window.electronAPI.store.get('userUuid')) || '';
        accessToken = (await window.electronAPI.store.get('accessToken')) || '';
      } else {
        username = localStorage.getItem('currentUser') || 'Player';
        userUuid = localStorage.getItem('userUuid') || '';
        accessToken = localStorage.getItem('accessToken') || '';
      }

      const launchOptions = {
        versionId: instance.version,
        username,
        uuid: userUuid || this.generateUUID(),
        accessToken: accessToken || 'offline-token',
        gameDir: instance.gameDir,
        minMemory: instance.minMemory,
        maxMemory: instance.maxMemory,
        width: instance.windowWidth,
        height: instance.windowHeight,
        fullscreen: instance.fullscreen,
        modLoader: instance.modLoader,
        modLoaderVersion: instance.modLoaderVersion,
        javaPath: instance.javaPath || undefined,
        extraJvmArgs: parseJvmArgs(instance.jvmArgs),
        env: parseEnvVars(instance.envVars),
      };

      if (!window.electronAPI) {
        console.log('Launching instance (simulated):', launchOptions);
        return;
      }

      const result = await window.electronAPI.launcher.launchInstance(launchOptions);
      if (result && result.success === false) {
        throw new Error(result.error || 'Launch failed');
      }
    } finally {
      setTimeout(() => {
        this.isLaunching = false;
      }, 1500);
    }
  }

  static async getAvailableModLoaders(_version: string): Promise<Array<{type: string; versions: string[]}>> {
    try {
      // This would fetch from mod loader APIs
      // For now, return common versions
      return [
        {
          type: 'fabric',
          versions: ['0.14.24', '0.14.23', '0.14.22', '0.14.21', '0.14.20']
        },
        {
          type: 'forge',
          versions: ['45.0.43', '45.0.42', '45.0.41', '44.2.11', '44.2.10']
        },
        {
          type: 'quilt',
          versions: ['0.23.0', '0.22.0', '0.21.0', '0.20.0', '0.19.0']
        }
      ];
    } catch (error) {
      console.error('Failed to get mod loaders:', error);
      return [];
    }
  }

  static async installMod(instanceId: string, modInfo: ModInfo): Promise<void> {
    try {
      const instance = await this.getInstance(instanceId);
      if (!instance) {
        throw new Error('Instance not found');
      }

      // Add mod to instance
      const updatedMods = [...instance.mods, modInfo];
      await this.updateInstance(instanceId, { mods: updatedMods });

      // Download and install mod files
      if (window.electronAPI) {
        await window.electronAPI.launcher.installMod(instanceId, modInfo);
      }
    } catch (error) {
      console.error('Failed to install mod:', error);
      throw error;
    }
  }

  static async removeMod(instanceId: string, modId: string): Promise<void> {
    try {
      const instance = await this.getInstance(instanceId);
      if (!instance) {
        throw new Error('Instance not found');
      }

      const updatedMods = instance.mods.filter(mod => mod.id !== modId);
      await this.updateInstance(instanceId, { mods: updatedMods });

      if (window.electronAPI) {
        await window.electronAPI.launcher.removeMod(instanceId, modId);
      }
    } catch (error) {
      console.error('Failed to remove mod:', error);
      throw error;
    }
  }

  static async toggleMod(instanceId: string, modId: string): Promise<void> {
    try {
      const instance = await this.getInstance(instanceId);
      if (!instance) {
        throw new Error('Instance not found');
      }

      const updatedMods = instance.mods.map(mod => 
        mod.id === modId ? { ...mod, enabled: !mod.enabled } : mod
      );
      await this.updateInstance(instanceId, { mods: updatedMods });
    } catch (error) {
      console.error('Failed to toggle mod:', error);
      throw error;
    }
  }

  private static async getInstance(id: string): Promise<MinecraftInstance | null> {
    const instances = await this.getInstances();
    return instances.find(i => i.id === id) || null;
  }

  private static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private static sanitizeName(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  private static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  static async getInstanceIcon(instanceId: string): Promise<string> {
    try {
      const instance = await this.getInstance(instanceId);
      return instance?.icon || 'grass';
    } catch (error) {
      console.error('Failed to get instance icon:', error);
      return 'grass';
    }
  }

  static async setInstanceIcon(instanceId: string, icon: string): Promise<void> {
    try {
      await this.updateInstance(instanceId, { icon });
    } catch (error) {
      console.error('Failed to set instance icon:', error);
      throw error;
    }
  }
}

/**
 * Split a JVM-args string like `-Xmx4G -XX:+UseG1GC "-Dfoo=bar baz"` into an
 * array, respecting double-quoted segments.
 */
export function parseJvmArgs(raw?: string): string[] {
  if (!raw || !raw.trim()) return [];
  const result: string[] = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;
    if (raw[i] === '"') {
      i++;
      let start = i;
      while (i < raw.length && raw[i] !== '"') i++;
      result.push(raw.slice(start, i));
      i++;
    } else {
      let start = i;
      while (i < raw.length && !/\s/.test(raw[i])) i++;
      result.push(raw.slice(start, i));
    }
  }
  return result;
}

/** Parse "KEY=VALUE" on each line into a plain object. */
export function parseEnvVars(raw?: string): Record<string, string> {
  if (!raw) return {};
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}
