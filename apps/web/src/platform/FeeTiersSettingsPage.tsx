import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  decideEnterpriseRateApproval,
  getFeeTierSettings,
  listEnterpriseRateApprovals,
  updateFeeTierSettings,
  type EnterpriseRateApproval,
  type FeeTierBand,
  type FeeTierEffectiveTiming,
  type Session,
} from "./api";
import { BillingWalletPanel } from "./BillingWalletPanel";
import { BillingCalendarPanel } from "./BillingCalendarPanel";
import {
  formatTierPercent,
  formatTierSubscription,
  formatVolumeBand,
  nextBillingPeriodLabel,
  TIER_ORDER,
  TIER_TITLE,
  tierFeatures,
  tiersSnapshot,
} from "./feeTierDisplay";
import { sessionIsPlatformOwner } from "./org";
import { OrgListPagination } from "./OrgListPagination";
import { PagePending } from "./ui/PlatformPending";

const TIER_LABEL: Record<string, string> = {
  small: "Small",
  mid: "Mid",
  enterprise: "Enterprise",
};

const OVERRIDES_PAGE_SIZE = 18;

type TabId = "pricing" | "bands" | "overrides" | "remittance" | "calendar";

function parseTab(raw: string | null): TabId {
  if (
    raw === "overrides" ||
    raw === "bands" ||
    raw === "remittance" ||
    raw === "calendar"
  ) {
    return raw;
  }
  /* Legacy Fees → Billing deep link */
  if (raw === "billing") return "remittance";
  return "pricing";
}

type Props = { session: Session };

function overrideStatusTone(status: string): string {
  if (status === "approved") return "ok";
  if (status === "pending") return "warn";
  return "muted";
}

function overrideStatusLabel(status: string): string {
  if (status === "approved") return "ACTIVE OVERRIDE";
  if (status === "pending") return "PENDING";
  if (status === "denied") return "DENIED";
  return status.toUpperCase();
}

/** B8 — Fee tiers & pricing (Figma `b8-fee-tiers-pricing`). */
export function FeeTiersSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<TabId>(() => parseTab(searchParams.get("tab")));
  const [tiers, setTiers] = useState<FeeTierBand[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<EnterpriseRateApproval[]>([]);
  const [overridesPage, setOverridesPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [billingDirty, setBillingDirty] = useState(false);
  const [calendarDirty, setCalendarDirty] = useState(false);
  const [effectiveTiming, setEffectiveTiming] =
    useState<FeeTierEffectiveTiming>("next_billing_cycle");
  const [pendingEffectiveFrom, setPendingEffectiveFrom] = useState<string | null>(
    null,
  );

  const pendingOverrideCount = useMemo(
    () => approvals.filter((a) => a.status === "pending").length,
    [approvals],
  );

  const billingNote = useMemo(() => nextBillingPeriodLabel(), []);
  const dirty = tiersSnapshot(tiers) !== savedSnapshot;

  const sortedTiers = useMemo(
    () =>
      [...tiers].sort(
        (a, b) =>
          TIER_ORDER.indexOf(a.tier as (typeof TIER_ORDER)[number]) -
          TIER_ORDER.indexOf(b.tier as (typeof TIER_ORDER)[number]),
      ),
    [tiers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, pending, approved] = await Promise.all([
        getFeeTierSettings(),
        listEnterpriseRateApprovals({ status: "pending" }),
        listEnterpriseRateApprovals({ status: "approved" }),
      ]);
      setTiers(settings.tiers);
      setSavedSnapshot(tiersSnapshot(settings.tiers));
      setUpdatedAt(settings.updatedAt);
      setPendingEffectiveFrom(settings.pendingEffectiveFrom ?? null);
      setApprovals(
        [...pending, ...approved].sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt),
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load fee tiers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overridesPageCount = Math.max(
    1,
    Math.ceil(approvals.length / OVERRIDES_PAGE_SIZE),
  );

  useEffect(() => {
    if (overridesPage > overridesPageCount) {
      setOverridesPage(overridesPageCount);
    }
  }, [overridesPage, overridesPageCount]);

  const pagedApprovals = useMemo(() => {
    const start = (overridesPage - 1) * OVERRIDES_PAGE_SIZE;
    return approvals.slice(start, start + OVERRIDES_PAGE_SIZE);
  }, [approvals, overridesPage]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function patchTier(index: number, patch: Partial<FeeTierBand>) {
    setTiers((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function switchTab(next: TabId) {
    if (dirty && tab === "bands" && next !== "bands") {
      const leave = window.confirm(
        "Band settings have unsaved changes. Leave without saving?",
      );
      if (!leave) return;
    }
    if (billingDirty && tab === "remittance" && next !== "remittance") {
      const leave = window.confirm(
        "Fee wallet has unsaved changes. Leave without saving?",
      );
      if (!leave) return;
    }
    if (calendarDirty && tab === "calendar" && next !== "calendar") {
      const leave = window.confirm(
        "Billing calendar has unsaved changes. Leave without saving?",
      );
      if (!leave) return;
    }
    setTab(next);
    setSearchParams(
      next === "pricing" ? {} : { tab: next },
      { replace: true },
    );
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await updateFeeTierSettings({ tiers, effectiveTiming });
      setTiers(saved.tiers);
      setSavedSnapshot(tiersSnapshot(saved.tiers));
      setUpdatedAt(saved.updatedAt);
      setPendingEffectiveFrom(saved.pendingEffectiveFrom ?? null);
      setMessage(
        effectiveTiming === "immediate"
          ? "Fee tiers saved — schedule is live immediately."
          : `Fee tiers saved — changes apply next billing period (${billingNote}).`,
      );
      setTab("pricing");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save fee tiers");
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(id: string, decision: "approve" | "deny") {
    if (!canEdit) return;
    let reason: string | undefined;
    if (decision === "deny") {
      reason = window.prompt("Denial reason (required):")?.trim();
      if (!reason) return;
    }
    setBusy(true);
    setError(null);
    try {
      await decideEnterpriseRateApproval(id, { decision, reason });
      await load();
      setMessage(decision === "approve" ? "Enterprise rate approved." : "Request denied.");
      setTab("overrides");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Decision failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="plat-fee-tiers">
      <AuthToast
        message={error ?? message}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setMessage(null);
        }}
      />
      <div className="b3-agent-detail__tabs" role="tablist" aria-label="Platform fees">
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "pricing" ? " is-active" : ""}`}
          aria-selected={tab === "pricing"}
          onClick={() => switchTab("pricing")}
        >
          Platform fees
        </button>
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "bands" ? " is-active" : ""}`}
          aria-selected={tab === "bands"}
          onClick={() => switchTab("bands")}
        >
          Band settings
        </button>
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "overrides" ? " is-active" : ""}`}
          aria-selected={tab === "overrides"}
          onClick={() => switchTab("overrides")}
        >
          Rate overrides
          {pendingOverrideCount > 0 ? (
            <span className="plat-fee-tiers__tab-count">{pendingOverrideCount}</span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "remittance" ? " is-active" : ""}`}
          aria-selected={tab === "remittance"}
          onClick={() => switchTab("remittance")}
        >
          Fee wallet
        </button>
        <button
          type="button"
          role="tab"
          className={`b3-agent-detail__tab${tab === "calendar" ? " is-active" : ""}`}
          aria-selected={tab === "calendar"}
          onClick={() => switchTab("calendar")}
        >
          Billing calendar
        </button>
      </div>

      {tab === "remittance" ? (
        <BillingWalletPanel session={session} onDirtyChange={setBillingDirty} />
      ) : tab === "calendar" ? (
        <BillingCalendarPanel session={session} onDirtyChange={setCalendarDirty} />
      ) : loading ? (
        <PagePending />
      ) : tab === "pricing" ? (
        <>
          <div className="plat-fee-tiers__banner" role="status">
            <span className="plat-fee-tiers__banner-icon" aria-hidden />
            <p>
              Merchants and agents follow the volume schedule automatically.
              Platform Owner may lock fixed specials per org. Band edits can
              apply immediately or from the next billing period ({billingNote})
              {pendingEffectiveFrom
                ? ` — pending schedule live ${pendingEffectiveFrom}`
                : ""}.
            </p>
          </div>

          {updatedAt ? (
            <p className="plat-fee-tiers__meta">
              Last updated {new Date(updatedAt).toLocaleString()}
            </p>
          ) : null}

          <div className="plat-fee-tiers__cards">
            {sortedTiers.map((tier, index) => {
              const popular = tier.tier === "mid";
              const features = tierFeatures(tier);
              return (
                <article
                  key={tier.tier}
                  className={`plat-fee-tier-card plat-fee-tier-card--${tier.tier}${popular ? " plat-fee-tier-card--popular" : ""}`}
                  style={{ animationDelay: `${index * 60}ms` }}
                >
                  <header className="plat-fee-tier-card__head">
                    <h3>{TIER_TITLE[tier.tier] ?? tier.tier}</h3>
                    {popular ? (
                      <span className="plat-fee-tier-card__badge">POPULAR</span>
                    ) : null}
                  </header>
                  <div className="plat-fee-tier-card__price">
                    <p className="plat-fee-tier-card__rate">
                      {formatTierPercent(tier.defaultSignupPercent)}{" "}
                      <span>
                        + {formatTierSubscription(tier.subscriptionAmountUsd)}
                      </span>
                    </p>
                    <p className="plat-fee-tier-card__band">
                      {formatVolumeBand(tier)}
                    </p>
                    <p className="plat-fee-tier-card__range">
                      Merchant fee {formatTierPercent(tier.defaultSignupPercent)}
                      {" · "}
                      Agent commission{" "}
                      {formatTierPercent(tier.agentCommissionPercent ?? "15")}
                    </p>
                  </div>
                  <ul className="plat-fee-tier-card__features" aria-label="Tier assignment notes">
                    {features.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {canEdit ? (
                    <button
                      type="button"
                      className="plat-fee-tier-card__edit"
                      onClick={() => setTab("bands")}
                    >
                      Edit band
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      ) : tab === "bands" ? (
        <div className="plat-fee-bands">
          <div className="plat-fee-bands__notice" role="status">
            <p>
              Independent merchant volume fees and agent commissions per tier.
              Choose when schedule changes take effect below — not retroactive
              on open service bills.
            </p>
          </div>

          {dirty ? (
            <div className="plat-fee-bands__dirty" role="status">
              Unsaved changes — save before leaving this tab.
            </div>
          ) : null}

          {!canEdit ? (
            <p className="plat-fee-bands__readonly">
              Platform Owner only — Administrators and Viewers are read-only.
            </p>
          ) : null}

          <form className="plat-fee-bands__form" onSubmit={onSave}>
            <div className="plat-fee-bands__grid">
            {sortedTiers.map((tier) => {
              const index = tiers.findIndex((t) => t.tier === tier.tier);
              const popular = tier.tier === "mid";
              return (
                <section
                  key={tier.tier}
                  className={`plat-fee-bands__tier${popular ? " plat-fee-bands__tier--mid" : ""}`}
                >
                  <header className="plat-fee-bands__tier-head">
                    <div>
                      <h3>{TIER_TITLE[tier.tier] ?? tier.tier}</h3>
                      <p>
                        {formatVolumeBand(tier)} · automatic schedule rates
                      </p>
                    </div>
                    {popular ? (
                      <span className="plat-fee-tier-card__badge">POPULAR</span>
                    ) : null}
                  </header>

                  <div className="plat-fee-bands__metrics">
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-sub`}>
                        Subscription (USD)
                      </label>
                      <input
                        id={`${tier.tier}-sub`}
                        className="b4-field__control"
                        inputMode="decimal"
                        value={tier.subscriptionAmountUsd}
                        onChange={(e) =>
                          patchTier(index, {
                            subscriptionAmountUsd: e.target.value,
                          })
                        }
                        disabled={!canEdit || busy}
                      />
                    </div>
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-min`}>
                        Volume fee min
                      </label>
                      <div className="plat-fee-bands__affix-wrap plat-fee-bands__affix-wrap--suffix">
                        <input
                          id={`${tier.tier}-min`}
                          className="b4-field__control plat-fee-bands__affix-input plat-fee-bands__affix-input--suffix"
                          inputMode="decimal"
                          value={tier.volumeFeeMinPercent}
                          onChange={(e) =>
                            patchTier(index, {
                              volumeFeeMinPercent: e.target.value,
                            })
                          }
                          disabled={!canEdit || busy}
                        />
                        <span className="plat-fee-bands__affix plat-fee-bands__affix--suffix" aria-hidden>
                          %
                        </span>
                      </div>
                    </div>
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-max`}>
                        Volume fee max
                      </label>
                      <div className="plat-fee-bands__affix-wrap plat-fee-bands__affix-wrap--suffix">
                        <input
                          id={`${tier.tier}-max`}
                          className="b4-field__control plat-fee-bands__affix-input plat-fee-bands__affix-input--suffix"
                          inputMode="decimal"
                          value={tier.volumeFeeMaxPercent}
                          onChange={(e) =>
                            patchTier(index, {
                              volumeFeeMaxPercent: e.target.value,
                            })
                          }
                          disabled={!canEdit || busy}
                        />
                        <span className="plat-fee-bands__affix plat-fee-bands__affix--suffix" aria-hidden>
                          %
                        </span>
                      </div>
                    </div>
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-default`}>
                        Default signup rate
                      </label>
                      <div className="plat-fee-bands__affix-wrap plat-fee-bands__affix-wrap--suffix">
                        <input
                          id={`${tier.tier}-default`}
                          className="b4-field__control plat-fee-bands__affix-input plat-fee-bands__affix-input--suffix"
                          inputMode="decimal"
                          value={tier.defaultSignupPercent}
                          onChange={(e) =>
                            patchTier(index, {
                              defaultSignupPercent: e.target.value,
                            })
                          }
                          disabled={!canEdit || busy}
                        />
                        <span className="plat-fee-bands__affix plat-fee-bands__affix--suffix" aria-hidden>
                          %
                        </span>
                      </div>
                    </div>

                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-vmin`}>
                        Volume min (USD)
                      </label>
                      <input
                        id={`${tier.tier}-vmin`}
                        className="b4-field__control"
                        inputMode="decimal"
                        value={tier.volumeMinUsd ?? "0"}
                        onChange={(e) =>
                          patchTier(index, { volumeMinUsd: e.target.value })
                        }
                        disabled={!canEdit || busy}
                      />
                    </div>
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-vmax`}>
                        Volume max (USD)
                      </label>
                      <input
                        id={`${tier.tier}-vmax`}
                        className="b4-field__control"
                        inputMode="decimal"
                        value={tier.volumeMaxUsd ?? ""}
                        onChange={(e) =>
                          patchTier(index, {
                            volumeMaxUsd: e.target.value.trim()
                              ? e.target.value
                              : null,
                          })
                        }
                        disabled={!canEdit || busy}
                        placeholder="Unbounded"
                      />
                    </div>
                    <div className="b4-field">
                      <label className="b4-field__label" htmlFor={`${tier.tier}-agent`}>
                        Agent commission
                      </label>
                      <div className="plat-fee-bands__affix-wrap plat-fee-bands__affix-wrap--suffix">
                        <input
                          id={`${tier.tier}-agent`}
                          className="b4-field__control plat-fee-bands__affix-input plat-fee-bands__affix-input--suffix"
                          inputMode="decimal"
                          value={tier.agentCommissionPercent ?? "15"}
                          onChange={(e) =>
                            patchTier(index, {
                              agentCommissionPercent: e.target.value,
                            })
                          }
                          disabled={!canEdit || busy}
                        />
                        <span className="plat-fee-bands__affix plat-fee-bands__affix--suffix" aria-hidden>
                          %
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="b4-field plat-fee-bands__notes">
                    <label className="b4-field__label" htmlFor={`${tier.tier}-notes`}>
                      Tier assignment notes
                    </label>
                    <textarea
                      id={`${tier.tier}-notes`}
                      className="b4-field__control plat-fee-bands__textarea"
                      rows={3}
                      value={tier.tierDescription ?? ""}
                      onChange={(e) =>
                        patchTier(index, { tierDescription: e.target.value })
                      }
                      disabled={!canEdit || busy}
                      placeholder={"Single-location merchants, low volume\nAgent assigns rate within band"}
                    />
                    <p className="b4-field__hint">
                      One line per bullet on the Pricing tab.
                    </p>
                  </div>
                </section>
              );
            })}
            </div>

            {canEdit ? (
              <div className="plat-fee-bands__timing b4-field" style={{ marginTop: "1.25rem" }}>
                <label className="b4-field__label" htmlFor="fee-tier-timing">
                  When schedule changes take effect
                </label>
                <select
                  id="fee-tier-timing"
                  className="b4-field__control"
                  value={effectiveTiming}
                  onChange={(e) =>
                    setEffectiveTiming(e.target.value as FeeTierEffectiveTiming)
                  }
                  disabled={busy}
                >
                  <option value="next_billing_cycle">
                    Next billing cycle ({billingNote})
                  </option>
                  <option value="immediate">Immediately</option>
                </select>
              </div>
            ) : null}

            {canEdit ? (
              <div className="plat-fee-bands__actions">
                <p className="plat-fee-bands__actions-note">
                  {dirty
                    ? "You have unsaved band changes."
                    : updatedAt
                      ? `Last saved ${new Date(updatedAt).toLocaleString()}`
                      : "Showing platform defaults — save once to persist."}
                </p>
                <div className="plat-fee-bands__actions-buttons">
                  <button
                    type="submit"
                    className="btn-primary plat-fee-bands__save"
                    disabled={busy || !dirty}
                  >
                    {busy ? "Saving…" : "Save fee tiers"}
                  </button>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      ) : (
        <section className="plat-fee-tiers__overrides" id="fee-tier-overrides">
          <div className="plat-fee-tiers__overrides-head">
            <div className="plat-fee-tiers__overrides-titles">
              <h2>Custom merchant rate overrides</h2>
              <p className="plat-fee-tiers__overrides-lede">
                Fixed specials and legacy enterprise rate requests. Prefer locking
                a fixed rate from the merchant detail page (Platform Owner).
                Approved rates stay here until you change or revoke them.
              </p>
            </div>
            {pendingOverrideCount > 0 ? (
              <span className="plat-fee-tiers__overrides-pending">
                {pendingOverrideCount} pending
              </span>
            ) : null}
          </div>
          {!canEdit ? (
            <p className="plat-fee-tiers__readonly">
              Platform Owner approves or denies pending Enterprise rates.
            </p>
          ) : null}
          {approvals.length === 0 ? (
            <div className="plat-fee-tiers__empty" role="status">
              <div className="plat-fee-tiers__empty-mark" aria-hidden>
                <svg viewBox="0 0 48 48" width="32" height="32" fill="none">
                  <rect
                    x="10"
                    y="8"
                    width="28"
                    height="32"
                    rx="3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M16 18h16M16 24h10"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <circle
                    cx="18"
                    cy="33"
                    r="2.2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <circle
                    cx="30"
                    cy="33"
                    r="2.2"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                  <path
                    d="M20 35.5 28 30.5"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h3 className="plat-fee-tiers__empty-title">
                No enterprise rate overrides yet
              </h3>
              <p className="plat-fee-tiers__empty-copy">
                When an agent requests a custom Enterprise rate during merchant
                onboard, the request lands in this queue for review.
              </p>
              <ul className="plat-fee-tiers__empty-hints">
                <li>Requested on merchant onboard — not from this page</li>
                <li>Platform Owner approves or denies pending rates</li>
              </ul>
            </div>
          ) : (
            <div className="plat-fee-tiers__table-wrap">
              <table className="plat-fee-tiers__table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Custom rate</th>
                    <th>Tier</th>
                    <th>Granted by</th>
                    <th>Status</th>
                    {canEdit ? (
                      <th className="plat-fee-tiers__th-actions">Actions</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {pagedApprovals.map((row) => (
                    <tr key={row.id}>
                      <td>{row.merchantName}</td>
                      <td className="mono">
                        {formatTierPercent(row.requestedVolumeFeePercent)}
                      </td>
                      <td>{TIER_LABEL[row.requestedTier] ?? row.requestedTier}</td>
                      <td className="muted mono">
                        {row.requestedByUserId.slice(0, 12)}…
                      </td>
                      <td>
                        <span
                          className={`status-badge tone-${overrideStatusTone(row.status)}`}
                        >
                          {overrideStatusLabel(row.status)}
                        </span>
                      </td>
                      {canEdit ? (
                        <td className="plat-fee-tiers__actions">
                          <div className="plat-fee-tiers__action-row">
                            {row.status === "pending" ? (
                              <>
                                <button
                                  type="button"
                                  className="plat-fee-tiers__approve"
                                  disabled={busy}
                                  onClick={() => void onDecide(row.id, "approve")}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="plat-fee-tiers__deny"
                                  disabled={busy}
                                  onClick={() => void onDecide(row.id, "deny")}
                                >
                                  Deny
                                </button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
              <OrgListPagination
                page={overridesPage}
                pageCount={overridesPageCount}
                total={approvals.length}
                pageSize={OVERRIDES_PAGE_SIZE}
                onPageChange={setOverridesPage}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
