/**
 * Minimal fetch wrapper. Adds Basic credentials, PIN headers and the device
 * id; normalises errors into ApiError so stores can show a friendly message.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestHeaders {
  authorization?: string;
  settingsPin?: string;
  adminPin?: string;
  deviceId?: string;
}

type HeaderProvider = () => RequestHeaders;

const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

let headerProvider: HeaderProvider = () => ({});
let onUnauthorized: (() => void) | null = null;
let onForbidden: ((message: string) => void) | null = null;

export function configureHttp(opts: {
  headers: HeaderProvider;
  onUnauthorized: () => void;
  /** Called on 403 — used to drop a cached PIN the server no longer accepts. */
  onForbidden?: (message: string) => void;
}) {
  headerProvider = opts.headers;
  onUnauthorized = opts.onUnauthorized;
  onForbidden = opts.onForbidden ?? null;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Override credentials (used by the login check before they are stored). */
  authorization?: string;
  signal?: AbortSignal;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const provided = headerProvider();
  const headers: Record<string, string> = { Accept: 'application/json' };
  const authorization = opts.authorization ?? provided.authorization;
  if (authorization) headers.Authorization = authorization;
  if (provided.settingsPin) headers['X-Settings-Pin'] = provided.settingsPin;
  if (provided.adminPin) headers['X-Admin-Pin'] = provided.adminPin;
  if (provided.deviceId) headers['X-Device-Id'] = provided.deviceId;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'Cannot reach the server');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message = extractMessage(data, response.status);
    if (response.status === 401 && !opts.authorization) onUnauthorized?.();
    if (response.status === 403) onForbidden?.(message);
    throw new ApiError(response.status, message);
  }
  return data as T;
}

/** SSE frames are delimited by a blank line. */
const FRAME_SEPARATOR = '\n\n';

/**
 * Subscribes to a server-sent-event endpoint.
 *
 * Uses fetch rather than EventSource because EventSource cannot send headers,
 * and this API is behind HTTP Basic — the alternative would be putting the
 * credentials in the query string. Reconnects with a capped backoff until the
 * signal aborts, so a dropped stream heals itself.
 */
export function streamEvents<T>(
  path: string,
  opts: { signal: AbortSignal; onMessage: (data: T) => void; onError?: () => void },
): void {
  let attempt = 0;

  const connect = async (): Promise<void> => {
    const provided = headerProvider();
    const headers: Record<string, string> = { Accept: 'text/event-stream' };
    if (provided.authorization) headers.Authorization = provided.authorization;
    if (provided.deviceId) headers['X-Device-Id'] = provided.deviceId;

    const response = await fetch(`${BASE_URL}${path}`, {
      headers,
      signal: opts.signal,
      cache: 'no-store',
    });
    if (!response.ok || !response.body) {
      if (response.status === 401) onUnauthorized?.();
      throw new ApiError(response.status, `Stream failed (${response.status})`);
    }

    attempt = 0;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; a frame may span several chunks.
      let split = buffer.indexOf(FRAME_SEPARATOR);
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + FRAME_SEPARATOR.length);
        const payload = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
        if (payload) {
          try {
            opts.onMessage(JSON.parse(payload) as T);
          } catch {
            // Ignore a malformed frame rather than tearing down the stream.
          }
        }
        split = buffer.indexOf(FRAME_SEPARATOR);
      }
    }
  };

  const run = () => {
    connect()
      .catch(() => opts.onError?.())
      .then(() => {
        if (opts.signal.aborted) return;
        // Both a clean end and a failure land here: retry, backing off to 30s.
        attempt += 1;
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30_000);
        window.setTimeout(() => {
          if (!opts.signal.aborted) run();
        }, delay);
      });
  };

  run();
}

function extractMessage(data: unknown, status: number): string {
  if (data && typeof data === 'object' && 'message' in data) {
    const m = (data as { message: unknown }).message;
    if (Array.isArray(m)) return m.join(', ');
    if (typeof m === 'string') return m;
  }
  switch (status) {
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not found';
    default:
      return `Request failed (${status})`;
  }
}

export function basicAuthHeader(user: string, password: string): string {
  // btoa() only handles Latin-1; encode as UTF-8 bytes first.
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `Basic ${btoa(binary)}`;
}
