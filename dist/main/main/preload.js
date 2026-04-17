"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.electronAPI = void 0;
const electron_1 = require("electron");
exports.electronAPI = {
    app: {
        getVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
    },
    updater: {
        checkForUpdates: () => electron_1.ipcRenderer.invoke('updater:checkForUpdates'),
        quitAndInstall: () => electron_1.ipcRenderer.invoke('updater:quitAndInstall'),
        onStatus: (cb) => {
            const fn = (_, data) => cb(data);
            electron_1.ipcRenderer.on('updater:status', fn);
            return () => electron_1.ipcRenderer.removeListener('updater:status', fn);
        },
    },
    window: {
        minimize: () => electron_1.ipcRenderer.invoke('window:minimize'),
        maximize: () => electron_1.ipcRenderer.invoke('window:maximize'),
        close: () => electron_1.ipcRenderer.invoke('window:close'),
    },
    store: {
        get: (key) => electron_1.ipcRenderer.invoke('store:get', key),
        set: (key, value) => electron_1.ipcRenderer.invoke('store:set', key, value),
        delete: (key) => electron_1.ipcRenderer.invoke('store:delete', key),
        clear: () => electron_1.ipcRenderer.invoke('store:clear'),
    },
    launcher: {
        getInstalledVersions: () => electron_1.ipcRenderer.invoke('launcher:getInstalledVersions'),
        getAvailableVersions: () => electron_1.ipcRenderer.invoke('launcher:getAvailableVersions'),
        downloadVersion: (versionId) => electron_1.ipcRenderer.invoke('launcher:downloadVersion', versionId),
        launchMinecraft: (options) => electron_1.ipcRenderer.invoke('launcher:launchMinecraft', options),
        stop: () => electron_1.ipcRenderer.invoke('launcher:stop'),
        getStatus: () => electron_1.ipcRenderer.invoke('launcher:getStatus'),
        getInstances: () => electron_1.ipcRenderer.invoke('launcher:getInstances'),
        saveInstance: (instance) => electron_1.ipcRenderer.invoke('launcher:saveInstance', instance),
        deleteInstance: (id) => electron_1.ipcRenderer.invoke('launcher:deleteInstance', id),
        launchInstance: (options) => electron_1.ipcRenderer.invoke('launcher:launchInstance', options),
        installMod: (instanceId, modInfo) => electron_1.ipcRenderer.invoke('launcher:installMod', instanceId, modInfo),
        removeMod: (instanceId, modId) => electron_1.ipcRenderer.invoke('launcher:removeMod', instanceId, modId),
        onProgress: (cb) => {
            const listener = (_, data) => cb(data);
            electron_1.ipcRenderer.on('launcher:progress', listener);
            return () => electron_1.ipcRenderer.removeListener('launcher:progress', listener);
        },
        onStatusChanged: (cb) => {
            const listener = (_, data) => cb(data);
            electron_1.ipcRenderer.on('launcher:statusChanged', listener);
            return () => electron_1.ipcRenderer.removeListener('launcher:statusChanged', listener);
        },
        onExit: (cb) => {
            const listener = (_, data) => cb(data);
            electron_1.ipcRenderer.on('launcher:exit', listener);
            return () => electron_1.ipcRenderer.removeListener('launcher:exit', listener);
        },
    },
    oauth: {
        authenticate: (opts) => electron_1.ipcRenderer.invoke('oauth:authenticate', opts),
        signOut: () => electron_1.ipcRenderer.invoke('oauth:signOut'),
    },
    modrinth: {
        search: (params) => electron_1.ipcRenderer.invoke('modrinth:search', params),
        getProject: (id) => electron_1.ipcRenderer.invoke('modrinth:getProject', id),
        getVersions: (id, params) => electron_1.ipcRenderer.invoke('modrinth:getVersions', id, params || {}),
        getVersion: (versionId) => electron_1.ipcRenderer.invoke('modrinth:getVersion', versionId),
        installVersion: (params) => electron_1.ipcRenderer.invoke('modrinth:installVersion', params),
    },
    mods: {
        list: (instanceId) => electron_1.ipcRenderer.invoke('mods:list', instanceId),
        toggle: (instanceId, rawFilename) => electron_1.ipcRenderer.invoke('mods:toggle', instanceId, rawFilename),
        delete: (instanceId, rawFilename) => electron_1.ipcRenderer.invoke('mods:delete', instanceId, rawFilename),
    },
    curseforge: {
        hasKey: () => electron_1.ipcRenderer.invoke('curseforge:hasKey'),
        setKey: (key) => electron_1.ipcRenderer.invoke('curseforge:setKey', key),
        search: (params) => electron_1.ipcRenderer.invoke('curseforge:search', params),
        getMod: (modId) => electron_1.ipcRenderer.invoke('curseforge:getMod', modId),
        getFiles: (params) => electron_1.ipcRenderer.invoke('curseforge:getFiles', params),
        installFile: (params) => electron_1.ipcRenderer.invoke('curseforge:installFile', params),
    },
    presets: {
        installRecommended: (instanceId) => electron_1.ipcRenderer.invoke('presets:installRecommended', instanceId),
    },
    content: {
        list: (instanceId, kind) => electron_1.ipcRenderer.invoke('content:list', instanceId, kind),
        toggle: (instanceId, rawFilename, kind) => electron_1.ipcRenderer.invoke('content:toggle', instanceId, rawFilename, kind),
        delete: (instanceId, rawFilename, kind) => electron_1.ipcRenderer.invoke('content:delete', instanceId, rawFilename, kind),
    },
};
electron_1.contextBridge.exposeInMainWorld('electronAPI', exports.electronAPI);
