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

function phoneFromMetadata(metadata: AuditMetadata): string | null {
  for (const key of ["phone", "newPhone", "destination"]) {
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

function yesNo(value: unknown): string | null {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return null;
}

/** Turn leftover metadata into short plain lines (skip noise / ids). */
function leftoverLines(
  metadata: AuditMetadata,
  skip: Set<string> = new Set(),
): string[] {
  const ignore = new Set([
    ...skip,
    "userId",
    "actorUserId",
    "orgId",
    "token",
    "secret",
    "password",
  ]);
  const lines: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (ignore.has(key) || value == null || value === "") continue;
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
    if (typeof value === "boolean") {
      lines.push(`${label}: ${value ? "Yes" : "No"}`);
    } else {
      const text = String(value);
      lines.push(
        `${label}: ${text.length > 80 ? `${text.slice(0, 80)}…` : text}`,
      );
    }
  }
  return lines.slice(0, 8);
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
  const phone = phoneFromMetadata(metadata);
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
      if (
        typeof metadata.initialSignIn === "string" &&
        metadata.initialSignIn.trim()
      ) {
        lines.push(
          `Initial sign-in (audit recovery): ${metadata.initialSignIn.trim()}`,
        );
      }
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

  if (action === "contact_email_otp_send") {
    const changing = metadata.pendingChange === true;
    return {
      headline: changing
        ? "Email change started — code sent to the new address"
        : "Email verification code sent",
      lines: [
        email ? `Sent to: ${email}` : null,
        changing
          ? "Current email stays active until the code is confirmed."
          : null,
        yesNo(metadata.notifiedOld) != null
          ? `Previous email notified: ${yesNo(metadata.notifiedOld)}`
          : null,
      ].filter(Boolean) as string[],
    };
  }

  if (action === "contact_phone_otp_send") {
    const changing = metadata.pendingChange === true;
    return {
      headline: changing
        ? "Phone change started — code texted to the new number"
        : "Phone verification code sent",
      lines: [
        phone ? `Sent to: ${phone}` : null,
        changing
          ? "Current number stays active until the code is confirmed."
          : null,
        yesNo(metadata.notifiedOld) != null
          ? `Previous number notified: ${yesNo(metadata.notifiedOld)}`
          : null,
      ].filter(Boolean) as string[],
    };
  }

  if (action === "contact_email_verified") {
    const swapped = metadata.swapped === true;
    return {
      headline: swapped
        ? "Email address changed and verified"
        : "Email address verified",
      lines: [
        email ? `Email: ${email}` : null,
        yesNo(metadata.notifiedOld) != null
          ? `Previous email notified: ${yesNo(metadata.notifiedOld)}`
          : null,
      ].filter(Boolean) as string[],
    };
  }

  if (action === "contact_phone_verified") {
    const swapped = metadata.swapped === true;
    return {
      headline: swapped
        ? "Phone number changed and verified"
        : "Phone number verified",
      lines: [
        phone ? `Phone: ${phone}` : null,
        yesNo(metadata.notifiedOld) != null
          ? `Previous number notified: ${yesNo(metadata.notifiedOld)}`
          : null,
      ].filter(Boolean) as string[],
    };
  }

  if (action === "contact_verification_override") {
    return {
      headline: "Platform Owner overrode contact verification",
      lines: leftoverLines(metadata),
    };
  }

  if (action === "mfa_enroll") {
    return {
      headline: "Started authenticator setup",
      lines: ["User began enrolling a TOTP authenticator app."],
    };
  }

  if (action === "mfa_verify_enroll") {
    return {
      headline: "Authenticator setup completed",
      lines: ["Two-step verification is now enabled on this account."],
    };
  }

  if (action === "mfa_verify_login") {
    return {
      headline: "Signed in with authenticator code",
      lines: ["Login completed after MFA challenge."],
    };
  }

  if (action === "mfa_reset") {
    return {
      headline: "Authenticator reset",
      lines: ["Previous MFA was cleared so a new authenticator can be set up."],
    };
  }

  if (action === "login") {
    return { headline: "Signed in", lines: leftoverLines(metadata) };
  }

  if (action === "logout") {
    return { headline: "Signed out", lines: leftoverLines(metadata) };
  }

  if (action === "profile_update") {
    const lines = leftoverLines(metadata, new Set(["email"]));
    return {
      headline: email ? `Profile updated (${email})` : "Profile updated",
      lines,
    };
  }

  if (action === "password_reset_request") {
    return {
      headline: "Password reset requested",
      lines: email ? [`Email: ${email}`] : [],
    };
  }

  if (action === "password_reset_complete") {
    return {
      headline: "Password was reset",
      lines: email ? [`Email: ${email}`] : [],
    };
  }

  const keys = Object.keys(metadata);
  if (keys.length === 0) {
    return { headline: "No extra details for this event", lines: [] };
  }

  return {
    headline: "What changed",
    lines: leftoverLines(metadata),
  };
}

/** Short label for Org / resource column. */
export function auditResourceLabel(metadata: AuditMetadata): string {
  const displayName = displayNameFromMetadata(metadata);
  if (displayName) return displayName;
  const email = emailFromMetadata(metadata);
  if (email) return email;
  const phone = phoneFromMetadata(metadata);
  if (phone) return phone;
  for (const key of ["billId", "orderId", "resource", "resourceId", "name"]) {
    const v = metadata[key];
    if (v != null && String(v).trim()) {
      const s = String(v);
      return s.length > 36 ? `${s.slice(0, 36)}…` : s;
    }
  }
  return "—";
}
