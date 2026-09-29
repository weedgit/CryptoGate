import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { BackspaceIcon } from "./cashierIcons";
import { markCashierWebOrdersDisabled } from "./cashierPosPolicy";

type Props = { session: Session };

/** TOKEN = charge an exact amount of the selected rail's asset (no fiat conversion). */
type Currency = "USD" | "EUR" | "TOKEN";

const RAIL_KEY = "paymentgate.cashier.rail";
const CURRENCY_KEY = "paymentgate.cashier.currency";
const DEFAULT_VALIDITY_SECONDS = 1800;
const LONG_VALIDITY_HINT =
  "For phone or chat orders. The same amount stays reserved until this order is paid, cancelled, or expires.";

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

function validityLabel(seconds: number): string {
  return `${Math.round(seconds / 60)}min`;
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
  const optionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showOptions) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!optionsRef.current?.contains(e.target as Node)) setShowOptions(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowOptions(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [showOptions]);
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
        <div className="cashier-pad__entry-head">
          <h2 className="cashier-pad__label">Currency</h2>
          <div
            ref={optionsRef}
            className={`cashier-pad__validity${showOptions ? " is-open" : ""}`}
          >
            <span className="cashier-pad__validity-label" id="cashier-pad-validity">
              Valid for
            </span>
            <button
              type="button"
              className="cashier-pad__validity-toggle"
              aria-haspopup="listbox"
              aria-expanded={showOptions}
              aria-labelledby="cashier-pad-validity cashier-pad-validity-value"
              onClick={() => setShowOptions((v) => !v)}
            >
              <span id="cashier-pad-validity-value">{validityLabel(validitySeconds)}</span>
              <span className="cashier-pad__validity-chevron" aria-hidden>
                ▾
              </span>
            </button>
            {showOptions ? (
              <ul
                className="cashier-pad__validity-menu"
                role="listbox"
                aria-labelledby="cashier-pad-validity"
              >
                {VALIDITY_OPTIONS.map((o) => (
                  <li key={o.seconds} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={validitySeconds === o.seconds}
                      className={`cashier-pad__validity-item${
                        validitySeconds === o.seconds ? " is-active" : ""
                      }`}
                      title={o.seconds > DEFAULT_VALIDITY_SECONDS ? LONG_VALIDITY_HINT : undefined}
                      onClick={() => {
                        setValiditySeconds(o.seconds);
                        setShowOptions(false);
                      }}
                    >
                      {validityLabel(o.seconds)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
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
          <span className="cashier-pad__digits">{formatPadAmount(amount)}</span>
        </p>
        {currency === "TOKEN" ? (
          <p className="cashier-pad__rail-summary">
            Customer pays exactly this amount of {rail.asset}
          </p>
        ) : null}

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
              {key === "back" ? <BackspaceIcon className="cashier-pad__key-icon" /> : key}
            </button>
          ))}
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
          className="cashier-pad__charge"
          disabled={!canCharge}
          onClick={() => void charge()}
        >
          {charging ? "Creating QR…" : `Charge ${symbol}${formatPadAmount(amount)}`}
        </button>
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
                <NetworkStatusLamp lamp={lamp} className="cashier-pad__rail-lamp" />
                <span className="cashier-pad__radio" aria-hidden />
              </button>
            );
          })}
        </div>

        <label className="cashier-pad__reference">
          <span className="cashier-pad__field-label">Reference (optional)</span>
          <input
            className="cashier-pad__reference-input"
            value={reference}
            maxLength={200}
            placeholder="Add a note, invoice #…"
            autoComplete="off"
            onChange={(e) => setReference(e.target.value)}
          />
        </label>

      </section>
    </div>
  );
}
