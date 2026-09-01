const RELOAD_KEY = "cg-chunk-reload";

/** Detect Vite/Rollup dynamic import failures after a deploy. */
export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("importing a module script failed") ||
    msg.includes("error loading dynamically imported module")
  );
}

/**
 * One automatic hard reload when a stale hashed chunk 404s after deploy.
 * Returns true when a reload was triggered (caller should not rethrow).
 */
export function reloadForStaleChunk(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(RELOAD_KEY)) return false;
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
  return true;
}

/** Clear the one-shot reload guard after a successful boot. */
export function clearChunkReloadFlag(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(RELOAD_KEY);
}

/**
 * Wrap a lazy route loader — reload once on stale chunk, otherwise reject.
 */
export async function loadLazyChunk<T>(
  loader: () => Promise<T>,
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    if (isChunkLoadError(err) && reloadForStaleChunk()) {
      return new Promise<T>(() => {
        /* reload in flight */
      });
    }
    throw err;
  }
}
