import { contextBridge, ipcRenderer } from 'electron';

export const electronAPI = {
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion') as Promise<string>,
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:checkForUpdates'),
    quitAndInstall: () => ipcRenderer.invoke('updater:quitAndInstall'),
    onStatus: (cb: (payload: Record<string, unknown>) => void) => {
      const fn = (_: unknown, data: Record<string, unknown>) => cb(data);
      ipcRenderer.on('updater:status', fn);
      return () => ipcRenderer.removeListener('updater:status', fn);
    },
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    clear: () => ipcRenderer.invoke('store:clear'),
  },
  launcher: {
    getInstalledVersions: () => ipcRenderer.invoke('launcher:getInstalledVersions'),
    getAvailableVersions: () => ipcRenderer.invoke('launcher:getAvailableVersions'),
    downloadVersion: (versionId: string) =>
      ipcRenderer.invoke('launcher:downloadVersion', versionId),
    launchMinecraft: (options: any) => ipcRenderer.invoke('launcher:launchMinecraft', options),
    stop: () => ipcRenderer.invoke('launcher:stop'),
    getStatus: () => ipcRenderer.invoke('launcher:getStatus'),
    getInstances: () => ipcRenderer.invoke('launcher:getInstances'),
    saveInstance: (instance: any) => ipcRenderer.invoke('launcher:saveInstance', instance),
    deleteInstance: (id: string) => ipcRenderer.invoke('launcher:deleteInstance', id),
    launchInstance: (options: any) => ipcRenderer.invoke('launcher:launchInstance', options),
    installMod: (instanceId: string, modInfo: any) =>
      ipcRenderer.invoke('launcher:installMod', instanceId, modInfo),
    removeMod: (instanceId: string, modId: string) =>
      ipcRenderer.invoke('launcher:removeMod', instanceId, modId),
    onProgress: (cb: (p: any) => void) => {
      const listener = (_: any, data: any) => cb(data);
      ipcRenderer.on('launcher:progress', listener);
      return () => ipcRenderer.removeListener('launcher:progress', listener);
    },
    onStatusChanged: (cb: (s: any) => void) => {
      const listener = (_: any, data: any) => cb(data);
      ipcRenderer.on('launcher:statusChanged', listener);
      return () => ipcRenderer.removeListener('launcher:statusChanged', listener);
    },
    onExit: (cb: (e: any) => void) => {
      const listener = (_: any, data: any) => cb(data);
      ipcRenderer.on('launcher:exit', listener);
      return () => ipcRenderer.removeListener('launcher:exit', listener);
    },
  },
  oauth: {
    authenticate: (opts?: { forceAccountPicker?: boolean }) =>
      ipcRenderer.invoke('oauth:authenticate', opts),
    signOut: () => ipcRenderer.invoke('oauth:signOut'),
  },
  modrinth: {
    search: (params: any) => ipcRenderer.invoke('modrinth:search', params),
    getProject: (id: string) => ipcRenderer.invoke('modrinth:getProject', id),
    getVersions: (id: string, params?: any) =>
      ipcRenderer.invoke('modrinth:getVersions', id, params || {}),
    getVersion: (versionId: string) => ipcRenderer.invoke('modrinth:getVersion', versionId),
    installVersion: (params: {
      instanceId: string;
      versionId: string;
      kind?: 'mod' | 'shader' | 'resourcepack';
      withDependencies?: boolean;
    }) => ipcRenderer.invoke('modrinth:installVersion', params),
  },
  mods: {
    list: (instanceId: string) => ipcRenderer.invoke('mods:list', instanceId),
    toggle: (instanceId: string, rawFilename: string) =>
      ipcRenderer.invoke('mods:toggle', instanceId, rawFilename),
    delete: (instanceId: string, rawFilename: string) =>
      ipcRenderer.invoke('mods:delete', instanceId, rawFilename),
  },
  curseforge: {
    hasKey: () => ipcRenderer.invoke('curseforge:hasKey'),
    setKey: (key: string) => ipcRenderer.invoke('curseforge:setKey', key),
    search: (params: any) => ipcRenderer.invoke('curseforge:search', params),
    getMod: (modId: number) => ipcRenderer.invoke('curseforge:getMod', modId),
    getFiles: (params: any) => ipcRenderer.invoke('curseforge:getFiles', params),
    installFile: (params: {
      instanceId: string;
      modId: number;
      fileId: number;
      kind?: 'mod' | 'shader' | 'resourcepack';
    }) => ipcRenderer.invoke('curseforge:installFile', params),
  },
  presets: {
    installRecommended: (instanceId: string) =>
      ipcRenderer.invoke('presets:installRecommended', instanceId),
  },
  content: {
    list: (instanceId: string, kind: 'mod' | 'shader' | 'resourcepack') =>
      ipcRenderer.invoke('content:list', instanceId, kind),
    toggle: (instanceId: string, rawFilename: string, kind: 'mod' | 'shader' | 'resourcepack') =>
      ipcRenderer.invoke('content:toggle', instanceId, rawFilename, kind),
    delete: (instanceId: string, rawFilename: string, kind: 'mod' | 'shader' | 'resourcepack') =>
      ipcRenderer.invoke('content:delete', instanceId, rawFilename, kind),
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
