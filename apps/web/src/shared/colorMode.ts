export type ColorMode = "dark" | "light";

const STORAGE_KEY = "paymentgate.colorMode";

const listeners = new Set<(mode: ColorMode) => void>();

function isMode(value: string | null): value is ColorMode {
  return value === "dark" || value === "light";
}

export function readStoredColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isMode(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function getDocumentColorMode(): ColorMode {
  const attr = document.documentElement.getAttribute("data-theme");
  return isMode(attr) ? attr : "dark";
}

/** Apply theme before paint when possible (also called from toggle). */
export function applyColorMode(mode: ColorMode): void {
  document.documentElement.setAttribute("data-theme", mode);
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(mode);
}

export function toggleColorMode(): ColorMode {
  const next: ColorMode =
    getDocumentColorMode() === "dark" ? "light" : "dark";
  applyColorMode(next);
  return next;
}

export function subscribeColorMode(fn: (mode: ColorMode) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Idempotent boot — safe to call from main + HTML inline. */
export function bootColorMode(): ColorMode {
  const mode = readStoredColorMode();
  document.documentElement.setAttribute("data-theme", mode);
  return mode;
}
