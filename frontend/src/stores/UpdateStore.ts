import { makeAutoObservable, runInAction } from 'mobx';

/**
 * Keeps a kiosk tablet on the current build.
 *
 * Wall tablets run fullscreen with no keyboard and nobody to press reload, so
 * a deploy would otherwise only reach them when someone remembers to restart
 * the browser. Every build writes its identity to `/version.json` (see
 * `vite.config.ts`); this store polls that file and reloads the page once the
 * served build differs from the running one.
 *
 * The reload waits for a quiet moment: the screen must be idle, showing a page
 * that holds no half-finished input, and the device must be online — a reload
 * while offline would replace a working screen with the browser's error page.
 */

/** How often the tablet asks which build the server is serving. */
const CHECK_INTERVAL_MS = 60_000;
/** Once an update is known, how often the reload conditions are re-evaluated. */
const RELOAD_CHECK_MS = 5_000;
/** Nobody may have touched the screen for this long before reloading. */
const IDLE_BEFORE_RELOAD_MS = 20_000;

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`;

interface VersionDocument {
  buildId?: string;
}

export class UpdateStore {
  /** True once the server reports a build id other than the running one. */
  available = false;
  /** Build id the server last reported (for the settings page / debugging). */
  serverBuildId: string | null = null;

  /** Set by the UI: false while the visible page would lose work on reload. */
  private safe = true;
  private lastInteraction = Date.now();
  private checkTimer: number | null = null;
  private reloadTimer: number | null = null;
  private started = false;

  constructor() {
    makeAutoObservable<
      this,
      'safe' | 'lastInteraction' | 'checkTimer' | 'reloadTimer' | 'started'
    >(
      this,
      {
        safe: false,
        lastInteraction: false,
        checkTimer: false,
        reloadTimer: false,
        started: false,
      },
      { autoBind: true },
    );
  }

  get buildId(): string {
    return __APP_BUILD_ID__;
  }

  start() {
    if (this.started) return;
    this.started = true;

    window.addEventListener('pointerdown', this.noteInteraction, { capture: true, passive: true });
    window.addEventListener('keydown', this.noteInteraction, { capture: true, passive: true });
    // A tablet that was asleep for hours may have missed several deploys.
    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.checkTimer = window.setInterval(this.check, CHECK_INTERVAL_MS);
    void this.check();
  }

  stop() {
    this.started = false;
    window.removeEventListener('pointerdown', this.noteInteraction, { capture: true });
    window.removeEventListener('keydown', this.noteInteraction, { capture: true });
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.checkTimer !== null) window.clearInterval(this.checkTimer);
    this.checkTimer = null;
    if (this.reloadTimer !== null) window.clearInterval(this.reloadTimer);
    this.reloadTimer = null;
  }

  /**
   * Called by the UI as the route changes: `false` on pages where a reload
   * would throw away something the person is in the middle of (a PIN, a form,
   * a booking), `true` on the room screen and the read-only day view.
   */
  setSafeToReload(value: boolean) {
    this.safe = value;
  }

  /** Reload straight away, ignoring the idle rules (manual button in settings). */
  reloadNow() {
    this.stop();
    window.location.reload();
  }

  private noteInteraction() {
    this.lastInteraction = Date.now();
  }

  private onVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    this.noteInteraction();
    void this.check();
  }

  private async check(): Promise<void> {
    if (this.available) return;
    try {
      const response = await fetch(VERSION_URL, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const { buildId } = (await response.json()) as VersionDocument;
      if (!buildId) return;
      runInAction(() => {
        this.serverBuildId = buildId;
        this.available = buildId !== __APP_BUILD_ID__;
      });
      if (!this.available) return;
      console.info(`[update] build ${buildId} deployed (running ${__APP_BUILD_ID__})`);
      this.watchForQuietMoment();
    } catch {
      // Offline, or the file is not deployed yet: try again on the next tick.
    }
  }

  /** Stops polling for versions and starts waiting for a safe time to reload. */
  private watchForQuietMoment() {
    if (this.checkTimer !== null) window.clearInterval(this.checkTimer);
    this.checkTimer = null;
    if (this.reloadTimer !== null) return;
    this.reloadTimer = window.setInterval(this.maybeReload, RELOAD_CHECK_MS);
    this.maybeReload();
  }

  private maybeReload() {
    if (!this.available || !this.safe) return;
    if (!navigator.onLine) return;
    if (Date.now() - this.lastInteraction < IDLE_BEFORE_RELOAD_MS) return;
    console.info('[update] idle — reloading into the new build');
    this.reloadNow();
  }
}
