import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ApiError,
  createOrder,
  getPaymentDetails,
  type NetworkOrderabilityLamp,
  type Session,
} from "../api";
import { parseBlockingOrder, type BlockingOrderInfo } from "../blockingOrder";
import { VALIDITY_OPTIONS } from "../matchingLabels";
import { invalidateMerchantOrdersList } from "../merchantOrdersList";
import { primeMerchantOrder } from "../merchantOrderDetail";
import { primeMerchantOrderPayment } from "../merchantOrderPaymentDetails";
import { loadNetworkLamps } from "../dashboard/networkLamps";
import { sessionLiveActionsUnlocked } from "../../auth/contactVerification";
import { primaryMerchantOrgId } from "../org";
import {
  defaultLivePair,
  displayNetworkForPair,
  isLivePair,
  visibleRegistry,
} from "../../shared/assetNetworks";
import { NetworkStatusLamp } from "../../shared/NetworkStatusLamp";
import { pendingOrderabilityLamp } from "../../shared/networkLamp";
import { merchantRoute } from "../../shared/portalRouting";
import { AssetIcon, NetworkIcon } from "../../platform/cryptoIcons";
import { AuthToast } from "../../auth/AuthToast";
import { applyPadKey } from "./cashierLogic";
import { markCashierWebOrdersDisabled } from "./cashierPosPolicy";

type Props = { session: Session };

/** TOKEN = charge an exact amount of the selected rail's asset (no fiat conversion). */
type Currency = "USD" | "EUR" | "TOKEN";

const RAIL_KEY = "paymentgate.cashier.rail";
const CURRENCY_KEY = "paymentgate.cashier.currency";
const DEFAULT_VALIDITY_SECONDS = 1800;

function tokenSymbol(asset: string): string {
  switch (asset) {
    case "USDT":
      return "₮";
    case "ETH":
      return "Ξ";
    default:
      return asset.slice(0, 1);
  }
}

function readStoredCurrency(): Currency {
  const stored = readStored(CURRENCY_KEY);
  return stored === "EUR" || stored === "TOKEN" ? stored : "USD";
}
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function formatPadAmount(raw: string): string {
  if (!raw) return "0.00";
  const [whole, fraction] = raw.split(".");
  const grouped = Number(whole || "0").toLocaleString();
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

/** Cashier home — amount keypad, rail picker, one Charge button. */
export function PayPadPage({ session }: Props) {
  const navigate = useNavigate();
  const locked = !sessionLiveActionsUnlocked(session);

  const rails = useMemo(
    () => visibleRegistry().filter((p) => p.enabled),
    [],
  );
  const [rail, setRail] = useState(() => {
    const stored = readStored(RAIL_KEY);
    const [asset, network] = stored?.split(":") ?? [];
    if (asset && network && isLivePair(asset, network)) return { asset, network };
    const fallback = defaultLivePair();
    return { asset: fallback.asset as string, network: fallback.network as string };
  });
  const [currency, setCurrency] = useState<Currency>(readStoredCurrency);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [validitySeconds, setValiditySeconds] = useState(DEFAULT_VALIDITY_SECONDS);
  const [showOptions, setShowOptions] = useState(false);
  const [charging, setCharging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocking, setBlocking] = useState<BlockingOrderInfo | null>(null);
  const [lamps, setLamps] = useState<Map<string, NetworkOrderabilityLamp> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadNetworkLamps().then((next) => {
      if (!cancelled) setLamps(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const press = useCallback((key: string) => {
    setAmount((prev) => applyPadKey(prev, key));
    setBlocking(null);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (/^\d$/.test(e.key) || e.key === ".") press(e.key);
      else if (e.key === "Backspace") press("back");
      else if (e.key === "Escape") press("clear");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  const selectRail = (asset: string, network: string) => {
    setRail({ asset, network });
    writeStored(RAIL_KEY, `${asset}:${network}`);
    setBlocking(null);
  };

  const selectCurrency = (next: Currency) => {
    setCurrency(next);
    writeStored(CURRENCY_KEY, next);
  };

  const parsed = Number(amount);
  const canCharge =
    !locked && !charging && Number.isFinite(parsed) && parsed > 0;
  const symbol =
    currency === "TOKEN" ? tokenSymbol(rail.asset) : currency === "EUR" ? "€" : "$";
  const optionsSummary = [
    `${Math.round(validitySeconds / 60)} min`,
    reference.trim() ? "reference" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function charge() {
    if (!canCharge) return;
    if (!isLivePair(rail.asset, rail.network)) {
      setError("That asset and network are not enabled. Pick another rail.");
      return;
    }
    const trimmed = amount.replace(/\.$/, "");
    setCharging(true);
    setError(null);
    setBlocking(null);
    try {
      const order = await createOrder({
        ...(currency === "TOKEN"
          ? { amountCrypto: trimmed, invoiceDenomination: "crypto" as const }
          : {
              amountUsd: trimmed,
              invoiceAmount: trimmed,
              invoiceCurrency: currency,
              invoiceDenomination: "fiat" as const,
            }),
        asset: rail.asset,
        network: rail.network,
        validitySeconds,
        merchantReference: reference.trim() || undefined,
        orgId: primaryMerchantOrgId(session),
      });
      invalidateMerchantOrdersList();
      primeMerchantOrder(order.id, order);
      const pay = await getPaymentDetails(order.id).catch(() => null);
      if (pay) primeMerchantOrderPayment(order.id, pay);
      navigate(merchantRoute(`pay/${order.id}`), { state: { pay } });
    } catch (err) {
      if (err instanceof ApiError && err.code === "cashier_web_orders_disabled") {
        markCashierWebOrdersDisabled(primaryMerchantOrgId(session));
        return;
      }
      if (
        err instanceof ApiError &&
        (err.code === "mode_b_amount_in_use" || err.code === "mode_d_memo_in_use")
      ) {
        const info = parseBlockingOrder(err.details);
        if (info) {
          setBlocking(info);
          return;
        }
      }
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create the order. Check the connection and try again.",
      );
    } finally {
      setCharging(false);
    }
  }

  return (
    <div className="cashier-pad">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <section className="cashier-pad__entry" aria-label="Amount">
        <div className="cashier-pad__currency" role="group" aria-label="Charge in">
          {(["USD", "EUR", "TOKEN"] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`cashier-pad__pill${currency === c ? " is-active" : ""}`}
              aria-pressed={currency === c}
              onClick={() => selectCurrency(c)}
            >
              {c === "TOKEN" ? (
                <>
                  <AssetIcon asset={rail.asset} /> {rail.asset}
                </>
              ) : (
                c
              )}
            </button>
          ))}
        </div>
        <p className="cashier-pad__amount fund-amount" aria-live="polite">
          <span className="cashier-pad__symbol">{symbol}</span>
          {formatPadAmount(amount)}
        </p>
        <p className="cashier-pad__rail-summary">
          {currency === "TOKEN" ? "Customer pays exactly" : "Customer pays in"}{" "}
          <AssetIcon asset={rail.asset} /> {rail.asset} ·{" "}
          {displayNetworkForPair(rail.asset, rail.network)}
        </p>

        <div className="cashier-pad__keys">
          {KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`cashier-pad__key${key === "back" ? " cashier-pad__key--back" : ""}`}
              aria-label={key === "back" ? "Delete last digit" : key}
              onClick={() => press(key)}
              onContextMenu={(e) => {
                if (key !== "back") return;
                e.preventDefault();
                press("clear");
              }}
            >
              {key === "back" ? "⌫" : key}
            </button>
          ))}
        </div>
      </section>

      <section className="cashier-pad__side">
        <h2 className="cashier-pad__label">Pay with</h2>
        <div className="cashier-pad__rails" role="radiogroup" aria-label="Asset and network">
          {rails.map((p) => {
            const key = `${p.asset}:${p.network}`;
            const active = rail.asset === p.asset && rail.network === p.network;
            const lamp = lamps?.get(key) ?? pendingOrderabilityLamp(p.enabled);
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={active}
                className={`cashier-pad__rail${active ? " is-active" : ""}`}
                onClick={() => selectRail(p.asset, p.network)}
              >
                <span className="cashier-pad__rail-icons">
                  <AssetIcon asset={p.asset} />
                  <NetworkIcon network={p.network} />
                </span>
                <span className="cashier-pad__rail-text">
                  <strong>{p.asset}</strong>
                  <span>{displayNetworkForPair(p.asset, p.network)}</span>
                </span>
                <NetworkStatusLamp lamp={lamp} />
              </button>
            );
          })}
        </div>

        <div className={`cashier-pad__options${showOptions ? " is-open" : ""}`}>
          <button
            type="button"
            className="cashier-pad__options-toggle"
            aria-expanded={showOptions}
            aria-controls="cashier-pad-options"
            onClick={() => setShowOptions((v) => !v)}
          >
            <span>More options</span>
            <span className="cashier-pad__options-summary">{optionsSummary}</span>
            <span className="cashier-pad__options-chevron" aria-hidden>
              ▾
            </span>
          </button>
          {showOptions ? (
            <div className="cashier-pad__options-body" id="cashier-pad-options">
              <div className="cashier-pad__option">
                <span id="cashier-pad-validity">Valid for</span>
                <div
                  className="cashier-pad__currency"
                  role="radiogroup"
                  aria-labelledby="cashier-pad-validity"
                >
                  {VALIDITY_OPTIONS.map((o) => (
                    <button
                      key={o.seconds}
                      type="button"
                      role="radio"
                      aria-checked={validitySeconds === o.seconds}
                      className={`cashier-pad__pill${
                        validitySeconds === o.seconds ? " is-active" : ""
                      }`}
                      onClick={() => setValiditySeconds(o.seconds)}
                    >
                      {Math.round(o.seconds / 60)} min
                    </button>
                  ))}
                </div>
                {validitySeconds > DEFAULT_VALIDITY_SECONDS ? (
                  <p className="cashier-pad__option-hint">
                    For phone or chat orders. The same amount stays reserved until this
                    order is paid, cancelled, or expires.
                  </p>
                ) : null}
              </div>
              <label className="cashier-pad__option">
                <span>Reference (staff only)</span>
                <input
                  className="plat-settings__input"
                  value={reference}
                  maxLength={200}
                  placeholder="Table 4, receipt #, phone order…"
                  autoComplete="off"
                  onChange={(e) => setReference(e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>

        {blocking ? (
          <aside className="cashier-pad__blocking" role="alert">
            <strong>This amount is already open</strong>
            <p>
              Order #{blocking.orderNumber} ({blocking.createdByLabel}) uses the same
              amount. Finish or cancel it, or change the amount slightly.
            </p>
            <Link to={merchantRoute(`pay/${blocking.id}`)}>Open #{blocking.orderNumber}</Link>
          </aside>
        ) : null}

        {locked ? (
          <p className="cashier-pad__locked" role="note">
            Finish account setup before taking payments.
          </p>
        ) : null}

        <button
          type="button"
          className="btn-primary cashier-pad__charge"
          disabled={!canCharge}
          onClick={() => void charge()}
        >
          {charging ? "Creating QR…" : `Charge ${symbol}${formatPadAmount(amount)}`}
        </button>
      </section>
    </div>
  );
}
