/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build identity, inlined by vite.config.ts and compared against /version.json. */
declare const __APP_BUILD_ID__: string;
