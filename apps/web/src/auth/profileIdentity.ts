import type { Session } from "../merchant/api";

export function sessionEmailLocalPart(email: string): string {
  return email.split("@")[0]?.trim() || "User";
}

/** Name shown in sidebar chrome — saved display name, else email prefix. */
export function sessionDisplayLabel(
  session: Pick<Session, "email" | "displayName">,
): string {
  const saved = (session.displayName ?? "").trim();
  if (saved) return saved;
  return sessionEmailLocalPart(session.email);
}

export function sessionHasCustomDisplayName(
  session: Pick<Session, "displayName">,
): boolean {
  return Boolean((session.displayName ?? "").trim());
}
