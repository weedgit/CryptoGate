import type { OrgMember } from "../merchant/api";
import { ApiError } from "../merchant/api";

export type OrgRef = {
  id: string;
  type: string;
  name: string;
};

export type RegisteredEmailRef = OrgRef & {
  role: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** True when the user is likely searching by contact email. */
export function looksLikeEmailQuery(query: string): boolean {
  const q = query.trim();
  return q.includes("@");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOrgMembersWithRetry(
  listOrgUsers: ListOrgUsersFn,
  orgId: string,
  maxAttempts = 4,
): Promise<OrgMember[] | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await listOrgUsers(orgId);
    } catch (err) {
      const retry =
        err instanceof ApiError &&
        err.code === "rate_limited" &&
        attempt < maxAttempts - 1;
      if (!retry) return null;
      await sleep(900 * (attempt + 1));
    }
  }
  return null;
}

export type OrgEmailsLoadCallbacks = {
  onOrgLoaded?: (orgId: string, emails: string[]) => void;
  onOrgFailed?: (orgId: string) => void;
};

function orgTypeLabel(type: string): string {
  if (type === "platform") return "Platform";
  if (type === "agent" || type === "agent_sub") return "Agent account";
  if (type === "merchant") return "Merchant account";
  if (type === "merchant_site") return "Merchant site";
  return type.replace(/_/g, " ");
}

function formatOrgRef(ref: RegisteredEmailRef): string {
  return `${orgTypeLabel(ref.type)} "${ref.name}"`;
}

type ListOrgUsersFn = (orgId: string) => Promise<OrgMember[]>;

const DEFAULT_LIST_ORG_USERS_CONCURRENCY = 3;

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

/** Index org id → normalized member emails for list search. */
export function orgEmailsMapFromBulkRows(
  rows: readonly { orgId: string; emails: string[] }[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const row of rows) {
    const emails = row.emails.map(normalizeEmail).filter(Boolean);
    if (emails.length > 0) index.set(row.orgId, emails);
  }
  return index;
}

/** Preferred contact email per org — Owner first, else first team member. */
export function orgOwnerEmailMapFromBulkRows(
  rows: readonly {
    orgId: string;
    emails: string[];
    ownerEmail?: string | null;
  }[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    const owner = normalizeEmail(row.ownerEmail ?? "");
    if (owner) {
      index.set(row.orgId, owner);
      continue;
    }
    const first = row.emails.map(normalizeEmail).find(Boolean);
    if (first) index.set(row.orgId, first);
  }
  return index;
}

/** Platform-wide email → org index from one bulk API response. */
export function registeredEmailIndexFromBulk(
  orgs: OrgRef[],
  rows: readonly { orgId: string; emails: string[] }[],
): Map<string, RegisteredEmailRef> {
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const index = new Map<string, RegisteredEmailRef>();
  for (const row of rows) {
    const org = orgById.get(row.orgId);
    if (!org) continue;
    for (const raw of row.emails) {
      const email = normalizeEmail(raw);
      if (!email || index.has(email)) continue;
      index.set(email, { ...org, role: "member" });
    }
  }
  return index;
}

/** Load invite-validation index via bulk org-member-emails (one request). */
export async function fetchRegisteredEmailIndex(
  orgs: OrgRef[],
  listBulk: () => Promise<{ orgId: string; emails: string[] }[]>,
): Promise<Map<string, RegisteredEmailRef>> {
  const rows = await listBulk();
  return registeredEmailIndexFromBulk(orgs, rows);
}

/** Index org id → normalized member emails for list search. */
export async function loadOrgEmailsByOrgId(
  orgs: OrgRef[],
  listOrgUsers: ListOrgUsersFn,
  opts?: { concurrency?: number } & OrgEmailsLoadCallbacks,
): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  await runWithConcurrency(
    orgs,
    opts?.concurrency ?? DEFAULT_LIST_ORG_USERS_CONCURRENCY,
    async (org) => {
      const members = await fetchOrgMembersWithRetry(listOrgUsers, org.id);
      if (members === null) {
        opts?.onOrgFailed?.(org.id);
        return;
      }
      const emails = members
        .map((m) => normalizeEmail(m.email ?? ""))
        .filter(Boolean);
      index.set(org.id, emails);
      opts?.onOrgLoaded?.(org.id, emails);
    },
  );
  return index;
}

/** Index normalized email → first org membership seen (platform-wide). */
export async function loadRegisteredUserEmails(
  orgs: OrgRef[],
  listOrgUsers: ListOrgUsersFn,
  opts?: { concurrency?: number },
): Promise<Map<string, RegisteredEmailRef>> {
  const index = new Map<string, RegisteredEmailRef>();
  await runWithConcurrency(
    orgs,
    opts?.concurrency ?? DEFAULT_LIST_ORG_USERS_CONCURRENCY,
    async (org) => {
      const members = await fetchOrgMembersWithRetry(listOrgUsers, org.id);
      if (members === null) return;
      for (const member of members) {
        const email = normalizeEmail(member.email ?? "");
        if (!email || index.has(email)) continue;
        index.set(email, {
          id: org.id,
          type: org.type,
          name: org.name,
          role: member.role,
        });
      }
    },
  );
  return index;
}

/**
 * Returns a user-facing error when email is already on another org account.
 * Pass `exceptOrgId` when inviting to an org (same-org adds are handled by API).
 */
export function registeredEmailConflict(
  email: string,
  index: ReadonlyMap<string, RegisteredEmailRef>,
  opts?: { exceptOrgId?: string },
): string | null {
  const key = normalizeEmail(email);
  if (!key) return null;
  const hit = index.get(key);
  if (!hit) return null;
  if (opts?.exceptOrgId && hit.id === opts.exceptOrgId) return null;
  return `This email is already registered on the platform (${formatOrgRef(hit)}).`;
}

export const REGISTERED_EMAIL_API_MESSAGE =
  "This email is already registered on the platform.";

export function orgMemberEmailExists(
  members: OrgMember[],
  email: string,
): boolean {
  const key = normalizeEmail(email);
  if (!key) return false;
  return members.some((m) => normalizeEmail(m.email ?? "") === key);
}

/**
 * Client-side invite validation. API still enforces platform-wide uniqueness.
 */
export function validatePlatformInviteEmail(
  email: string,
  index: ReadonlyMap<string, RegisteredEmailRef>,
  opts: { targetOrgId: string; members?: OrgMember[] },
): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Email is required.";
  const conflict = registeredEmailConflict(trimmed, index, {
    exceptOrgId: opts.targetOrgId,
  });
  if (conflict) return conflict;
  if (opts.members && orgMemberEmailExists(opts.members, trimmed)) {
    return "User is already a member of this org.";
  }
  return null;
}

export function inviteEmailErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    if (code === "email_taken") return REGISTERED_EMAIL_API_MESSAGE;
  }
  if (err instanceof Error) return err.message;
  return "Invite failed";
}
