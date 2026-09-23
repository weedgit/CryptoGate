/**
 * Subject-org setup completeness for platform/agent detail Overview
 * (not the signed-in session gate — that lives in contactVerification.ts).
 */

export type SubjectSetupKind = "agent" | "merchant";

export type SubjectSetupInput = {
  kind: SubjectSetupKind;
  name?: string | null;
  billingEmail?: string | null;
  country?: string | null;
  owner?: {
    emailVerified?: boolean;
    phoneVerified?: boolean;
    firstName?: string | null;
    lastName?: string | null;
    timezone?: string | null;
  } | null;
  walletSet: boolean;
};

export type SubjectSetupStatus = {
  done: number;
  total: number;
  ready: boolean;
  missing: string[];
};

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function subjectOrgSetupStatus(
  input: SubjectSetupInput,
): SubjectSetupStatus {
  const checks: { label: string; ok: boolean }[] = [
    { label: "business name", ok: hasText(input.name) },
    {
      label: "billing email",
      ok: hasText(input.billingEmail) && input.billingEmail!.includes("@"),
    },
  ];
  if (input.kind === "merchant") {
    checks.push({ label: "country", ok: hasText(input.country) });
  }
  const owner = input.owner;
  checks.push({
    label: "owner name",
    ok: Boolean(owner && hasText(owner.firstName) && hasText(owner.lastName)),
  });
  checks.push({
    label: "owner email verified",
    ok: owner?.emailVerified === true,
  });
  checks.push({
    label: "owner phone verified",
    ok: owner?.phoneVerified === true,
  });
  checks.push({
    label: "owner timezone",
    ok: Boolean(owner && hasText(owner.timezone)),
  });
  checks.push({
    label: input.kind === "agent" ? "payout wallet" : "settlement wallet",
    ok: input.walletSet,
  });

  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const done = checks.filter((c) => c.ok).length;
  return {
    done,
    total: checks.length,
    ready: missing.length === 0,
    missing,
  };
}
