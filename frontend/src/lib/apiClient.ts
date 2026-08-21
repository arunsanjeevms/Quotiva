import type { ApiErrorBody, ListParams } from '@/types';

/**
 * Centralized API client. Every request goes through here — no component calls
 * fetch directly, and no component talks to Supabase for data (see ADR-001).
 *
 * In development this same code path is intercepted by MSW, so switching to the
 * real backend requires no change here.
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: { path: string; message: string }[];
  readonly requestId?: string;

  constructor(
    status: number,
    body: ApiErrorBody | null,
    fallbackMessage = 'Something went wrong',
  ) {
    super(body?.error?.message ?? fallbackMessage);
    this.name = 'ApiError';
    this.status = status;
    this.code = body?.error?.code ?? 'INTERNAL_ERROR';
    if (body?.error?.details) this.details = body.error.details;
    if (body?.requestId) this.requestId = body.requestId;
  }

  /** Field-level errors keyed by form path, for React Hook Form. */
  get fieldErrors(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const detail of this.details ?? []) map[detail.path] = detail.message;
    return map;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isPermissionError(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

type TokenProvider = () => string | null;
type BusinessProvider = () => string | null;
type UnauthorizedHandler = () => void;

let getToken: TokenProvider = () => null;
let getBusinessId: BusinessProvider = () => null;
let onUnauthorized: UnauthorizedHandler = () => {};

/** Wired once at app start by the session and business providers. */
export function configureApiClient(config: {
  getToken?: TokenProvider;
  getBusinessId?: BusinessProvider;
  onUnauthorized?: UnauthorizedHandler;
}): void {
  if (config.getToken) getToken = config.getToken;
  if (config.getBusinessId) getBusinessId = config.getBusinessId;
  if (config.onUnauthorized) onUnauthorized = config.onUnauthorized;
}

export function buildQuery(params?: ListParams | Record<string, unknown>): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length) search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Skip the JSON envelope unwrap — used for blob/text responses. */
  raw?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, raw, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has('Content-Type') && body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  const businessId = getBusinessId();
  if (businessId) finalHeaders.set('X-Business-Id', businessId);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, null, 'Unable to reach the server. Check your connection.');
  }

  if (response.status === 401) {
    onUnauthorized();
    throw new ApiError(401, null, 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    let payload: ApiErrorBody | null = null;
    try {
      payload = (await response.json()) as ApiErrorBody;
    } catch {
      payload = null;
    }
    throw new ApiError(response.status, payload);
  }

  if (response.status === 204) return undefined as T;
  if (raw) return (await response.blob()) as T;

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: ListParams | Record<string, unknown>) =>
    request<T>(`${path}${buildQuery(params)}`),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  blob: (path: string, params?: Record<string, unknown>) =>
    request<Blob>(`${path}${buildQuery(params)}`, { raw: true }),
  text: async (path: string, params?: Record<string, unknown>) => {
    const token = getToken();
    const businessId = getBusinessId();
    const headers = new Headers();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (businessId) headers.set('X-Business-Id', businessId);
    const res = await fetch(`${BASE_URL}${path}${buildQuery(params)}`, { headers });
    if (!res.ok) throw new ApiError(res.status, null, 'Failed to load document');
    return res.text();
  },
};
