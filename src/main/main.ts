import { app, BrowserWindow, ipcMain, Menu, shell, dialog } from 'electron';
import { OAuthHandler } from './oauthHandler';
import { launchMinecraft, getMinecraftLauncher } from './minecraftLauncher';
import { setupModrinthHandlers } from './modrinth';
import { setupPresetHandlers } from './modpackPresets';
import { setupCurseForgeHandlers } from './curseforge';
import { join } from 'path';
import { autoUpdater } from 'electron-updater';
import Store from 'electron-store';

const store = new Store();

class WindClient {
  private mainWindow: BrowserWindow | null = null;
  private isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  private updateCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.initializeApp();
  }

  private initializeApp(): void {
    app.whenReady().then(() => {
      this.createMainWindow();
      this.setupMenu();
      this.setupIpcHandlers();
      this.setupAutoUpdater();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createMainWindow();
      }
    });
  }

  private createMainWindow(): void {
    this.mainWindow = new BrowserWindow({
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
        preload: join(__dirname, 'preload.js'),
        webSecurity: !this.isDev,
      },
      icon: join(__dirname, '../../../assets/icon.png'),
      show: false,
    });

    this.mainWindow.loadFile(join(__dirname, '../../renderer/index.html'));

    // DevTools is no longer auto-opened. Toggle manually with F12 / Ctrl+Shift+I.
    this.mainWindow.webContents.on('before-input-event', (_e, input) => {
      const isToggle =
        input.key === 'F12' ||
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
      shell.openExternal(url);
      return { action: 'deny' };
    });
  }

  private setupMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: 'Wind Client',
        submenu: [
          {
            label: 'About Wind Client',
            click: () => {
              dialog.showMessageBox(this.mainWindow!, {
                type: 'info',
                title: 'About Wind Client',
                message: 'Wind Client',
                detail: `Modern Minecraft Launcher v${app.getVersion()}\nCreated with love for the Minecraft community.`,
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
            click: () => app.quit(),
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

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  private setupIpcHandlers(): void {
    OAuthHandler.setupIpcHandlers();

    const resolveInstance = (id: string) => {
      const instances: any[] = (store.get('minecraft_instances', []) as any[]) || [];
      return instances.find((i) => i.id === id) || null;
    };
    setupModrinthHandlers(resolveInstance);
    setupPresetHandlers(resolveInstance);
    setupCurseForgeHandlers(resolveInstance);

    // Forward launcher events to the renderer
    const launcher = getMinecraftLauncher();
    launcher.on('progress', (p) => {
      this.mainWindow?.webContents.send('launcher:progress', p);
    });
    launcher.on('status', (s) => {
      this.mainWindow?.webContents.send('launcher:statusChanged', s);
    });
    launcher.on('exit', (e) => {
      this.mainWindow?.webContents.send('launcher:exit', e);
    });
    
    ipcMain.handle('window:minimize', () => {
      this.mainWindow?.minimize();
    });

    ipcMain.handle('window:maximize', () => {
      if (this.mainWindow?.isMaximized()) {
        this.mainWindow.unmaximize();
      } else {
        this.mainWindow?.maximize();
      }
    });

    ipcMain.handle('window:close', () => {
      this.mainWindow?.close();
    });

    ipcMain.handle('app:getVersion', () => {
      return app.getVersion();
    });

    ipcMain.handle('updater:checkForUpdates', async () => {
      return this.runUpdateCheckRequest();
    });

    ipcMain.handle('updater:quitAndInstall', () => {
      autoUpdater.quitAndInstall(false, true);
    });

    ipcMain.handle('app:getPath', (_, name: string) => {
      return app.getPath(name as any);
    });

    ipcMain.handle('store:get', (_, key: string) => {
      return store.get(key);
    });

    ipcMain.handle('store:set', (_, key: string, value: any) => {
      store.set(key, value);
    });

    ipcMain.handle('store:delete', (_, key: string) => {
      store.delete(key);
    });

    ipcMain.handle('store:clear', () => {
      store.clear();
      console.log('Store cleared');
    });

    // Instance management IPC handlers
    ipcMain.handle('launcher:getInstances', () => {
      const instances = store.get('minecraft_instances', []);
      console.log('launcher:getInstances returning:', JSON.stringify(instances).substring(0, 200));
      return instances;
    });

    ipcMain.handle('launcher:saveInstance', (_, instance: any) => {
      console.log('launcher:saveInstance called with:', instance.name, instance.id);
      const instances: any[] = (store.get('minecraft_instances', []) as any[]) || [];
      const index = instances.findIndex((i: any) => i.id === instance.id);
      if (index >= 0) {
        instances[index] = instance;
      } else {
        instances.push(instance);
      }
      store.set('minecraft_instances', instances);
      console.log('Saved instances count:', instances.length);
    });

    ipcMain.handle('launcher:deleteInstance', (_, id: string) => {
      console.log('launcher:deleteInstance called with id:', id);
      const instances: any[] = (store.get('minecraft_instances', []) as any[]) || [];
      store.set('minecraft_instances', instances.filter((i: any) => i.id !== id));
    });

    ipcMain.handle('launcher:launchInstance', async (_, options: any) => {
      console.log('launcher:launchInstance:', options.versionId, options.modLoader || 'vanilla');
      try {
        await launchMinecraft({
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
      } catch (error) {
        console.error('Error in launchInstance:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('launcher:launchMinecraft', async (_, options: any) => {
      try {
        await launchMinecraft(options);
        return { success: true, message: 'Minecraft launched successfully' };
      } catch (error) {
        console.error('Error in launchMinecraft:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    });

    ipcMain.handle('launcher:stop', async () => {
      const stopped = getMinecraftLauncher().stop();
      return { success: stopped };
    });

    ipcMain.handle('launcher:getStatus', () => {
      return getMinecraftLauncher().getStatus();
    });

    ipcMain.handle('launcher:installMod', (_, instanceId: string, modInfo: any) => {
      console.log('Installing mod for instance:', instanceId, modInfo);
    });

    ipcMain.handle('launcher:removeMod', (_, instanceId: string, modId: string) => {
      console.log('Removing mod from instance:', instanceId, modId);
    });

    // Fetch Minecraft versions from Mojang API
    ipcMain.handle('launcher:getAvailableVersions', async () => {
      try {
        const response = await fetch('https://launchermeta.mojang.com/mc/game/version_manifest.json');
        if (!response.ok) throw new Error('Failed to fetch version manifest');
        const manifest = await response.json();
        return manifest.versions;
      } catch (error) {
        console.error('Failed to get available versions:', error);
        return [];
      }
    });

    ipcMain.handle('launcher:getInstalledVersions', async () => {
      // TODO: Check local filesystem for installed versions
      return [];
    });

    ipcMain.handle('launcher:downloadVersion', async (_, version: string) => {
      console.log('Downloading Minecraft version:', version);
      // TODO: Implement actual version download
      // For now, just log and return success
      return { success: true, message: 'Download started for ' + version };
    });
  }

  private updaterEnabled(): boolean {
    if (this.isDev && process.env.WIND_FORCE_UPDATER !== '1') return false;
    return true;
  }

  private sendUpdaterStatus(payload: Record<string, unknown>): void {
    this.mainWindow?.webContents.send('updater:status', payload);
  }

  private async runUpdateCheckRequest(): Promise<{
    ok: boolean;
    reason?: string;
    updateInfo?: { version?: string; releaseDate?: string };
    isUpdateAvailable?: boolean;
    error?: string;
  }> {
    if (!this.updaterEnabled()) {
      return { ok: false, reason: 'dev' };
    }
    try {
      const r = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        updateInfo: r?.updateInfo ?? undefined,
        isUpdateAvailable: r?.isUpdateAvailable ?? false,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn('[updater] checkForUpdates failed:', msg);
      return { ok: false, error: msg };
    }
  }

  private async runManualUpdateCheck(): Promise<void> {
    if (!this.updaterEnabled()) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Updates',
        message: 'Auto-updates are disabled in development.',
        detail: 'Build a release (npm run package:win) and set package.json → repository to your GitHub repo, or set WIND_FORCE_UPDATER=1 to test the updater in dev.',
      });
      return;
    }
    const r = await this.runUpdateCheckRequest();
    if (!r.ok) {
      await dialog.showMessageBox({
        type: 'warning',
        title: 'Update check failed',
        message: r.error || 'Unknown error',
      });
      return;
    }
    if (r.isUpdateAvailable && r.updateInfo?.version) {
      await dialog.showMessageBox({
        type: 'info',
        title: 'Update available',
        message: `Version ${r.updateInfo.version} will download in the background.`,
        detail: 'You will be prompted when the update is ready to install.',
      });
      return;
    }
    await dialog.showMessageBox({
      type: 'info',
      title: 'Wind Client',
      message: 'You are on the latest version.',
      detail: `Current version: ${app.getVersion()}`,
    });
  }

  private setupAutoUpdater(): void {
    autoUpdater.autoDownload = true;
    autoUpdater.allowPrerelease = false;

    autoUpdater.on('checking-for-update', () => {
      this.sendUpdaterStatus({ state: 'checking' });
    });

    autoUpdater.on('update-not-available', () => {
      this.sendUpdaterStatus({ state: 'not-available', version: app.getVersion() });
    });

    autoUpdater.on('update-available', (info) => {
      this.sendUpdaterStatus({ state: 'available', version: info.version });
    });

    autoUpdater.on('download-progress', (p) => {
      this.sendUpdaterStatus({
        state: 'downloading',
        percent: p.percent,
        transferred: p.transferred,
        total: p.total,
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      this.sendUpdaterStatus({ state: 'downloaded', version: info.version });
      dialog
        .showMessageBox(this.mainWindow!, {
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
            autoUpdater.quitAndInstall(false, true);
          }
        });
    });

    autoUpdater.on('error', (err) => {
      console.warn('[updater] error:', err);
      this.sendUpdaterStatus({
        state: 'error',
        message: err.message,
      });
    });

    const schedule = () => {
      if (!this.updaterEnabled()) return;
      if (!store.get('settings.autoUpdate', true)) return;
      this.runUpdateCheckRequest().catch(() => {});
    };

    schedule();

    if (this.updateCheckTimer) clearInterval(this.updateCheckTimer);
    this.updateCheckTimer = setInterval(schedule, 4 * 60 * 60 * 1000);
  }
}

new WindClient();
