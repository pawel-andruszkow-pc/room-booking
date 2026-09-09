import { z } from 'zod';

/**
 * Single source of truth for configuration.
 *
 * Every environment variable is declared, validated and normalised here exactly
 * once; the rest of the app reads the typed object instead of `process.env`, so
 * a missing or malformed variable is a startup error rather than an `undefined`
 * that surfaces mid-request. See backend/.env.example for the descriptions
 * users read.
 *
 * Access it through {@link appConfig} anywhere, or inject {@link APP_CONFIG}
 * inside Nest (see config.module.ts).
 */

/** Blank values in a .env file mean "not set", not "set to empty string". */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const pin = z
  .string()
  .trim()
  .regex(/^[0-9]{4,16}$/, 'must be 4-16 digits');

const timezone = z
  .string()
  .trim()
  .min(1)
  .refine(isValidTimezone, 'must be a valid IANA timezone, e.g. Europe/Warsaw');

/** Google only delivers push notifications to https:// endpoints with a valid certificate. */
const publicUrl = z
  .string()
  .trim()
  .transform((v) => v.replace(/\/+$/, ''))
  .refine(
    (v) => /^https:\/\/[^/\s]+$/.test(v),
    'must be an https:// origin without a path, e.g. https://api.example.com',
  );

/** Env files carry the key on one line with escaped newlines, often quoted. */
const privateKey = optionalString.transform((raw) =>
  raw === undefined ? undefined : raw.replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
);

const envSchema = z
  .object({
    NODE_ENV: optionalString,

    /**
     * Deployment environment. `local` never registers Google push channels
     * (even with PUBLIC_URL set), so a developer's database cannot claim the
     * production calendars' notifications; `production` enables them.
     */
    ENVIRONMENT: z.enum(['local', 'production']).default('local'),

    /** Railway injects PORT; locally it comes from .env. */
    PORT: z.coerce.number().int().min(1).max(65535).default(3020),

    CORS_ORIGIN: z
      .string()
      .trim()
      .min(1, 'at least one allowed frontend origin is required')
      .transform((raw) =>
        raw
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      )
      .refine((origins) => origins.length > 0, 'at least one origin is required'),

    BASIC_AUTH_USER: z.string().trim().min(1),
    BASIC_AUTH_PASSWORD: z.string().min(1),

    SETTINGS_PIN: pin.default('1234'),
    ADMIN_PIN: pin.default('0000'),

    TIMEZONE: timezone.default('Europe/Warsaw'),

    /**
     * How often tablets refresh room status — and therefore how often the
     * calendar is read, since every status request re-reads it. Bounded by what
     * the admin page allows so both paths agree.
     */
    POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(300).default(20),

    /**
     * How often the backend re-reads a watched room's calendar to push changes
     * over SSE. This is the delay before an event added in Google Calendar
     * shows on the tablet, so it is much shorter than the fallback poll.
     */
    WATCH_INTERVAL_SECONDS: z.coerce.number().int().min(2).max(300).default(5),

    /**
     * Fallback re-read interval for rooms whose calendar Google notifies us
     * about. Push notifications can be delayed or dropped, so these rooms are
     * still polled — just far less often than WATCH_INTERVAL_SECONDS.
     */
    WATCH_PUSH_FALLBACK_SECONDS: z.coerce.number().int().min(10).max(3600).default(120),

    /**
     * Public HTTPS origin of this API, e.g. https://api.example.com. When set
     * (with the Google provider) the backend registers Calendar push channels
     * whose callbacks Google delivers to `${PUBLIC_URL}/api/calendar/webhooks/google`.
     */
    PUBLIC_URL: optionalString.pipe(publicUrl.optional()),
    /** Injected by Railway; used as PUBLIC_URL when that is not set explicitly. */
    RAILWAY_PUBLIC_DOMAIN: optionalString,

    CALENDAR_PROVIDER: z.enum(['local', 'google']).default('local'),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalString.pipe(
      z.email('must be the service-account e-mail').optional(),
    ),
    GOOGLE_PRIVATE_KEY: privateKey,
    GOOGLE_IMPERSONATE_USER: optionalString.pipe(
      z.email('must be a Workspace user e-mail').optional(),
    ),

    SEED_ROOMS: optionalString,

    DATABASE_URL: z
      .string()
      .trim()
      .min(1)
      .refine(
        (url) => url.startsWith('postgres://') || url.startsWith('postgresql://'),
        'must be a postgres:// connection string (on Railway: ${{Postgres.DATABASE_URL}})',
      ),
  })
  .superRefine((env, ctx) => {
    if (env.CALENDAR_PROVIDER !== 'google') return;

    // Only meaningful for the Google provider, so they cannot be required above.
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
        message: 'required when CALENDAR_PROVIDER=google',
      });
    }
    if (!env.GOOGLE_PRIVATE_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_PRIVATE_KEY'],
        message: 'required when CALENDAR_PROVIDER=google',
      });
    } else if (!env.GOOGLE_PRIVATE_KEY.includes('-----BEGIN')) {
      ctx.addIssue({
        code: 'custom',
        path: ['GOOGLE_PRIVATE_KEY'],
        message:
          'does not look like a PEM key — paste the "private_key" field of the ' +
          'service-account JSON, keeping its literal \\n sequences',
      });
    }
  });

export interface AppConfig {
  readonly nodeEnv: string | undefined;
  /** `local` (default) or `production`; only production talks to Google push. */
  readonly environment: 'local' | 'production';
  readonly port: number;
  /** Allowed frontend origins, already split and trimmed. */
  readonly corsOrigins: readonly string[];
  /** HTTP Basic credentials guarding every API route. */
  readonly basicAuth: { readonly user: string; readonly password: string };
  /** Seed values for the PINs; authoritative copies live in the database. */
  readonly pins: { readonly settings: string; readonly admin: string };
  readonly timezone: string;
  readonly pollIntervalSeconds: number;
  /** Seconds between calendar reads for rooms with a connected tablet. */
  readonly watchIntervalSeconds: number;
  /** Seconds between fallback reads for rooms covered by Google push notifications. */
  readonly watchPushFallbackSeconds: number;
  /**
   * Public https origin Google can reach, or null when push notifications are
   * disabled (local development without a tunnel, or the local provider).
   */
  readonly publicUrl: string | null;
  readonly databaseUrl: string;
  readonly calendar: {
    readonly provider: 'local' | 'google';
    /**
     * Present whenever credentials were supplied — validation guarantees the
     * e-mail and key are set when `provider` is `google`.
     */
    readonly google: {
      readonly serviceAccountEmail: string | null;
      /** PEM with real newlines, ready for the JWT client. */
      readonly privateKey: string | null;
      /** Set only with domain-wide delegation. */
      readonly impersonateUser: string | null;
    };
  };
  /** Raw `Name=calendarId,...` list consumed by the seed command. */
  readonly seedRooms: string | undefined;
}

/**
 * Validates `source` and returns the typed configuration.
 * Throws an Error listing every problem at once — a partial fix followed by
 * another cryptic crash is worse than one complete message.
 */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(env)'}: ${issue.message}`,
    );
    throw new Error(
      `Invalid environment configuration:\n${lines.join('\n')}\n\n` +
        'Set these in the backend .env file (see backend/.env.example).',
    );
  }

  const env = result.data;
  return Object.freeze({
    nodeEnv: env.NODE_ENV,
    environment: env.ENVIRONMENT,
    port: env.PORT,
    corsOrigins: Object.freeze(env.CORS_ORIGIN),
    basicAuth: Object.freeze({
      user: env.BASIC_AUTH_USER,
      password: env.BASIC_AUTH_PASSWORD,
    }),
    pins: Object.freeze({ settings: env.SETTINGS_PIN, admin: env.ADMIN_PIN }),
    timezone: env.TIMEZONE,
    pollIntervalSeconds: env.POLL_INTERVAL_SECONDS,
    watchIntervalSeconds: env.WATCH_INTERVAL_SECONDS,
    watchPushFallbackSeconds: env.WATCH_PUSH_FALLBACK_SECONDS,
    publicUrl:
      env.PUBLIC_URL ??
      (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : null),
    databaseUrl: env.DATABASE_URL,
    calendar: Object.freeze({
      provider: env.CALENDAR_PROVIDER,
      google: Object.freeze({
        serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
        privateKey: env.GOOGLE_PRIVATE_KEY ?? null,
        impersonateUser: env.GOOGLE_IMPERSONATE_USER ?? null,
      }),
    }),
    seedRooms: env.SEED_ROOMS,
  });
}

let cached: AppConfig | null = null;

/**
 * The process-wide configuration, validated on first access.
 *
 * main.ts calls it during bootstrap so a bad .env stops the process before it
 * touches the database or binds a port; the seed and TypeORM CLIs get the same
 * check for free the first time they read a value.
 */
export function appConfig(): AppConfig {
  cached ??= loadConfig();
  return cached;
}

/** Test helper: forces the next {@link appConfig} call to re-validate. */
export function resetConfigCache(): void {
  cached = null;
}

function isValidTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
