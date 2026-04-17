export interface AuthResult {
  username: string;
  uuid: string;
  accessToken: string;
  refreshToken: string;
  ownsMinecraft: boolean;
}

export class RealElectronOAuthService {
  static async authenticate(opts: { forceAccountPicker?: boolean } = {}): Promise<AuthResult> {
    if (!window.electronAPI?.oauth) {
      throw new Error('Electron OAuth API not available');
    }
    const authResult = await window.electronAPI.oauth.authenticate({
      forceAccountPicker: opts.forceAccountPicker !== false,
    });
    return {
      username: authResult.username,
      uuid: authResult.uuid,
      accessToken: authResult.accessToken,
      refreshToken: authResult.refreshToken,
      ownsMinecraft: authResult.ownsMinecraft,
    };
  }

  /**
   * Clears the embedded Microsoft login session (cookies/storage) so the next
   * authenticate() call shows the account picker instead of silently reusing
   * the previously signed-in Microsoft account.
   */
  static async signOut(): Promise<void> {
    if (!window.electronAPI?.oauth) return;
    try {
      await window.electronAPI.oauth.signOut();
    } catch (e) {
      console.warn('signOut failed:', e);
    }
  }

  static async authenticateOffline(username: string): Promise<AuthResult> {
    if (!username || username.trim().length === 0) {
      throw new Error('Username is required');
    }

    // Validate username format
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username.trim())) {
      throw new Error('Invalid username. Must be 3-16 characters, letters, numbers, and underscores only.');
    }

    return {
      username: username.trim(),
      uuid: this.generateUUID(),
      accessToken: 'offline-token',
      refreshToken: 'offline-refresh',
      ownsMinecraft: true
    };
  }

  private static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}
