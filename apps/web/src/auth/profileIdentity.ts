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

/** Initials for the default circular avatar when no photo is set. */
export function sessionAvatarInitials(
  session: Pick<Session, "email" | "displayName">,
): string {
  const name = sessionDisplayLabel(session);
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function sessionHasAvatar(
  session: Pick<Session, "avatarUrl">,
): boolean {
  const url = (session.avatarUrl ?? "").trim();
  return url.startsWith("data:image/");
}
