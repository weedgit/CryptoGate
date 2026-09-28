import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";

export type ServerPage<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type ServerParams = Record<string, string | number | null | undefined>;

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

export function serverUrl(path: string, params: ServerParams = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    q.set(k, String(v));
  }
  const s = q.toString();
  return `${API_BASE}${path}${s ? `?${s}` : ""}`;
}

/** GET JSON with a short client cache (instant back-navigation / re-render). */
export async function getServerJson<T>(
  path: string,
  params: ServerParams = {},
): Promise<T> {
  const url = serverUrl(path, params);
  const res = await apiFetch(url, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const value = (await res.json()) as T;
  cache.set(url, { at: Date.now(), value });
  return value;
}

/** GET a file body (uncached), e.g. a streamed CSV export. */
export async function getServerBlob(
  path: string,
  params: ServerParams = {},
): Promise<Blob> {
  const res = await apiFetch(serverUrl(path, params), {
    credentials: "include",
    headers: { Accept: "text/csv, application/json" },
  });
  if (!res.ok) await parseError(res);
  return res.blob();
}

export function peekServerJson<T>(path: string, params: ServerParams = {}): T | null {
  const hit = cache.get(serverUrl(path, params));
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit.value as T;
}

/** Row with this id from any fresh cached page under `pathPrefix` (instant detail paint). */
export function findCachedPageItem<T>(pathPrefix: string, id: string): T | null {
  const prefix = `${API_BASE}${pathPrefix}`;
  const now = Date.now();
  for (const [key, hit] of cache) {
    if (!key.startsWith(prefix) || now - hit.at > CACHE_TTL_MS) continue;
    const items = (hit.value as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    const found = items.find(
      (row) => (row as { id?: unknown } | null)?.id === id,
    );
    if (found) return found as T;
  }
  return null;
}

/** Drop cached responses whose path starts with `pathPrefix` (after a mutation). */
export function invalidateServerJson(pathPrefix: string): void {
  const prefix = `${API_BASE}${pathPrefix}`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function toServerPage<T>(
  data: { items?: T[]; total?: number; limit?: number; offset?: number },
  fallbackLimit: number,
): ServerPage<T> {
  const items = data.items ?? [];
  return {
    items,
    total: data.total ?? items.length,
    limit: data.limit ?? fallbackLimit,
    offset: data.offset ?? 0,
  };
}
