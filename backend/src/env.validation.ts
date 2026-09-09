/**
 * Fail-fast validation of required environment variables, run once at boot
 * before the Nest app is created (see main.ts). Reporting every missing
 * variable at once turns a cryptic runtime error into an actionable startup
 * message. See backend/.env.example for the canonical list and descriptions.
 */

interface EnvVar {
  name: string;
  /** Why the app needs it, shown when it's missing. */
  description: string;
  /** Only required when this predicate returns true (defaults to always). */
  requiredWhen?: (env: NodeJS.ProcessEnv) => boolean;
}

const REQUIRED_ENV_VARS: EnvVar[] = [
  {
    name: 'DATABASE_URL',
    description:
      'Postgres connection string (e.g. ${{Postgres.DATABASE_URL}} on Railway).',
  },
  { name: 'CORS_ORIGIN', description: 'Comma-separated allowed frontend origin(s).' },
  { name: 'BASIC_AUTH_USER', description: 'HTTP Basic username protecting the API.' },
  { name: 'BASIC_AUTH_PASSWORD', description: 'HTTP Basic password protecting the API.' },
  {
    name: 'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    description: 'Service-account e-mail (required when CALENDAR_PROVIDER=google).',
    requiredWhen: (env) => env.CALENDAR_PROVIDER === 'google',
  },
  {
    name: 'GOOGLE_PRIVATE_KEY',
    description: 'Service-account private key (required when CALENDAR_PROVIDER=google).',
    requiredWhen: (env) => env.CALENDAR_PROVIDER === 'google',
  },
];

/**
 * Throws if any required environment variable is unset or blank. Call this
 * before NestFactory.create so the process exits before binding to a port.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_ENV_VARS.filter(
    (v) => (v.requiredWhen ? v.requiredWhen(env) : true) && !env[v.name]?.trim(),
  );

  if (missing.length > 0) {
    const lines = missing.map((v) => `  - ${v.name}: ${v.description}`);
    throw new Error(
      `Missing required environment variable(s):\n${lines.join('\n')}\n\n` +
        'Set them in the backend .env file (see backend/.env.example).',
    );
  }

  const provider = env.CALENDAR_PROVIDER ?? 'local';
  if (provider !== 'local' && provider !== 'google') {
    throw new Error(`CALENDAR_PROVIDER must be "local" or "google" (got "${provider}").`);
  }
}
