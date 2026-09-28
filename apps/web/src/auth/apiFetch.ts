import { recordServerTime } from "../shared/serverClock";
import { showToast } from "../shared/toast";

type SessionAuthHandlers = {
  onSessionExpired?: () => void;
  onMfaRequired?: () => void;
};

let handlers: SessionAuthHandlers = {};
let sessionActive = false;
let loginInProgress = false;
let pendingNotice: string | null = null;

export function registerSessionAuthHandlers(next: SessionAuthHandlers) {
  handlers = next;
}

/** True while a signed-in portal session is mounted in the UI. */
export function setSessionAuthActive(active: boolean) {
  sessionActive = active;
}

/** Suppress global sign-out while login / MFA verify is in flight. */
export function setLoginInProgress(active: boolean) {
  loginInProgress = active;
}

/** One-shot notice for the login screen after forced sign-out. */
export function consumeSessionNotice(): string | null {
  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}

async function handle401(res: Response) {
  if (!sessionActive || loginInProgress) return;

  let code = "";
  try {
    const json = (await res.clone().json()) as { code?: string };
    code = json.code ?? "";
  } catch {
    code = "unauthenticated";
  }

  if (code === "mfa_required") {
    handlers.onMfaRequired?.();
    return;
  }

  if (code === "unauthenticated") {
    pendingNotice = "Session expired — sign in again.";
    handlers.onSessionExpired?.();
  }
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.method.toUpperCase();
  }
  return "GET";
}

/** Permission denials on writes always surface the server's reason. */
async function handle403(res: Response) {
  if (!sessionActive) return;
  let message = "";
  try {
    const json = (await res.clone().json()) as { message?: string };
    message = json.message?.trim() ?? "";
  } catch {
    /* non-JSON body */
  }
  showToast(message || "You don't have permission to do this.");
}

/**
 * Cookie-aware fetch that signs the portal out on expired sessions and
 * toasts the reason when a write is refused (403).
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const sentAt = Date.now();
  const started = performance.now();
  const res = await fetch(input, init);
  recordServerTime(res.headers.get("X-Server-Time"), sentAt, performance.now() - started);
  if (res.status === 401) {
    void handle401(res);
  } else if (res.status === 403) {
    const method = requestMethod(input, init);
    if (method !== "GET" && method !== "HEAD") void handle403(res);
  }
  return res;
}
