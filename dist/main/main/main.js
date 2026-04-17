"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const oauthHandler_1 = require("./oauthHandler");
const minecraftLauncher_1 = require("./minecraftLauncher");
const modrinth_1 = require("./modrinth");
const modpackPresets_1 = require("./modpackPresets");
const curseforge_1 = require("./curseforge");
const path_1 = require("path");
const electron_updater_1 = require("electron-updater");
const electron_store_1 = __importDefault(require("electron-store"));
const store = new electron_store_1.default();
class WindClient {
    mainWindow = null;
    isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    updateCheckTimer = null;
    constructor() {
        this.initializeApp();
    }
    initializeApp() {
        electron_1.app.whenReady().then(() => {
            this.createMainWindow();
            this.setupMenu();
            this.setupIpcHandlers();
            this.setupAutoUpdater();
        });
        electron_1.app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                electron_1.app.quit();
            }
        });
        electron_1.app.on('activate', () => {
            if (electron_1.BrowserWindow.getAllWindows().length === 0) {
                this.createMainWindow();
            }
        });
    }
    createMainWindow() {
        this.mainWindow = new electron_1.BrowserWindow({
            width: 1200,
            height: 800,
            minWidth: 1000,
            minHeight: 600,
            frame: true,
            transparent: false,
            backgroundColor: '#0a0a0a',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: (0, path_1.join)(__dirname, 'preload.js'),
                webSecurity: !this.isDev,
            },
            icon: (0, path_1.join)(__dirname, '../../../assets/icon.png'),
            show: false,
        });
        this.mainWindow.loadFile((0, path_1.join)(__dirname, '../../renderer/index.html'));
        // DevTools is no longer auto-opened. Toggle manually with F12 / Ctrl+Shift+I.
        this.mainWindow.webContents.on('before-input-event', (_e, input) => {
            const isToggle = input.key === 'F12' ||
                (input.control && input.shift && (input.key === 'I' || input.key === 'i'));
            if (isToggle && input.type === 'keyDown') {
                this.mainWindow?.webContents.toggleDevTools();
            }
        });
        this.mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
            console.error('Failed to load content:', errorCode, errorDescription);
        });
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow?.show();
            if (store.get('settings.startMaximized', false)) {
                this.mainWindow?.maximize();
            }
        });
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            electron_1.shell.openExternal(url);
            return { action: 'deny' };
        });
    }
    setupMenu() {
        const template = [
            {
                label: 'Wind Client',
                submenu: [
                    {
                        label: 'About Wind Client',
                        click: () => {
                            electron_1.dialog.showMessageBox(this.mainWindow, {
                                type: 'info',
                                title: 'About Wind Client',
                                message: 'Wind Client',
                                detail: `Modern Minecraft Launcher v${electron_1.app.getVersion()}\nCreated with love for the Minecraft community.`,
                            });
                        },
                    },
                    { type: 'separator' },
                    {
                        label: 'Check for Updates',
                        click: () => this.runManualUpdateCheck(),
                    },
                    { type: 'separator' },
                    {
                        label: 'Quit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => electron_1.app.quit(),
                    },
                ],
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo', label: 'Undo' },
                    { role: 'redo', label: 'Redo' },
                    { type: 'separator' },
                    { role: 'cut', label: 'Cut' },
                    { role: 'copy', label: 'Copy' },
                    { role: 'paste', label: 'Paste' },
                    { role: 'selectAll', label: 'Select All' },
                ],
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize', label: 'Minimize' },
                    { role: 'close', label: 'Close' },
                ],
            },
        ];
        const menu = electron_1.Menu.buildFromTemplate(template);
        electron_1.Menu.setApplicationMenu(menu);
    }
    setupIpcHandlers() {
        oauthHandler_1.OAuthHandler.setupIpcHandlers();
        const resolveInstance = (id) => {
            const instances = store.get('minecraft_instances', []) || [];
            return instances.find((i) => i.id === id) || null;
        };
        (0, modrinth_1.setupModrinthHandlers)(resolveInstance);
        (0, modpackPresets_1.setupPresetHandlers)(resolveInstance);
        (0, curseforge_1.setupCurseForgeHandlers)(resolveInstance);
        // Forward launcher events to the renderer
        const launcher = (0, minecraftLauncher_1.getMinecraftLauncher)();
        launcher.on('progress', (p) => {
            this.mainWindow?.webContents.send('launcher:progress', p);
        });
        launcher.on('status', (s) => {
            this.mainWindow?.webContents.send('launcher:statusChanged', s);
        });
        launcher.on('exit', (e) => {
            this.mainWindow?.webContents.send('launcher:exit', e);
        });
        electron_1.ipcMain.handle('window:minimize', () => {
            this.mainWindow?.minimize();
        });
        electron_1.ipcMain.handle('window:maximize', () => {
            if (this.mainWindow?.isMaximized()) {
                this.mainWindow.unmaximize();
            }
            else {
                this.mainWindow?.maximize();
            }
        });
        electron_1.ipcMain.handle('window:close', () => {
            this.mainWindow?.close();
        });
        electron_1.ipcMain.handle('app:getVersion', () => {
            return electron_1.app.getVersion();
        });
        electron_1.ipcMain.handle('updater:checkForUpdates', async () => {
            return this.runUpdateCheckRequest();
        });
        electron_1.ipcMain.handle('updater:quitAndInstall', () => {
            electron_updater_1.autoUpdater.quitAndInstall(false, true);
        });
        electron_1.ipcMain.handle('app:getPath', (_, name) => {
            return electron_1.app.getPath(name);
        });
        electron_1.ipcMain.handle('store:get', (_, key) => {
            return store.get(key);
        });
        electron_1.ipcMain.handle('store:set', (_, key, value) => {
            store.set(key, value);
        });
        electron_1.ipcMain.handle('store:delete', (_, key) => {
            store.delete(key);
        });
        electron_1.ipcMain.handle('store:clear', () => {
            store.clear();
            console.log('Store cleared');
        });
        // Instance management IPC handlers
        electron_1.ipcMain.handle('launcher:getInstances', () => {
            const instances = store.get('minecraft_instances', []);
            console.log('launcher:getInstances returning:', JSON.stringify(instances).substring(0, 200));
            return instances;
        });
        electron_1.ipcMain.handle('launcher:saveInstance', (_, instance) => {
            console.log('launcher:saveInstance called with:', instance.name, instance.id);
            const instances = store.get('minecraft_instances', []) || [];
            const index = instances.findIndex((i) => i.id === instance.id);
            if (index >= 0) {
                instances[index] = instance;
            }
            else {
                instances.push(instance);
            }
            store.set('minecraft_instances', instances);
            console.log('Saved instances count:', instances.length);
        });
        electron_1.ipcMain.handle('launcher:deleteInstance', (_, id) => {
            console.log('launcher:deleteInstance called with id:', id);
            const instances = store.get('minecraft_instances', []) || [];
            store.set('minecraft_instances', instances.filter((i) => i.id !== id));
        });
        electron_1.ipcMain.handle('launcher:launchInstance', async (_, options) => {
            console.log('launcher:launchInstance:', options.versionId, options.modLoader || 'vanilla');
            try {
                await (0, minecraftLauncher_1.launchMinecraft)({
                    versionId: options.versionId,
                    username: options.username,
                    uuid: options.uuid,
                    accessToken: options.accessToken,
                    gameDir: options.gameDir,
                    minMemory: options.minMemory,
                    maxMemory: options.maxMemory,
                    width: options.width,
                    height: options.height,
                    fullscreen: options.fullscreen,
                    modLoader: options.modLoader,
                    modLoaderVersion: options.modLoaderVersion,
                    javaPath: options.javaPath,
                    extraJvmArgs: options.extraJvmArgs,
                    env: options.env,
                });
                return { success: true };
            }
            catch (error) {
                console.error('Error in launchInstance:', error);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });
        electron_1.ipcMain.handle('launcher:launchMinecraft', async (_, options) => {
            try {
                await (0, minecraftLauncher_1.launchMinecraft)(options);
                return { success: true, message: 'Minecraft launched successfully' };
            }
            catch (error) {
                console.error('Error in launchMinecraft:', error);
                return { success: false, error: error instanceof Error ? error.message : String(error) };
            }
        });
        electron_1.ipcMain.handle('launcher:stop', async () => {
            const stopped = (0, minecraftLauncher_1.getMinecraftLauncher)().stop();
            return { success: stopped };
        });
        electron_1.ipcMain.handle('launcher:getStatus', () => {
            return (0, minecraftLauncher_1.getMinecraftLauncher)().getStatus();
        });
        electron_1.ipcMain.handle('launcher:installMod', (_, instanceId, modInfo) => {
            console.log('Installing mod for instance:', instanceId, modInfo);
        });
        electron_1.ipcMain.handle('launcher:removeMod', (_, instanceId, modId) => {
            console.log('Removing mod from instance:', instanceId, modId);
        });
        // Fetch Minecraft versions from Mojang API
        electron_1.ipcMain.handle('launcher:getAvailableVersions', async () => {
            try {
                const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
                if (!response.ok)
                    throw new Error('Failed to fetch version manifest');
                const manifest = await response.json();
                return manifest.versions;
            }
            catch (error) {
                console.error('Failed to get available versions:', error);
                return [];
            }
        });
        electron_1.ipcMain.handle('launcher:getInstalledVersions', async () => {
            // TODO: Check local filesystem for installed versions
            return [];
        });
        electron_1.ipcMain.handle('launcher:downloadVersion', async (_, version) => {
            console.log('Downloading Minecraft version:', version);
            // TODO: Implement actual version download
            // For now, just log and return success
            return { success: true, message: 'Download started for ' + version };
        });
    }
    updaterEnabled() {
        if (this.isDev && process.env.WIND_FORCE_UPDATER !== '1')
            return false;
        return true;
    }
    sendUpdaterStatus(payload) {
        this.mainWindow?.webContents.send('updater:status', payload);
    }
    async runUpdateCheckRequest() {
        if (!this.updaterEnabled()) {
            return { ok: false, reason: 'dev' };
        }
        try {
            const r = await electron_updater_1.autoUpdater.checkForUpdates();
            return {
                ok: true,
                updateInfo: r?.updateInfo ?? undefined,
                isUpdateAvailable: r?.isUpdateAvailable ?? false,
            };
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.warn('[updater] checkForUpdates failed:', msg);
            return { ok: false, error: msg };
        }
    }
    async runManualUpdateCheck() {
        if (!this.updaterEnabled()) {
            await electron_1.dialog.showMessageBox({
                type: 'info',
                title: 'Updates',
                message: 'Auto-updates are disabled in development.',
                detail: 'Build a release (npm run package:win) and set package.json → repository to your GitHub repo, or set WIND_FORCE_UPDATER=1 to test the updater in dev.',
            });
            return;
        }
        const r = await this.runUpdateCheckRequest();
        if (!r.ok) {
            await electron_1.dialog.showMessageBox({
                type: 'warning',
                title: 'Update check failed',
                message: r.error || 'Unknown error',
            });
            return;
        }
        if (r.isUpdateAvailable && r.updateInfo?.version) {
            await electron_1.dialog.showMessageBox({
                type: 'info',
                title: 'Update available',
                message: `Version ${r.updateInfo.version} will download in the background.`,
                detail: 'You will be prompted when the update is ready to install.',
            });
            return;
        }
        await electron_1.dialog.showMessageBox({
            type: 'info',
            title: 'Wind Client',
            message: 'You are on the latest version.',
            detail: `Current version: ${electron_1.app.getVersion()}`,
        });
    }
    setupAutoUpdater() {
        electron_updater_1.autoUpdater.autoDownload = true;
        electron_updater_1.autoUpdater.allowPrerelease = false;
        electron_updater_1.autoUpdater.on('checking-for-update', () => {
            this.sendUpdaterStatus({ state: 'checking' });
        });
        electron_updater_1.autoUpdater.on('update-not-available', () => {
            this.sendUpdaterStatus({ state: 'not-available', version: electron_1.app.getVersion() });
        });
        electron_updater_1.autoUpdater.on('update-available', (info) => {
            this.sendUpdaterStatus({ state: 'available', version: info.version });
        });
        electron_updater_1.autoUpdater.on('download-progress', (p) => {
            this.sendUpdaterStatus({
                state: 'downloading',
                percent: p.percent,
                transferred: p.transferred,
                total: p.total,
            });
        });
        electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
            this.sendUpdaterStatus({ state: 'downloaded', version: info.version });
            electron_1.dialog
                .showMessageBox(this.mainWindow, {
                type: 'info',
                title: 'Update Ready',
                message: `Version ${info.version} is ready to install.`,
                detail: 'Restart now to finish updating Wind Client.',
                buttons: ['Restart Now', 'Later'],
                defaultId: 0,
                cancelId: 1,
            })
                .then((result) => {
                if (result.response === 0) {
                    electron_updater_1.autoUpdater.quitAndInstall(false, true);
                }
            });
        });
        electron_updater_1.autoUpdater.on('error', (err) => {
            console.warn('[updater] error:', err);
            this.sendUpdaterStatus({
                state: 'error',
                message: err.message,
            });
        });
        const schedule = () => {
            if (!this.updaterEnabled())
                return;
            if (!store.get('settings.autoUpdate', true))
                return;
            this.runUpdateCheckRequest().catch(() => { });
        };
        schedule();
        if (this.updateCheckTimer)
            clearInterval(this.updateCheckTimer);
        this.updateCheckTimer = setInterval(schedule, 4 * 60 * 60 * 1000);
    }
}
new WindClient();
