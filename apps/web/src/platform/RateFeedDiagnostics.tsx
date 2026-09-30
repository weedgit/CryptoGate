import { FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChartHelpButton } from "./ui/ChartHelpButton";
import {
  ApiError,
  getRateFeedStatus,
  postRateTestQuote,
  type RateFeedStatus,
  type RateFeedVenueRow,
  type RateTestQuoteResult,
} from "../merchant/api";
import { enabledRegistry, networkShortLabel } from "../shared/assetNetworks";
import { RATE_VENUES as VENUES, VENUE_LABEL } from "./rateVenues";

function ageLabel(seconds: number): string {
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

export function formatRate(raw: string | null): string {
  if (!raw) return "—";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  const digits = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

function IconPulse() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 12h3.6l2.2-5.4a1 1 0 0 1 1.9.1l2.6 9.6 1.8-4.3a1 1 0 0 1 .9-.6H21a1 1 0 1 1 0 2h-4.3l-2.6 6.1a1 1 0 0 1-1.9-.1L9.6 9.9l-1.3 3.4a1 1 0 0 1-.9.7H3a1 1 0 1 1 0-2Z"
      />
    </svg>
  );
}

function IconCalc() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 2h10a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v3h12V5a1 1 0 0 0-1-1H7Zm-1 6v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9H6Zm2 2h2v2H8v-2Zm0 4h2v2H8v-2Zm3-4h2v2h-2v-2Zm0 4h2v2h-2v-2Zm3-4h2v6h-2v-6Z"
      />
    </svg>
  );
}

function PanelIcon({ children }: { children: ReactNode }) {
  return <span className="plat-rates__icon">{children}</span>;
}

function VenueCell({ row }: { row: RateFeedVenueRow | undefined }) {
  if (!row || !row.supported) {
    return <td className="plat-feed__cell plat-feed__cell--na">no market</td>;
  }
  const off = !row.enabled;
  const paused = row.pausedUntil
    ? `paused for quotes until ${timeLabel(row.pausedUntil)}`
    : null;
  if (!row.rate) {
    return (
      <td className={`plat-feed__cell plat-feed__cell--bad${off ? " is-off" : ""}`}>
        <span className="plat-feed__rate" title={row.error ?? undefined}>
          Failed
        </span>
        <span className="plat-feed__meta">{paused ?? row.error}</span>
      </td>
    );
  }
  return (
    <td className={`plat-feed__cell${off ? " is-off" : ""}${paused ? " plat-feed__cell--warn" : ""}`}>
      <span className="plat-feed__rate">{formatRate(row.rate)}</span>
      <span className="plat-feed__meta">
        {off ? "off · " : ""}
        {paused ? `${paused} · ` : ""}
        {row.deviationBps !== null ? `${row.deviationBps} bps` : ""}
        {row.latencyMs !== null ? ` · ${row.latencyMs} ms` : ""}
      </span>
    </td>
  );
}

function HealthBadge({
  healthy,
  required,
  quotable,
  staleAgeSeconds = null,
}: {
  healthy: number;
  required: number;
  quotable: boolean;
  /** Age of the last good price when quotes are running on it. */
  staleAgeSeconds?: number | null;
}) {
  if (!quotable && staleAgeSeconds !== null) {
    return (
      <span
        className="plat-feed__badge is-warn"
        title={`Quotes reuse the last good price from ${ageLabel(staleAgeSeconds)} ago`}
      >
        Stale {healthy}/{required}
      </span>
    );
  }
  return (
    <span className={`plat-feed__badge ${quotable ? "is-ok" : "is-bad"}`}>
      {quotable ? "OK" : "Fails"} {healthy}/{required}
    </span>
  );
}

function MonitorLine({ status }: { status: RateFeedStatus }) {
  const m = status.monitor;
  const every = status.settings.refreshIntervalSeconds ?? 20;
  if (!m || m.status === "unknown") {
    return <p className="plat-feed__monitor">Background refresh has not run yet.</p>;
  }
  if (m.status === "off") {
    return <p className="plat-feed__monitor">Background refresh is idle while rates are disabled.</p>;
  }
  const bad = m.assets.filter((a) => a.state !== "ok");
  if (bad.length === 0) {
    return (
      <p className="plat-feed__monitor">
        Background refresh every {every}s: every feed is live
        {m.checkedAt ? ` (last run ${timeLabel(m.checkedAt)})` : ""}.
      </p>
    );
  }
  return (
    <p className="plat-feed__monitor is-bad">
      Background refresh: {bad.map((a) => `${a.asset} ${a.state}`).join(", ")}.
      {m.alertOpen && m.alertSince
        ? ` Platform staff were alerted at ${timeLabel(m.alertSince)}.`
        : " An alert goes out if this lasts two runs."}
    </p>
  );
}

/** Live per-venue probe of the USD and EUR/USD feeds. */
export function RateFeedStatusPanel() {
  const [status, setStatus] = useState<RateFeedStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setStatus(await getRateFeedStatus(refresh));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to probe rate feeds");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  const chainlinkOn = status?.settings.chainlinkReferenceEnabled ?? false;

  return (
    <section className="plat-rates__panel plat-feed">
      <div className="plat-rates__panel-top">
        <PanelIcon>
          <IconPulse />
        </PanelIcon>
        <div className="plat-rates__panel-copy">
          <h2 className="plat-rates__panel-title">
            Rate feed status
            <ChartHelpButton
              openOnHover
              label="Rate feed status help"
              text="Fetches every venue live for each asset. Orders use the median of the enabled venues. When fewer than the minimum answer, quotes reuse the last good price for up to 10 minutes (Stale), then fail with rates_unavailable; pegged 1:1 stablecoin orders keep quoting while the last known price or Chainlink confirms the peg. A source that fails three times in a row is paused for a minute. CoinGecko is fetched at most once per interval to stay inside its free plan. Deviation is each venue's distance from the median."
            />
          </h2>
          <p className="plat-rates__panel-sub">
            {status
              ? `Checked ${timeLabel(status.checkedAt)}${status.cached ? " (cached)" : ""}.`
              : "Live check of every rate venue."}
          </p>
        </div>
        <button
          type="button"
          className="plat-rates__save"
          disabled={loading}
          onClick={() => void load(true)}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {status ? <MonitorLine status={status} /> : null}
      {error ? <p className="plat-feed__error">{error}</p> : null}
      {status && !status.settings.ratesEnabled ? (
        <p className="plat-feed__error">
          Rates are disabled: every rate-priced quote fails regardless of venue health.
        </p>
      ) : null}

      {status ? (
        <div className="plat-feed__table-wrap">
          <table className="plat-feed__table">
            <thead>
              <tr>
                <th>Pair</th>
                {VENUES.map((v) => (
                  <th key={v}>{VENUE_LABEL[v]}</th>
                ))}
                <th>Median</th>
                <th>Chainlink{chainlinkOn ? "" : " (check off)"}</th>
                <th>Quotes</th>
              </tr>
            </thead>
            <tbody>
              {status.assets.map((a) => (
                <tr key={a.asset}>
                  <th scope="row">{a.asset}/USD</th>
                  {VENUES.map((v) => (
                    <VenueCell key={v} row={a.venues.find((r) => r.venue === v)} />
                  ))}
                  <td className="plat-feed__cell">
                    <span className="plat-feed__rate">{formatRate(a.median)}</span>
                  </td>
                  {a.chainlink ? (
                    <td
                      className={`plat-feed__cell${
                        a.chainlink.error
                          ? " plat-feed__cell--bad"
                          : a.chainlink.withinBand === false
                            ? " plat-feed__cell--warn"
                            : ""
                      }`}
                    >
                      <span className="plat-feed__rate" title={a.chainlink.error ?? undefined}>
                        {a.chainlink.rate ? formatRate(a.chainlink.rate) : "Failed"}
                      </span>
                      <span className="plat-feed__meta">
                        {a.chainlink.error ??
                          (a.chainlink.deviationBps !== null
                            ? `${a.chainlink.deviationBps} bps (band ${status.settings.referenceDeviationBps})`
                            : "")}
                      </span>
                    </td>
                  ) : (
                    <td className="plat-feed__cell plat-feed__cell--na">no feed</td>
                  )}
                  <td>
                    <HealthBadge
                      healthy={a.healthyCount}
                      required={a.requiredSources}
                      quotable={a.quotable}
                      staleAgeSeconds={
                        a.lastGoodAgeSeconds != null &&
                        a.lastGoodAgeSeconds <= (status.settings.staleMaxSeconds ?? 600)
                          ? a.lastGoodAgeSeconds
                          : null
                      }
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">EUR/USD</th>
                {VENUES.map((v) => {
                  const r = status.eurUsd.venues.find((x) => x.venue === v);
                  return (
                    <VenueCell
                      key={v}
                      row={
                        r
                          ? { ...r, enabled: true, supported: r.supported ?? true, latencyMs: null }
                          : undefined
                      }
                    />
                  );
                })}
                <td className="plat-feed__cell">
                  <span className="plat-feed__rate">{formatRate(status.eurUsd.median)}</span>
                </td>
                <td className="plat-feed__cell plat-feed__cell--na">no feed</td>
                <td>
                  <HealthBadge
                    healthy={status.eurUsd.healthyCount}
                    required={status.eurUsd.requiredSources}
                    quotable={status.eurUsd.quotable}
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : loading ? (
        <p className="plat-rates__panel-sub plat-feed__full">Checking venues…</p>
      ) : null}
    </section>
  );
}

type Currency = "USD" | "EUR" | "CRYPTO";
type Mode = "market" | "pegged_1to1";

/** Dry-run quote through the same pricing path as create-order. */
export function RateTestQuotePanel() {
  const pairs = useMemo(() => enabledRegistry(), []);
  const [pairKey, setPairKey] = useState(() =>
    pairs[0] ? `${pairs[0].asset}|${pairs[0].network}` : "",
  );
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [mode, setMode] = useState<Mode>("market");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RateTestQuoteResult | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const [asset, network] = pairKey.split("|");
    if (!asset || !network) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await postRateTestQuote({ asset, network, amount: amount.trim(), currency, pricingMode: mode }),
      );
    } catch (err) {
      setError(
        err instanceof ApiError ? `${err.code ?? "error"}: ${err.message}` : "Test quote failed",
      );
    } finally {
      setBusy(false);
    }
  }

  const q = result?.quote;

  return (
    <section className="plat-rates__panel plat-feed">
      <div className="plat-rates__panel-top">
        <PanelIcon>
          <IconCalc />
        </PanelIcon>
        <div className="plat-rates__panel-copy">
          <h2 className="plat-rates__panel-title">
            Test quote
            <ChartHelpButton
              openOnHover
              label="Test quote help"
              text="Prices a sample invoice exactly as a new order would, using the current platform settings and the same 45-second rate cache. No order is created."
            />
          </h2>
          <p className="plat-rates__panel-sub">
            See what a customer would be asked to pay. No order is created.
          </p>
        </div>
      </div>

      <form className="plat-feed__form" onSubmit={(e) => void onSubmit(e)}>
        <label className="plat-feed__field">
          <span>Pair</span>
          <select value={pairKey} onChange={(e) => setPairKey(e.target.value)}>
            {pairs.map((p) => (
              <option key={`${p.asset}|${p.network}`} value={`${p.asset}|${p.network}`}>
                {p.asset} · {networkShortLabel(p.network)}
              </option>
            ))}
          </select>
        </label>
        <label className="plat-feed__field">
          <span>Amount</span>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="Invoice amount"
          />
        </label>
        <label className="plat-feed__field">
          <span>Invoice in</span>
          <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="CRYPTO">Crypto (exact)</option>
          </select>
        </label>
        <label className="plat-feed__field">
          <span>Merchant mode</span>
          <select
            value={mode}
            disabled={currency === "CRYPTO"}
            onChange={(e) => setMode(e.target.value as Mode)}
          >
            <option value="market">Market</option>
            <option value="pegged_1to1">Pegged 1:1</option>
          </select>
        </label>
        <button type="submit" className="plat-rates__save" disabled={busy || !pairKey}>
          {busy ? "Quoting…" : "Test quote"}
        </button>
      </form>

      {error ? <p className="plat-feed__error">{error}</p> : null}

      {result && q ? (
        <dl className="plat-feed__result">
          <div className="plat-feed__result-main">
            <dt>Customer pays</dt>
            <dd>
              {q.payAmount} {result.asset}
            </dd>
          </div>
          <div>
            <dt>Invoice</dt>
            <dd>
              {q.invoiceDenomination === "crypto"
                ? `${q.invoiceAmount} ${result.asset} ≈ ${formatRate(q.invoiceAmountUsd)} USD`
                : `${q.invoiceAmount} ${q.invoiceCurrency}${
                    q.invoiceCurrency === "EUR" ? ` = ${formatRate(q.invoiceAmountUsd)} USD` : ""
                  }`}
            </dd>
          </div>
          <div>
            <dt>Applied mode</dt>
            <dd>{q.pricingMode}</dd>
          </div>
          <div>
            <dt>Market rate (USD)</dt>
            <dd>{formatRate(q.marketRate)}</dd>
          </div>
          <div>
            <dt>Rate used</dt>
            <dd>{q.pricingRate === "1" ? "1 (peg)" : formatRate(q.pricingRate)}</dd>
          </div>
          <div>
            <dt>Sources</dt>
            <dd>
              {q.rateSources?.length
                ? q.rateSources.map((s) => `${s.source} ${formatRate(s.rate)}`).join(" · ")
                : q.rateSource}
            </dd>
          </div>
          <div>
            <dt>Chainlink</dt>
            <dd>{q.referenceRate ? formatRate(q.referenceRate) : "not checked"}</dd>
          </div>
          <div>
            <dt>Rate fetched</dt>
            <dd>{timeLabel(q.rateFetchedAt)}</dd>
          </div>
          {q.rateWarning ? (
            <div>
              <dt>Note</dt>
              <dd>{q.rateWarning}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </section>
  );
}
