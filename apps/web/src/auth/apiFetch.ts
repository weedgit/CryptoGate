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

/** Cookie-aware fetch that signs the portal out on expired sessions. */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    void handle401(res);
  }
  return res;
}
