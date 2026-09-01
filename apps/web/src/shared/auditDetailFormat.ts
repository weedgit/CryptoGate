type AuditMetadata = Record<string, string | number | boolean | null>;

function roleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "owner") return "Owner";
  if (r === "administrator") return "Administrator";
  if (r === "viewer") return "Viewer";
  if (r === "cashier") return "Cashier";
  return role;
}

function emailFromMetadata(metadata: AuditMetadata): string | null {
  for (const key of ["email", "invitedEmail", "targetEmail"]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function displayNameFromMetadata(metadata: AuditMetadata): string | null {
  for (const key of ["displayName", "name"]) {
    const v = metadata[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** Human-readable subject for team / profile audit rows — never raw user ids. */
function subjectFromMetadata(metadata: AuditMetadata): string {
  return (
    displayNameFromMetadata(metadata) ??
    emailFromMetadata(metadata) ??
    "Team member"
  );
}

export type AuditDetailSummary = {
  headline: string;
  lines: string[];
};

/** Human-readable audit detail for operators (B14 + org overview). */
export function summarizeAuditMetadata(
  action: string,
  metadata: AuditMetadata,
): AuditDetailSummary {
  const email = emailFromMetadata(metadata);
  const role =
    metadata.role != null ? roleLabel(String(metadata.role)) : null;

  if (action === "org_user_invite") {
    const who = subjectFromMetadata(metadata);
    const headline = role
      ? `Invited ${who} as ${role}`
      : `Invited ${who}`;
    const lines: string[] = [];
    if (metadata.provisioned === true) {
      lines.push("New login created — temporary password issued.");
    } else if (metadata.provisioned === false) {
      lines.push("Existing portal user added to this org.");
    }
    return { headline, lines };
  }

  if (action === "org_user_role") {
    const who = subjectFromMetadata(metadata);
    return {
      headline: role ? `Changed role for ${who} → ${role}` : `Changed role for ${who}`,
      lines: [],
    };
  }

  if (action === "org_user_pause" || action === "org_user_resume") {
    const who = subjectFromMetadata(metadata);
    const verb = action === "org_user_pause" ? "Paused" : "Resumed";
    return { headline: `${verb} ${who}`, lines: [] };
  }

  if (action === "org_user_remove") {
    const who = subjectFromMetadata(metadata);
    const priorRole =
      metadata.priorRole != null
        ? roleLabel(String(metadata.priorRole))
        : null;
    return {
      headline: priorRole ? `Removed ${who} (${priorRole})` : `Removed ${who}`,
      lines: [],
    };
  }

  if (action === "org_create" && metadata.name != null) {
    const type = metadata.type != null ? String(metadata.type) : "org";
    return {
      headline: `Created ${String(metadata.name)}`,
      lines: [`Type: ${type.replace(/_/g, " ")}`],
    };
  }

  if (action === "profile_update" && email) {
    return { headline: `Profile updated for ${email}`, lines: [] };
  }

  return {
    headline: "Event recorded",
    lines: Object.keys(metadata).length
      ? ["See raw JSON below for full metadata."]
      : [],
  };
}

/** Short label for Org / resource column. */
export function auditResourceLabel(metadata: AuditMetadata): string {
  const displayName = displayNameFromMetadata(metadata);
  if (displayName) return displayName;
  const email = emailFromMetadata(metadata);
  if (email) return email;
  for (const key of ["billId", "orderId", "resource", "resourceId", "name"]) {
    const v = metadata[key];
    if (v != null && String(v).trim()) {
      const s = String(v);
      return s.length > 36 ? `${s.slice(0, 36)}…` : s;
    }
  }
  return "—";
}
