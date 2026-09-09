import { makeAutoObservable, runInAction } from 'mobx';
import { api } from '@/lib/api';
import { ApiError, basicAuthHeader } from '@/lib/http';
import { session, storage } from '@/lib/utils';
import type { PinScope } from '@/types';

const CREDENTIALS_KEY = 'rb.credentials';
const PIN_KEY = (scope: PinScope) => `rb.pin.${scope}`;

export type AuthState = 'unknown' | 'checking' | 'authenticated' | 'anonymous';

/**
 * HTTP Basic credentials (shared by all tablets) plus the PINs unlocked in this
 * browser session. Credentials survive reloads (localStorage); PINs live only
 * in sessionStorage so a tablet left on the settings page locks itself again
 * after the kiosk browser restarts.
 */
export class AuthStore {
  state: AuthState = 'unknown';
  user: string | null = null;
  authorization: string | null = storage.get(CREDENTIALS_KEY);
  pins: Partial<Record<PinScope, string>> = {
    settings: session.get(PIN_KEY('settings')) ?? undefined,
    admin: session.get(PIN_KEY('admin')) ?? undefined,
  };

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  get isAuthenticated() {
    return this.state === 'authenticated';
  }

  /** Validates stored credentials on app start. */
  async restore() {
    if (!this.authorization) {
      this.state = 'anonymous';
      return;
    }
    this.state = 'checking';
    try {
      const me = await api.auth.me();
      runInAction(() => {
        this.user = me.user;
        this.state = 'authenticated';
      });
    } catch (err) {
      runInAction(() => {
        // Keep credentials on network errors so a tablet recovers once the API is back.
        if (err instanceof ApiError && err.status === 401) this.clearCredentials();
        this.state = err instanceof ApiError && err.status === 0 ? 'authenticated' : 'anonymous';
      });
    }
  }

  async login(user: string, password: string): Promise<void> {
    const authorization = basicAuthHeader(user.trim(), password);
    const me = await api.auth.me(authorization);
    runInAction(() => {
      this.authorization = authorization;
      this.user = me.user;
      this.state = 'authenticated';
      storage.set(CREDENTIALS_KEY, authorization);
    });
  }

  logout() {
    this.clearCredentials();
    this.state = 'anonymous';
  }

  /** Called by the HTTP layer on any 401. */
  handleUnauthorized() {
    if (this.state === 'authenticated') this.logout();
  }

  hasPin(scope: PinScope): boolean {
    return Boolean(this.pins[scope] ?? (scope === 'settings' ? this.pins.admin : undefined));
  }

  /**
   * Verifies `pin` for `scope` and remembers it under the scope it actually
   * matched: the admin PIN entered on the settings screen unlocks 'admin'
   * (and, through hasPin, settings as well). Returns the matched scope.
   */
  async unlock(scope: PinScope, pin: string): Promise<PinScope> {
    const { scope: matched } = await api.auth.verifyPin(scope, pin);
    runInAction(() => {
      this.pins = { ...this.pins, [matched]: pin };
      session.set(PIN_KEY(matched), pin);
    });
    return matched;
  }

  lock(scope?: PinScope) {
    const scopes: PinScope[] = scope ? [scope] : ['settings', 'admin'];
    for (const s of scopes) {
      session.remove(PIN_KEY(s));
    }
    this.pins = Object.fromEntries(
      Object.entries(this.pins).filter(([k]) => !scopes.includes(k as PinScope)),
    );
  }

  /** Header set for the HTTP layer. */
  get headers() {
    return {
      authorization: this.authorization ?? undefined,
      settingsPin: this.pins.settings,
      adminPin: this.pins.admin,
    };
  }

  private clearCredentials() {
    this.authorization = null;
    this.user = null;
    storage.remove(CREDENTIALS_KEY);
  }
}
