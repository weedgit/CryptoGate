import type { Session } from "../merchant/api";

export function sessionEmailLocalPart(email: string): string {
  return email.split("@")[0]?.trim() || "User";
}

/** Name shown in sidebar chrome — first+last, else displayName, else email prefix. */
export function sessionDisplayLabel(
  session: Pick<Session, "email" | "displayName" | "firstName" | "lastName">,
): string {
  const first = (session.firstName ?? "").trim();
  const last = (session.lastName ?? "").trim();
  if (first || last) return [first, last].filter(Boolean).join(" ");
  const saved = (session.displayName ?? "").trim();
  if (saved) return saved;
  return sessionEmailLocalPart(session.email);
}

export function sessionHasCustomDisplayName(
  session: Pick<Session, "displayName" | "firstName" | "lastName">,
): boolean {
  return Boolean(
    (session.firstName ?? "").trim() ||
      (session.lastName ?? "").trim() ||
      (session.displayName ?? "").trim(),
  );
}

export function sessionHasAvatar(
  session: Pick<Session, "avatarUrl">,
): boolean {
  const url = (session.avatarUrl ?? "").trim();
  return url.startsWith("data:image/");
}
