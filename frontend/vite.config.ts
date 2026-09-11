import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Identity of this build. It is inlined into the bundle (`__APP_BUILD_ID__`)
 * and written to `dist/version.json`; the tablets poll that file and reload
 * when the two stop matching, which is the only way to update a kiosk screen
 * nobody can touch. A commit sha is used when the build environment provides
 * one, otherwise the build timestamp — either way it changes on every deploy.
 */
function resolveBuildId(): string {
  // `||` and not `??`: unset build args arrive as empty strings, not undefined.
  const fromEnv =
    process.env.BUILD_ID ||
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT;
  if (fromEnv) return fromEnv.trim().slice(0, 12);
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // No git in the build container (the Dockerfile copies only `frontend/`).
    return `t${Date.now()}`;
  }
}

/** Publishes the build id at `/version.json`, in dev as well as in the bundle. */
function buildVersion(buildId: string): Plugin {
  const body = JSON.stringify({ buildId, builtAt: new Date().toISOString() });
  return {
    name: 'room-booking:build-version',
    configureServer(server) {
      // `vite preview` runs this hook too, but with a config resolved in build
      // mode. There the emitted file in dist/ must win, or previewing a deploy
      // would never show the reload working.
      if (server.config.command !== 'serve') return;
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: body });
    },
  };
}

const buildId = resolveBuildId();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), buildVersion(buildId)],
  define: {
    __APP_BUILD_ID__: JSON.stringify(buildId),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3021,
    host: true,
    // Proxy API calls to the backend so tablets on the LAN can use the dev
    // server with a relative `/api` base (no CORS, no baked-in URL).
    proxy: {
      '/api': {
        target: 'http://localhost:3020',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 3021,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
