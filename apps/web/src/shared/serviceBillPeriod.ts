/** Merchant must exist on or before billing period end (UTC) to be billable. */
export function merchantOnboardedInPeriod(
  createdAt: string | undefined,
  periodEnd: string,
): boolean {
  if (!periodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return true;
  if (!createdAt) return true;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  const periodEndMs = Date.parse(`${periodEnd}T23:59:59.999Z`);
  return created <= periodEndMs;
}

export function merchantsSkippedForPeriod(
  merchants: { id: string; createdAt?: string }[],
  periodEnd: string,
): { id: string; createdAt?: string }[] {
  return merchants.filter((m) => !merchantOnboardedInPeriod(m.createdAt, periodEnd));
}
