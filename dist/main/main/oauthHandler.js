"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthHandler = void 0;
const electron_1 = require("electron");
/** Uses Chromium's network stack (proxy, certs) — Node `fetch` often fails with "fetch failed" behind proxies / on some Windows setups. */
function describeNetworkError(err) {
    if (!(err instanceof Error))
        return String(err);
    const parts = [err.message];
    const anyErr = err;
    if (anyErr.cause instanceof Error)
        parts.push(`cause: ${anyErr.cause.message}`);
    else if (anyErr.cause != null)
        parts.push(`cause: ${String(anyErr.cause)}`);
    if (anyErr.code)
        parts.push(`code: ${anyErr.code}`);
    return parts.join(' — ');
}
async function oauthNetFetch(url, init, retries = 1) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await electron_1.net.fetch(url, init);
        }
        catch (e) {
            lastErr = e;
            console.warn(`[OAuth] net.fetch attempt ${attempt + 1} failed:`, describeNetworkError(e));
            if (attempt < retries)
                await new Promise((r) => setTimeout(r, 800));
        }
    }
    throw new Error(describeNetworkError(lastErr));
}
/** Xbox / Mojang endpoints often return 502/503 under load — retry with backoff. */
const TRANSIENT_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);
async function oauthFetchUntilOk(label, url, init, maxAttempts = 6) {
    let lastStatus = 0;
    let lastBody = '';
    for (let i = 1; i <= maxAttempts; i++) {
        const res = await oauthNetFetch(url, init, 1);
        if (res.ok)
            return res;
        lastBody = await res.text().catch(() => '');
        lastStatus = res.status;
        const retryable = TRANSIENT_HTTP.has(res.status);
        if (!retryable || i === maxAttempts) {
            throw new Error(`${label} failed: ${res.status} ${lastBody}`);
        }
        const base = Math.min(12_000, 800 * 2 ** (i - 1));
        const jitter = Math.random() * 600;
        const delay = base + jitter;
        console.warn(`[OAuth] ${label} HTTP ${res.status}, attempt ${i}/${maxAttempts}, retry in ${Math.round(delay)}ms`);
        await new Promise((r) => setTimeout(r, delay));
    }
    throw new Error(`${label} failed: ${lastStatus} ${lastBody}`);
}
/** Retries only on transient HTTP errors; returns the last response (may be non-OK). */
async function oauthFetchTransientRetry(label, url, init, maxAttempts = 5) {
    let res = await oauthNetFetch(url, init, 1);
    for (let i = 1; TRANSIENT_HTTP.has(res.status) && i < maxAttempts; i++) {
        const body = await res.text().catch(() => '');
        const base = Math.min(12_000, 800 * 2 ** (i - 1));
        const jitter = Math.random() * 600;
        const delay = base + jitter;
        console.warn(`[OAuth] ${label} HTTP ${res.status}, attempt ${i}/${maxAttempts}, retry in ${Math.round(delay)}ms`);
        await new Promise((r) => setTimeout(r, delay));
        res = await oauthNetFetch(url, init, 1);
    }
    return res;
}
class OAuthHandler {
    static oauthWindow = null;
    static resolvePromise = null;
    static rejectPromise = null;
    // Dedicated partition so we can fully clear MSA cookies on sign-out.
    static PARTITION = 'persist:msa-oauth';
    /**
     * Wipes every cookie / localStorage / cache for the dedicated MSA partition.
     * Called on sign-out so the next "Sign in with Microsoft" shows the account
     * picker instead of silently re-using the previously logged-in account.
     */
    static async clearSession() {
        try {
            const part = electron_1.session.fromPartition(this.PARTITION);
            await part.clearStorageData({
                storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage'],
            });
            await part.clearCache();
            console.log('[OAuth] MSA partition cleared');
        }
        catch (e) {
            console.error('[OAuth] Failed to clear session:', e);
        }
    }
    static async authenticate(forceAccountPicker = true) {
        console.log('[OAuth] authenticate() called, forcePicker=', forceAccountPicker);
        return new Promise((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
            try {
                this.oauthWindow = new electron_1.BrowserWindow({
                    width: 500,
                    height: 640,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true,
                        partition: this.PARTITION,
                    },
                    show: false,
                    modal: false,
                    alwaysOnTop: true,
                    frame: true,
                    titleBarStyle: 'default',
                    skipTaskbar: false,
                    focusable: true,
                    autoHideMenuBar: true,
                    title: 'Sign in to Microsoft',
                });
                // Microsoft OAuth URL — prompt=select_account asks MSA to show the account
                // picker instead of auto-selecting the last one.
                const params = new URLSearchParams({
                    client_id: '000000004C12AE6F',
                    response_type: 'code',
                    redirect_uri: 'https://login.live.com/oauth20_desktop.srf',
                    scope: 'XboxLive.signin XboxLive.offline_access',
                    response_mode: 'query',
                });
                if (forceAccountPicker)
                    params.set('prompt', 'select_account');
                const authUrl = `https://login.live.com/oauth20_authorize.srf?${params.toString()}`;
                console.log('Loading OAuth URL:', authUrl);
                this.oauthWindow.loadURL(authUrl);
                this.oauthWindow.once('ready-to-show', () => {
                    console.log('OAuth window ready to show');
                    this.oauthWindow?.show();
                    console.log('OAuth window should now be visible');
                });
            }
            catch (error) {
                console.error('Error creating OAuth window:', error);
                reject(new Error(`Failed to create OAuth window: ${error}`));
                return;
            }
            // Handle redirect to callback URL
            this.oauthWindow.webContents.on('did-navigate', (_event, url) => {
                console.log('Navigated to:', url);
                if (url.includes('oauth20_desktop.srf')) {
                    try {
                        const urlObj = new URL(url);
                        const code = urlObj.searchParams.get('code');
                        const error = urlObj.searchParams.get('error');
                        const errorDescription = urlObj.searchParams.get('error_description');
                        if (code) {
                            console.log('Got authorization code from navigation');
                            this.handleAuthCode(code);
                        }
                        else if (error) {
                            console.error('OAuth error from navigation:', error, errorDescription);
                            this.handleError(errorDescription || error);
                        }
                    }
                    catch (e) {
                        console.error('Failed to parse redirect URL:', e);
                    }
                }
            });
            this.oauthWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
                console.error('Failed to load:', errorCode, errorDescription);
                if (errorCode !== -2) { // Don't treat cancellation as error
                    this.handleError(`Failed to load: ${errorDescription}`);
                }
            });
            this.oauthWindow.on('closed', () => {
                if (this.rejectPromise && !this.oauthWindow?.isDestroyed()) {
                    this.handleError('Authentication window was closed');
                }
                this.oauthWindow = null;
            });
        });
    }
    static handleAuthCode(code) {
        console.log('========================================');
        console.log('handleAuthCode called with code');
        console.log('========================================');
        if (this.oauthWindow && !this.oauthWindow.isDestroyed()) {
            console.log('Closing OAuth window...');
            this.oauthWindow.close();
        }
        console.log('Starting token exchange...');
        // Exchange code for token
        this.exchangeCodeForToken(code)
            .then(result => {
            console.log('Token exchange completed successfully');
            console.log('Result:', result);
            if (this.resolvePromise) {
                console.log('Calling resolvePromise with result');
                this.resolvePromise(result);
            }
            else {
                console.error('resolvePromise is null!');
            }
        })
            .catch(error => {
            console.error('Token exchange failed:', error);
            if (this.rejectPromise) {
                this.handleError(`Token exchange failed: ${error.message}`);
            }
            else {
                console.error('rejectPromise is null!');
            }
        });
    }
    static handleError(error) {
        if (this.oauthWindow && !this.oauthWindow.isDestroyed()) {
            this.oauthWindow.close();
        }
        if (this.rejectPromise) {
            this.rejectPromise(new Error(error));
        }
    }
    static async exchangeCodeForToken(code) {
        try {
            console.log('Exchanging authorization code for Microsoft token...');
            // Step 1: Exchange code for Microsoft access token
            const tokenResponse = await oauthFetchUntilOk('Microsoft token exchange', 'https://login.live.com/oauth20_token.srf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    client_id: '000000004C12AE6F',
                    code: code,
                    redirect_uri: 'https://login.live.com/oauth20_desktop.srf',
                    grant_type: 'authorization_code',
                    scope: 'XboxLive.signin XboxLive.offline_access',
                }),
            });
            const msData = await tokenResponse.json();
            console.log('Microsoft token exchange successful');
            // Step 2: Authenticate with Xbox Live
            const xboxResponse = await oauthFetchUntilOk('Xbox Live authentication', 'https://user.auth.xboxlive.com/user/authenticate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    Properties: {
                        AuthMethod: 'RPS',
                        SiteName: 'user.auth.xboxlive.com',
                        RpsTicket: `d=${msData.access_token}`,
                    },
                    RelyingParty: 'http://auth.xboxlive.com',
                    TokenType: 'JWT',
                }),
            });
            const xboxData = await xboxResponse.json();
            console.log('Xbox Live authentication successful');
            // Step 3: Get XSTS token (this endpoint is the most likely to return 503)
            const xstsResponse = await oauthFetchUntilOk('XSTS token retrieval', 'https://xsts.auth.xboxlive.com/xsts/authorize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    Properties: {
                        SandboxId: 'RETAIL',
                        UserTokens: [xboxData.Token],
                    },
                    RelyingParty: 'rp://api.minecraftservices.com/',
                    TokenType: 'JWT',
                }),
            }, 8);
            const xstsData = await xstsResponse.json();
            console.log('XSTS token retrieval successful');
            // Step 4: Check Minecraft ownership
            const userHash = xboxData.DisplayClaims.xui[0].uhs;
            const xstsToken = xstsData.Token;
            console.log('Using userHash:', userHash);
            console.log('XSTS token length:', xstsToken.length);
            // Step 4: Exchange XSTS token for Minecraft access token
            console.log('Exchanging XSTS token for Minecraft access token...');
            const mcLoginResponse = await oauthFetchUntilOk('Minecraft login', 'https://api.minecraftservices.com/authentication/login_with_xbox', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({
                    identityToken: `XBL3.0 x=${userHash};${xstsToken}`,
                    ensureLegacyEnabled: true,
                }),
            });
            const mcLoginData = await mcLoginResponse.json();
            const minecraftAccessToken = mcLoginData.access_token;
            console.log('Minecraft access token obtained');
            // Step 5: Check Minecraft ownership
            let ownsMinecraft = false;
            try {
                const entitlementsResponse = await oauthFetchUntilOk('Minecraft entitlements', 'https://api.minecraftservices.com/entitlements/mcstore', {
                    method: 'GET',
                    headers: {
                        Authorization: `Bearer ${minecraftAccessToken}`,
                    },
                }, 4);
                const entitlementsData = await entitlementsResponse.json();
                console.log('Entitlements response items:', JSON.stringify(entitlementsData.items?.map((i) => i.itemname)));
                ownsMinecraft =
                    entitlementsData.items &&
                        entitlementsData.items.some((item) => item.itemname === 'product_minecraft' ||
                            item.itemname === 'game_minecraft' ||
                            item.itemname === 'minecraft_bedrock' ||
                            item.itemname === 'minecraft_java' ||
                            item.itemname === 'product_minecraft_bedrock' ||
                            item.itemname === 'product_minecraft_java' ||
                            item.itemname === 'game_minecraft_bedrock' ||
                            item.itemname === 'game_minecraft_java');
                console.log('Minecraft ownership check:', ownsMinecraft);
                if (!ownsMinecraft && entitlementsData.items && entitlementsData.items.length > 0) {
                    console.log('Has some entitlements, allowing login');
                    ownsMinecraft = true;
                }
            }
            catch (error) {
                console.warn('Minecraft ownership check error:', error);
                ownsMinecraft = true;
            }
            // Step 6: Get Minecraft profile
            let minecraftProfile = null;
            let username = 'Player';
            let uuid = this.generateUUID();
            if (ownsMinecraft) {
                try {
                    const profileResponse = await oauthFetchUntilOk('Minecraft profile', 'https://api.minecraftservices.com/minecraft/profile', {
                        method: 'GET',
                        headers: {
                            Authorization: `Bearer ${minecraftAccessToken}`,
                        },
                    }, 4);
                    minecraftProfile = await profileResponse.json();
                    username = minecraftProfile.name;
                    uuid = minecraftProfile.id;
                    console.log('Minecraft profile retrieved:', username);
                }
                catch (error) {
                    console.warn('Failed to get Minecraft profile, using default:', error);
                }
            }
            return {
                username: username,
                uuid: uuid,
                // Launcher needs the Minecraft access token to authenticate the game session.
                accessToken: minecraftAccessToken,
                refreshToken: msData.refresh_token,
                msAccessToken: msData.access_token,
                ownsMinecraft: ownsMinecraft,
                minecraftProfile: minecraftProfile,
                xboxToken: xboxData.Token,
                xstsToken: xstsData.Token
            };
        }
        catch (error) {
            console.error('Complete authentication flow failed:', error);
            throw error;
        }
    }
    static generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
    static setupIpcHandlers() {
        electron_1.ipcMain.handle('oauth:authenticate', async (_e, opts) => {
            return await this.authenticate(opts?.forceAccountPicker !== false);
        });
        electron_1.ipcMain.handle('oauth:signOut', async () => {
            await this.clearSession();
            return { success: true };
        });
    }
}
exports.OAuthHandler = OAuthHandler;
