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
