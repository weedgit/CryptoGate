export const SESSION_REFRESH_EVENT = "cg:session-refresh";

/** Ask the portal to reload the session (setup flags, wallet, contact state) after a save that changes them. */
export function requestSessionRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_REFRESH_EVENT));
}
