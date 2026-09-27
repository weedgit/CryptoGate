import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import { AuthToast } from "../auth/AuthToast";
import {
  ApiError,
  getFeeTierSettings,
  updateFeeTierSettings,
  type FeeTierBand,
  type FeeTierEffectiveTiming,
  type Session,
} from "./api";
import { BillingWalletPanel } from "./BillingWalletPanel";
import { BillingCalendarPanel } from "./BillingCalendarPanel";
import {
  formatVolumeBand,
  nextBillingPeriodLabel,
  TIER_ORDER,
  TIER_TITLE,
  tiersSnapshot,
} from "./feeTierDisplay";
import { sessionIsPlatformOwner } from "./org";
import { PagePending } from "./ui/PlatformPending";

type Props = { session: Session };

function FeesIcon({ children }: { children: ReactNode }) {
  return <span className="plat-fees__icon">{children}</span>;
}

function IconLayers() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3.2 2.5 8.2l9.5 5 9.5-5L12 3.2Zm0 7.1L4.2 9.2 12 13.3l7.8-4.1L12 10.3Zm0 4.3L4.2 13.5 12 17.6l7.8-4.1L12 14.6Zm0 4.3L4.2 17.8 12 21.9l7.8-4.1L12 18.9Z"
      />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19 6H7a2 2 0 0 0-2 2v1H4a1 1 0 0 0 0 2h1v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2Zm0 10H7V9h12v7Zm-2.5-2.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
      />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 3a1 1 0 0 0-1 1v1H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V4a1 1 0 1 0-2 0v1H9V4a1 1 0 0 0-1-1Zm10 8H6v7h12v-7Z"
      />
    </svg>
  );
}

function IconSave() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.6 3.2H5.2A2.2 2.2 0 0 0 3 5.4v13.2A2.2 2.2 0 0 0 5.2 20.8h13.6a2.2 2.2 0 0 0 2.2-2.2V7.8l-3.4-4.6ZM12 18.6a2.6 2.6 0 1 1 0-5.2 2.6 2.6 0 0 1 0 5.2Zm3.4-10.8H6.4V5.2h9Z"
      />
    </svg>
  );
}

function moneyUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function guideExample(tier: FeeTierBand, volume: number) {
  const sub = Number(tier.subscriptionAmountUsd) || 0;
  const feePct = Number(tier.defaultSignupPercent) || 0;
  const agentPct = Number(tier.agentCommissionPercent) || 0;
  const fee = (volume * feePct) / 100;
  const mtc = sub + fee;
  const agent = (fee * agentPct) / 100;
  const pnr = mtc - agent;
  return {
    title: TIER_TITLE[tier.tier] ?? tier.tier,
    volume,
    sub,
    feePct,
    agentPct,
    fee,
    mtc,
    agent,
    pnr,
  };
}

function FeesOwnerGuide({ tiers }: { tiers: FeeTierBand[] }) {
  const small = tiers.find((t) => t.tier === "small");
  const mid = tiers.find((t) => t.tier === "mid");
  const examples = [
    small ? guideExample(small, 10_000) : null,
    mid ? guideExample(mid, 100_000) : null,
  ].filter(Boolean) as ReturnType<typeof guideExample>[];

  return (
    <aside className="plat-fees__guide" aria-label="Platform owner guide">
      <header className="plat-fees__guide-head">
        <h2 className="plat-fees__guide-title">Platform owner guide</h2>
        <p className="plat-fees__guide-lede">
          How schedule, wallet, and calendar money flows work. Examples update
          from the live tier fields on the left.
        </p>
      </header>

      <div className="plat-fees__guide-block">
        <h3>1 · Volume fee schedule</h3>
        <p>
          Merchants land in one volume band. That band sets subscription, default
          signup fee %, fee min/max, and agent commission % of fee revenue.
        </p>
        <p className="plat-fees__guide-formula">
          MTC = Subscription + (Volume × Fee %)
          <br />
          Agent = Fee × Agent commission %
          <br />
          PNR = MTC − Agent
        </p>
        <p>
          <strong>MTC</strong> = merchant total cost · <strong>PNR</strong> =
          platform net revenue (what you keep after the agent cut).
        </p>
        {examples.map((ex) => (
          <div key={ex.title} className="plat-fees__guide-example">
            <strong>
              Example · {ex.title} · {moneyUsd(ex.volume)} volume
            </strong>
            <p>
              Fee @ {ex.feePct}% → {moneyUsd(ex.fee)}
              <br />
              MTC = {moneyUsd(ex.sub)} + {moneyUsd(ex.fee)} ={" "}
              <b>{moneyUsd(ex.mtc)}</b>
              <br />
              Agent @ {ex.agentPct}% → {moneyUsd(ex.agent)}
              <br />
              PNR → <b>{moneyUsd(ex.pnr)}</b>
            </p>
          </div>
        ))}
        <p>
          <strong>Change effectivity</strong> chooses when a saved schedule
          applies: next billing cycle (safer) or immediately.
        </p>
      </div>

      <div className="plat-fees__guide-block">
        <h3>2 · Fee wallet</h3>
        <p>
          Seller name/email on invoices, plus your USDT receive address for
          service bills. Keep both current so merchants can pay you correctly.
        </p>
      </div>

      <div className="plat-fees__guide-block">
        <h3>3 · Billing calendar</h3>
        <p>
          <strong>Agent remittance window (UTC)</strong> is the day range each
          month when agent commissions are paid:
        </p>
        <p className="plat-fees__guide-formula">
          Pay when From day ≤ UTC day-of-month ≤ To day
        </p>
        <div className="plat-fees__guide-example">
          <strong>Example · remittance</strong>
          <p>
            From <b>10</b>, To <b>15</b> → payouts run on the 10th–15th (UTC)
            every month.
          </p>
        </div>
        <p>
          <strong>Activation invoice</strong> is the one-time onboarding bill:
        </p>
        <p className="plat-fees__guide-formula">
          Due date = Signup date + Pay within (days)
        </p>
        <div className="plat-fees__guide-example">
          <strong>Example · activation</strong>
          <p>
            Signup Mar 1, pay within <b>7</b> days → due Mar 8. Amount =
            Activation fee (e.g. {moneyUsd(49)}).
          </p>
        </div>
        <p>
          Turn on <strong>Auto-send invoices</strong> only after seller + wallet
          are correct — otherwise new merchants may get invoices they cannot pay.
        </p>
      </div>
    </aside>
  );
}

function TimingSelect({
  value,
  billingNote,
  disabled,
  onChange,
}: {
  value: FeeTierEffectiveTiming;
  billingNote: string;
  disabled?: boolean;
  onChange: (next: FeeTierEffectiveTiming) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const options: { value: FeeTierEffectiveTiming; label: string }[] = [
    {
      value: "next_billing_cycle",
      label: `Next billing cycle (${billingNote})`,
    },
    { value: "immediate", label: "Immediately" },
  ];
  const current =
    options.find((o) => o.value === value)?.label ?? options[0]!.label;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className={`plat-fees__select${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="plat-fees__select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current}</span>
        <svg viewBox="0 0 12 8" width="10" height="7" aria-hidden="true">
          <path fill="currentColor" d="M6 6.8 1 1.2h10Z" />
        </svg>
      </button>
      {open ? (
        <ul className="plat-fees__select-menu" role="listbox">
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={`plat-fees__select-option${opt.value === value ? " is-active" : ""}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Legacy ?tab=… deep links → section anchors. */
function sectionFromTab(raw: string | null): string | null {
  if (raw === "remittance" || raw === "billing") return "fee-wallet";
  if (raw === "calendar") return "fee-calendar";
  if (raw === "bands" || raw === "pricing") return "fee-schedule";
  return null;
}

/** B8 — Platform fees: schedule, wallet, and billing calendar on one page. */
export function FeeTiersSettingsPage({ session }: Props) {
  const canEdit = useMemo(() => sessionIsPlatformOwner(session), [session]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tiers, setTiers] = useState<FeeTierBand[]>([]);
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [calendarDirty, setCalendarDirty] = useState(false);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [effectiveTiming, setEffectiveTiming] =
    useState<FeeTierEffectiveTiming>("next_billing_cycle");

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
      const settings = await getFeeTierSettings();
      setTiers(settings.tiers);
      setSavedSnapshot(tiersSnapshot(settings.tiers));
      setUpdatedAt(settings.updatedAt);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load fee tiers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const fromTab = sectionFromTab(tab);
    const hash = window.location.hash.replace(/^#/, "");
    const section =
      fromTab ||
      (hash === "fee-wallet" || hash === "fee-calendar" || hash === "fee-schedule"
        ? hash
        : null);
    if (tab != null) {
      setSearchParams({}, { replace: true });
    }
    if (!section) return;
    window.requestAnimationFrame(() => {
      document.getElementById(section)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [searchParams, setSearchParams]);

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
    setMessage(null);
  }

  async function onSaveSchedule(e: FormEvent) {
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
      setMessage(
        effectiveTiming === "immediate"
          ? "Fee schedule saved — live immediately."
          : `Fee schedule saved — applies next billing period (${billingNote}).`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save fee tiers");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <PagePending title="Loading fees…" />;
  }

  return (
    <div className="plat-fees">
      <AuthToast
        message={error ?? message}
        tone={error ? "error" : "ok"}
        onDismiss={() => {
          setError(null);
          setMessage(null);
        }}
      />

      <header className="plat-fees__head">
        <div className="plat-fees__head-main">
          <h1 className="plat-fees__title">Fees</h1>
          {!canEdit ? (
            <span className="plat-fees__readonly-chip">Viewer · read-only</span>
          ) : null}
        </div>
        <p className="plat-fees__subtitle">
          Volume schedule, platform fee wallet, and billing calendar.
        </p>
      </header>

      <div className="plat-fees__layout">
      <div className="plat-fees__stack">
        {/* —— Volume schedule —— */}
        <section className="plat-fees__panel" id="fee-schedule">
          <div className="plat-fees__panel-top">
            <FeesIcon>
              <IconLayers />
            </FeesIcon>
            <div className="plat-fees__panel-copy">
              <h2 className="plat-fees__panel-title">Volume fee schedule</h2>
              <p className="plat-fees__panel-sub">
                Small / Mid / Enterprise bands. Merchants follow this schedule
                automatically; Platform Owner may lock a fixed rate per org.
              </p>
            </div>
          </div>

          <form className="plat-fees__schedule" onSubmit={onSaveSchedule}>
            {dirty && canEdit ? (
              <div className="plat-fees__dirty" role="status">
                Unsaved schedule changes.
              </div>
            ) : null}

            <div className="plat-fees__tier-grid">
              {sortedTiers.map((tier) => {
                const index = tiers.findIndex((t) => t.tier === tier.tier);
                const popular = tier.tier === "mid";
                return (
                  <article
                    key={tier.tier}
                    className={`plat-fees__tier plat-fees__tier--${tier.tier}${popular ? " is-popular" : ""}`}
                  >
                    <header className="plat-fees__tier-head">
                      <h3>{TIER_TITLE[tier.tier] ?? tier.tier}</h3>
                      {popular ? (
                        <span className="plat-fees__tier-badge">Popular</span>
                      ) : null}
                    </header>
                    <p className="plat-fees__tier-band">{formatVolumeBand(tier)}</p>

                    <div className="plat-fees__tier-fields">
                      <label className="plat-fees__field">
                        <span>Subscription (USD)</span>
                        <input
                          inputMode="decimal"
                          value={tier.subscriptionAmountUsd}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, {
                              subscriptionAmountUsd: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="plat-fees__field">
                        <span>Default signup %</span>
                        <input
                          inputMode="decimal"
                          value={tier.defaultSignupPercent}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, {
                              defaultSignupPercent: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="plat-fees__field">
                        <span>Fee min %</span>
                        <input
                          inputMode="decimal"
                          value={tier.volumeFeeMinPercent}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, {
                              volumeFeeMinPercent: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="plat-fees__field">
                        <span>Fee max %</span>
                        <input
                          inputMode="decimal"
                          value={tier.volumeFeeMaxPercent}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, {
                              volumeFeeMaxPercent: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="plat-fees__field">
                        <span>Volume min (USD)</span>
                        <input
                          inputMode="decimal"
                          value={tier.volumeMinUsd ?? "0"}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, { volumeMinUsd: e.target.value })
                          }
                        />
                      </label>
                      <label className="plat-fees__field">
                        <span>Volume max (USD)</span>
                        <input
                          inputMode="decimal"
                          value={tier.volumeMaxUsd ?? ""}
                          disabled={!canEdit || busy}
                          placeholder="Unbounded"
                          onChange={(e) =>
                            patchTier(index, {
                              volumeMaxUsd: e.target.value.trim()
                                ? e.target.value
                                : null,
                            })
                          }
                        />
                      </label>
                      <label className="plat-fees__field plat-fees__field--wide">
                        <span>Agent commission %</span>
                        <input
                          inputMode="decimal"
                          value={tier.agentCommissionPercent ?? "15"}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, {
                              agentCommissionPercent: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="plat-fees__field plat-fees__field--wide">
                        <span>Assignment notes</span>
                        <textarea
                          rows={2}
                          value={tier.tierDescription ?? ""}
                          disabled={!canEdit || busy}
                          onChange={(e) =>
                            patchTier(index, { tierDescription: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>

            {canEdit ? (
              <div className="plat-fees__schedule-foot">
                <div className="plat-fees__timing">
                  <span>When schedule changes take effect</span>
                  <TimingSelect
                    value={effectiveTiming}
                    billingNote={billingNote}
                    disabled={busy}
                    onChange={(next) => {
                      setEffectiveTiming(next);
                      setMessage(null);
                    }}
                  />
                </div>
                <div className="plat-fees__schedule-actions">
                  <p className="plat-fees__meta">
                    {updatedAt
                      ? `Last saved ${new Date(updatedAt).toLocaleString()}`
                      : null}
                  </p>
                  <button
                    type="submit"
                    className="plat-fees__save"
                    disabled={busy || !dirty}
                  >
                    <IconSave />
                    {busy ? "Saving…" : "Save schedule"}
                  </button>
                </div>
              </div>
            ) : null}
          </form>
        </section>

        {/* —— Fee wallet —— */}
        <section className="plat-fees__panel plat-fees__panel--block" id="fee-wallet">
          <div className="plat-fees__panel-top">
            <FeesIcon>
              <IconWallet />
            </FeesIcon>
            <div className="plat-fees__panel-copy">
              <h2 className="plat-fees__panel-title">Fee wallet</h2>
              <p className="plat-fees__panel-sub">
                Invoice seller details and the USDT address merchants use to pay
                platform service bills.
              </p>
            </div>
          </div>
          <BillingWalletPanel session={session} embedded />
        </section>

        {/* —— Billing calendar —— */}
        <section className="plat-fees__panel plat-fees__panel--block" id="fee-calendar">
          <div className="plat-fees__panel-top">
            <FeesIcon>
              <IconCalendar />
            </FeesIcon>
            <div className="plat-fees__panel-copy">
              <h2 className="plat-fees__panel-title">Billing calendar</h2>
              <p className="plat-fees__panel-sub">
                Activation fee, pay-within window, auto-send, and agent remittance
                days (UTC).
              </p>
            </div>
            {canEdit ? (
              <button
                type="submit"
                form="fee-billing-calendar-form"
                className="plat-fees__save"
                disabled={!calendarDirty || calendarBusy}
              >
                {calendarBusy ? "Saving…" : "Save calendar"}
              </button>
            ) : null}
          </div>
          <BillingCalendarPanel
            session={session}
            embedded
            formId="fee-billing-calendar-form"
            onDirtyChange={setCalendarDirty}
            onBusyChange={setCalendarBusy}
          />
        </section>
      </div>

      <FeesOwnerGuide tiers={sortedTiers} />
      </div>
    </div>
  );
}
