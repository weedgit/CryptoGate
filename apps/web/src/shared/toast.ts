export type ToastTone = "error" | "ok" | "info";

export type ToastEntry = {
  id: number;
  message: string;
  tone: ToastTone;
  durationMs: number;
  onDismiss?: () => void;
};

type Listener = (entry: ToastEntry | null) => void;

const DEFAULT_DURATION_MS = 6000;

let current: ToastEntry | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn(current);
}

/**
 * Show a one-time message in the single app-wide toast slot.
 * A new toast replaces the current one; the same text again only refreshes it.
 */
export function showToast(
  message: string,
  opts: { tone?: ToastTone; durationMs?: number; onDismiss?: () => void } = {},
): number {
  const text = message.trim();
  if (!text) return 0;
  const tone = opts.tone ?? "error";
  if (current && current.message === text && current.tone === tone) {
    current = {
      ...current,
      id: nextId++,
      durationMs: opts.durationMs ?? current.durationMs,
      onDismiss: opts.onDismiss ?? current.onDismiss,
    };
    emit();
    return current.id;
  }
  const replaced = current;
  current = {
    id: nextId++,
    message: text,
    tone,
    durationMs: opts.durationMs ?? DEFAULT_DURATION_MS,
    onDismiss: opts.onDismiss,
  };
  replaced?.onDismiss?.();
  emit();
  return current.id;
}

export function dismissToast(id?: number): void {
  if (!current) return;
  if (id != null && current.id !== id) return;
  const done = current;
  current = null;
  done.onDismiss?.();
  emit();
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
