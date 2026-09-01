import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  ApiError,
  cancelOrder,
  getOnChain,
  getOrg,
  listOrgUsers,
  listWebhookDeliveries,
  listWebhooks,
  resendWebhookDelivery,
  resolveOrderAnomaly,
  type OnChainDetails,
  type OrgAccount,
  type PaymentDetails,
  type PaymentOrder,
  type Session,
  type WebhookDelivery,
} from "./api";
import {
  getMerchantOrder,
  peekMerchantOrder,
  primeMerchantOrder,
} from "./merchantOrderDetail";
import {
  getMerchantOrderPayment,
  peekMerchantOrderPayment,
  primeMerchantOrderPayment,
} from "./merchantOrderPaymentDetails";
import { matchingModeLabel } from "./matchingLabels";
import { orderFulfillmentHint } from "./fulfillmentLabels";
import {
  anomalyAmountLine,
  anomalyExplain,
  confirmationProgress,
  formatExpiryRemaining,
  formatShortTime,
  orderStatusLabel,
  orderStatusTone,
} from "./orderStatus";
import { networkLabel, primaryMerchantOrgId, sessionCanManageIntegrations, sessionCanViewIntegrations } from "./org";
import { refreshMerchantAlerts } from "./merchantAlerts";
import { displayNetworkForPair, webChainEnvOverride } from "../shared/assetNetworks";
import { findAssetNetworkRow } from "@cryptogate/domain";
import { StatusBadge } from "../shared/StatusBadge";
import { PaymentQrCanvas } from "../shared/PaymentQrCanvas";
import { GatewayQrTerminal } from "../shared/GatewayQrTerminal";
import { AuthToast } from "../auth/AuthToast";
import { PaymentOrderInvoiceFace } from "../billing/PaymentOrderInvoiceFace";
import { AssetIcon, NetworkIcon, QrCenterNetworkMark } from "../platform/cryptoIcons";
import { merchantRoute, platformRoute } from "../shared/portalRouting";

/** Latest reached step in the order payment timeline (0 = Created … 3 = Confirmed). */
function orderTimelineStepIndex(status: string, hasTx: boolean): number {
  if (status === "completed" || status === "confirmed") return 3;
  if (status === "verifying") return 2;
  if (hasTx) return 1;
  return 0;
}

function timelineStepClass(stepIndex: number, currentIndex: number): string {
  if (stepIndex < currentIndex) return "is-reached";
  if (stepIndex === currentIndex) return "is-reached is-current";
  return "";
}

type Props = {
  session: Session;
  /** Platform opens the same evidence UI watch-only (no cancel / resolve / create). */
  variant?: "merchant" | "platform";
};

const ORDER_DETAIL_POLL_MS = 5000;

function isOpenOrderStatus(status: string | undefined | null): boolean {
  return status === "pending_payment" || status === "verifying";
}

/** O/A any pending on org; Cashier own pending only. */
function canCancelPendingOrder(
  session: Session,
  order: PaymentOrder | null,
): boolean {
  if (!order || order.status !== "pending_payment") return false;
  const orgId = order.orgId;
  if (!orgId) return false;
  const m = session.memberships.find((row) => row.orgId === orgId);
  if (!m) return false;
  if (m.role === "cashier") {
    return Boolean(order.createdBy && order.createdBy === session.userId);
  }
  return m.role === "owner" || m.role === "administrator";
}

/** O/A any anomaly on org; Cashier own only. */
function canResolveAnomalyOrder(
  session: Session,
  order: PaymentOrder | null,
): boolean {
  if (!order || order.status !== "payment_anomaly") return false;
  const orgId = order.orgId;
  if (!orgId) return false;
  const m = session.memberships.find((row) => row.orgId === orgId);
  if (!m) return false;
  if (m.role === "cashier") {
    return Boolean(order.createdBy && order.createdBy === session.userId);
  }
  return m.role === "owner" || m.role === "administrator";
}

export function OrderDetailPage({
  session,
  variant = "merchant",
}: Props) {
  const { id } = useParams();
  const location = useLocation();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const seededPay = (location.state as { pay?: PaymentDetails } | null)?.pay;
  const isPlatform = variant === "platform";
  const backTo = isPlatform ? platformRoute("compliance") : merchantRoute("orders");
  const backLabel = isPlatform ? "← Back to compliance" : "← Back to orders";
  const topbarCenterId = isPlatform
    ? "platform-topbar-center"
    : "merchant-topbar-center";

  const [order, setOrder] = useState<PaymentOrder | null>(() =>
    id ? peekMerchantOrder(id) : null,
  );
  const [pay, setPay] = useState<PaymentDetails | null>(
    () => seededPay ?? (id ? peekMerchantOrderPayment(id) : null),
  );
  const [chain, setChain] = useState<OnChainDetails | null>(null);
  const [sellerOrg, setSellerOrg] = useState<OrgAccount | null>(null);
  const [sellerContactEmail, setSellerContactEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () =>
      !(
        id &&
        (peekMerchantOrder(id) || seededPay || peekMerchantOrderPayment(id))
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [webhookRows, setWebhookRows] = useState<
    Array<WebhookDelivery & { webhookId: string }>
  >([]);
  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);

  const orgId = primaryMerchantOrgId(session);
  const canViewWebhooks = !isPlatform && sessionCanViewIntegrations(session);
  const canResendWebhooks = sessionCanManageIntegrations(session);

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById(topbarCenterId));
  }, [topbarCenterId]);

  const load = useCallback(async () => {
    if (!id) return;
    if (!peekMerchantOrder(id) && !seededPay && !peekMerchantOrderPayment(id)) {
      setLoading(true);
    }
    setError(null);
    try {
      const [o, p, c] = await Promise.all([
        getMerchantOrder(id),
        getMerchantOrderPayment(id).catch(() => null),
        getOnChain(id).catch(() => null),
      ]);
      primeMerchantOrder(id, o);
      setOrder(o);
      if (p) {
        primeMerchantOrderPayment(id, p);
        setPay(p);
      }
      setChain(c);

      const orderOrgId = o.orgId ?? primaryMerchantOrgId(session) ?? null;
      if (orderOrgId) {
        const siteOrMerchant = await getOrg(orderOrgId).catch(() => null);
        let seller: OrgAccount | null = siteOrMerchant;
        if (siteOrMerchant?.type === "merchant_site" && siteOrMerchant.parentId) {
          seller = await getOrg(siteOrMerchant.parentId).catch(() => siteOrMerchant);
        }
        setSellerOrg(seller);
        const sellerId = seller?.id ?? orderOrgId;
        const members = await listOrgUsers(sellerId).catch(() => []);
        const preferred =
          members.find((m) => /owner/i.test(m.role)) ??
          members.find((m) => /admin/i.test(m.role)) ??
          members[0];
        setSellerContactEmail(preferred?.email?.trim() || null);
      } else {
        setSellerOrg(null);
        setSellerContactEmail(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [id, seededPay, session]);

  /** Soft refresh — order/pay/on-chain only; no full-page loading flash. */
  const refreshLive = useCallback(async () => {
    if (!id) return;
    setPolling(true);
    try {
      const [o, p, c] = await Promise.all([
        getMerchantOrder(id, { force: true }),
        getMerchantOrderPayment(id, { force: true }).catch(() => null),
        getOnChain(id).catch(() => null),
      ]);
      primeMerchantOrder(id, o);
      setOrder(o);
      if (p) {
        primeMerchantOrderPayment(id, p);
        setPay(p);
      }
      setChain(c);
    } catch {
      /* keep last good snapshot while watching */
    } finally {
      setPolling(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const seeded = peekMerchantOrder(id);
    setOrder(seeded);
    if (!seededPay) {
      const cachedPay = peekMerchantOrderPayment(id);
      if (cachedPay) setPay(cachedPay);
    }
    if (!seeded && !seededPay && !peekMerchantOrderPayment(id)) setLoading(true);
  }, [id, seededPay]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canViewWebhooks || !orgId || !order?.id) {
      setWebhookRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const hooks = await listWebhooks(orgId);
        const rows: Array<WebhookDelivery & { webhookId: string }> = [];
        for (const hook of hooks) {
          const deliveries = await listWebhookDeliveries(hook.id, orgId);
          for (const row of deliveries) {
            if (row.orderId === order.id) {
              rows.push({ ...row, webhookId: hook.id });
            }
          }
        }
        if (!cancelled) setWebhookRows(rows);
      } catch {
        if (!cancelled) setWebhookRows([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewWebhooks, orgId, order?.id]);

  const liveStatus = order?.status ?? pay?.status;
  const watching = isOpenOrderStatus(liveStatus);

  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(() => {
      void refreshLive();
    }, ORDER_DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [watching, refreshLive]);

  useEffect(() => {
    if (!watching) return;
    const tick = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(tick);
  }, [watching]);

  async function copyAddress() {
    const value = order?.receiveAddress ?? pay?.receiveAddress ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function copyTxHash() {
    const value = chain?.txHash?.trim() ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTx(true);
      window.setTimeout(() => setCopiedTx(false), 1600);
    } catch {
      setCopiedTx(false);
    }
  }

  async function onCancelOrder() {
    if (!order?.id || cancelling) return;
    const ok = window.confirm(
      `Cancel pending order #${order.orderNumber}? This frees the amount/memo slot for other cashiers.`,
    );
    if (!ok) return;
    setCancelling(true);
    setError(null);
    try {
      const updated = await cancelOrder(order.id);
      primeMerchantOrder(order.id, updated);
      setOrder(updated);
      const p = await getMerchantOrderPayment(order.id, { force: true }).catch(
        () => null,
      );
      if (p) {
        primeMerchantOrderPayment(order.id, p);
        setPay(p);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not cancel order",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function onResolveAnomaly() {
    if (!order?.id || resolving) return;
    const note = resolveNote.trim();
    if (!note) {
      setError(
        "Add a short note describing what you checked (customer, amount, tx).",
      );
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const updated = await resolveOrderAnomaly(order.id, note);
      primeMerchantOrder(order.id, updated);
      setOrder(updated);
      setResolveNote("");
      const p = await getMerchantOrderPayment(order.id, { force: true }).catch(
        () => null,
      );
      if (p) {
        primeMerchantOrderPayment(order.id, p);
        setPay(p);
      }
      void refreshMerchantAlerts(session);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not resolve anomaly",
      );
    } finally {
      setResolving(false);
    }
  }

  if (loading && !order && !pay) {
    return (
      <div className="order-detail-page plat-settings plat-settings--merchant">
        <p className="order-detail-page__loading muted">Loading payment order…</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="order-detail-page plat-settings plat-settings--merchant">
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <section className="plat-settings__card">
          <div className="plat-settings__card-body">
            <p className="muted">Could not load this payment order.</p>
            <Link className="order-detail-topbar__back" to={backTo}>
              {backLabel}
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const status = order?.status ?? pay?.status ?? "pending_payment";
  const orderNumber = order?.orderNumber ?? pay?.orderNumber ?? id ?? "—";
  const amount = order?.payableAmount.amount ?? pay?.payableAmount.amount ?? "—";
  const asset = order?.asset ?? pay?.asset ?? "USDT";
  const network = order?.network ?? pay?.network ?? "tron";
  const address = order?.receiveAddress ?? pay?.receiveAddress ?? "";
  const mode = order?.matchingMode ?? pay?.matchingMode ?? "B";
  const expiresAt = order?.expiresAt ?? pay?.expiresAt;
  const hasTx = Boolean(chain?.txHash || pay?.txHash);
  const requiredConfirmations =
    (typeof pay?.requiredConfirmations === "number" &&
    pay.requiredConfirmations > 0
      ? pay.requiredConfirmations
      : null) ??
    findAssetNetworkRow(
      asset as never,
      network as never,
      webChainEnvOverride(),
    )?.requiredConfirmations ??
    1;
  const progress = confirmationProgress({
    status,
    requiredConfirmations,
    confirmations: pay?.confirmations,
    hasTx,
  });
  const isAnomaly = status === "payment_anomaly";
  const received = order?.receivedAmount?.amount ?? chain?.amount?.amount;
  const settled = status === "completed" || status === "confirmed";
  const qrTerminal =
    settled ||
    status === "expired" ||
    status === "payment_anomaly" ||
    status === "failed" ||
    status === "cancelled";
  const paidAt = settled ? chain?.confirmedAt ?? pay?.confirmedAt ?? null : null;
  const createdByLabel = order?.createdByEmail?.trim() || null;
  const sellerOrgId =
    sellerOrg?.id ??
    order?.orgId ??
    primaryMerchantOrgId(session) ??
    "—";
  const networkDisplay = displayNetworkForPair(asset, network);
  const timelineIndex = orderTimelineStepIndex(status, hasTx);
  const fulfillmentHint = orderFulfillmentHint(order?.fulfillmentPolicy, status);
  const confirmationStatusSuffix = hasTx
    ? " — tx detected on chain"
    : " — awaiting tx";
  const qrPayload = (
    pay?.qrPayload ??
    pay?.paymentPageUrl ??
    address
  ).trim();
  const showCancel = !isPlatform && canCancelPendingOrder(session, order);
  const showResolve = !isPlatform && canResolveAnomalyOrder(session, order);
  const amountLine = anomalyAmountLine({
    payableAmount: amount,
    receivedAmount: received ?? null,
    asset,
  });
  const explain = anomalyExplain({
    reason: order?.anomalyReason,
    matchingMode: mode,
    payableAmount: amount === "—" ? null : amount,
    receivedAmount: received ?? null,
    hasTx,
  });
  const reasonLabel = explain.title;
  const guidance = explain.guidance;

  const topbarChrome =
    topbarSlot && !loading && (order || pay)
      ? createPortal(
          <div className="order-detail-topbar no-print" aria-label="Order context">
            <div className="order-detail-topbar__lead">
              <Link className="order-detail-topbar__back" to={backTo}>
                {isPlatform ? "← Compliance" : "← Orders"}
              </Link>
              <span className="order-detail-topbar__divider" aria-hidden />
              <div className="order-detail-topbar__identity">
                <span className="order-detail-topbar__kicker">Payment order</span>
                <span className="order-detail-topbar__title">{orderNumber}</span>
              </div>
            </div>
            <div className="order-detail-topbar__meta">
              <span className="order-detail-topbar__amount fund-amount">
                <AssetIcon asset={asset} />
                <span>
                  {amount} {asset}
                </span>
              </span>
              <span className="order-detail-topbar__sep" aria-hidden>
                ·
              </span>
              <span className="order-detail-topbar__net">
                <NetworkIcon network={network} />
                <span>{networkDisplay}</span>
              </span>
            </div>
            <div className="order-detail-topbar__status">
            <StatusBadge
              tone={orderStatusTone(status, order)}
              live={status === "verifying" || status === "pending_payment"}
              alarm={status === "payment_anomaly"}
            >
              {orderStatusLabel(status, order)}
            </StatusBadge>
            </div>
          </div>,
          topbarSlot,
        )
      : null;

  return (
    <div className="order-detail-page plat-settings plat-settings--merchant">
      {topbarChrome}

      <div className="order-detail-page__layout">
        <div className="order-detail-page__main">
          <div className="order-detail-page__invoice-row">
            <div className="order-detail-page__invoice">
              <PaymentOrderInvoiceFace
            order={{
              id: order?.id ?? id ?? orderNumber,
              orderNumber,
              status,
              matchingMode: mode,
              matchingModeLabel: matchingModeLabel(mode),
              payableAmount: amount,
              receivedAmount: received ?? null,
              asset,
              network,
              networkLabel: networkLabel(network),
              receiveAddress: address,
              addressSource: order?.addressSource,
              hdIndex: order?.hdIndex,
              memoOrTag: order?.memoOrTag,
              expiresAt,
              createdAt: order?.createdAt,
              paidAt,
              siteName: order?.orgName ?? null,
              createdByLabel,
              merchantReference: order?.merchantReference ?? null,
              anomalyReason: order?.anomalyReason,
              anomalyReasonLabel: reasonLabel,
              anomalyGuidance: guidance,
              anomalyAmountLine: amountLine,
              anomalyResolutionNote: order?.anomalyResolutionNote,
              anomalyResolvedAt: order?.anomalyResolvedAt,
            }}
            seller={{
              name: sellerOrg?.name ?? "Merchant",
              legalName: sellerOrg?.legalName,
              contactEmail: sellerContactEmail,
              orgId: sellerOrgId,
            }}
            onChain={
              chain || pay?.txHash
                ? {
                    txHash: chain?.txHash ?? pay?.txHash ?? null,
                    fromAddress: chain?.fromAddress ?? null,
                    amount: chain?.amount?.amount ?? received ?? null,
                    confirmedAt:
                      chain?.confirmedAt ?? pay?.confirmedAt ?? null,
                  }
                : null
            }
            remittance={{ paymentPageUrl: pay?.paymentPageUrl }}
            statusBadge={
              <StatusBadge
                tone={orderStatusTone(status, order)}
                live={status === "verifying"}
                alarm={status === "payment_anomaly"}
              >
                {orderStatusLabel(status, order)}
              </StatusBadge>
            }
            toolbar={
              <button
                type="button"
                className="sb-invoice__print-btn"
                onClick={() => window.print()}
              >
                Print invoice
              </button>
            }
            invoiceRef={invoiceRef}
              />
            </div>
          </div>
        </div>

        <div className="order-detail-page__rail no-print">
          <div className="order-detail-page__rail-body">
          {fulfillmentHint ? (
            <p className="plat-settings__notice order-detail-fulfillment-hint" role="status">
              {fulfillmentHint}
            </p>
          ) : null}
          <section className="plat-settings__card order-detail-gateway">
            <div className="plat-settings__card-body order-detail-gateway__body">
              <div className="order-detail-gateway__pay-panel">
                <div className="order-detail-gateway__amount">
                  <div className="order-detail-gateway__chain-icons" aria-hidden>
                    <AssetIcon asset={asset} />
                    <NetworkIcon network={network} />
                  </div>
                  <span className="order-detail-gateway__amount-label">
                    {settled ? "Amount paid" : "Amount due"}
                  </span>
                  <p className="order-detail-gateway__amount-value fund-amount">
                    {amount} {asset}
                  </p>
                  <p className="order-detail-gateway__amount-net">
                    <NetworkIcon network={network} />
                    <span>{networkDisplay}</span>
                  </p>
                </div>

                <div className="order-detail-gateway__qr-wrap">
                  <div
                    className={`order-detail-gateway__qr${
                      qrTerminal ? " is-terminal" : ""
                    }`}
                  >
                    {qrPayload && !qrTerminal ? (
                      <>
                        <PaymentQrCanvas
                          payload={qrPayload}
                          size={204}
                          alt="Payment QR"
                        />
                        <span className="order-detail-gateway__qr-mark" aria-hidden>
                          <QrCenterNetworkMark network={network} />
                        </span>
                      </>
                    ) : (
                      <GatewayQrTerminal
                        kind={
                          settled
                            ? "completed"
                            : status === "payment_anomaly"
                              ? "anomaly"
                              : status === "expired"
                                ? "expired"
                                : status === "failed" || status === "cancelled"
                                  ? "failed"
                                  : "unavailable"
                        }
                        title={
                          status === "failed" || status === "cancelled"
                            ? orderStatusLabel(status, order)
                            : undefined
                        }
                      />
                    )}
                  </div>
                  <p
                    className={`order-detail-gateway__timer${
                      qrTerminal ? " is-terminal" : ""
                    }`}
                    key={settled ? "settled" : nowTick}
                  >
                    {settled
                      ? "Payment completed — QR no longer needed"
                      : status === "payment_anomaly"
                        ? "Payment anomaly — do not collect again"
                        : status === "expired"
                          ? "Order expired"
                          : status === "failed" || status === "cancelled"
                            ? orderStatusLabel(status, order)
                            : `Valid for ${formatExpiryRemaining(expiresAt)}`}
                  </p>
                </div>

                <div className="order-detail-gateway__address-block">
                  <span className="order-detail-gateway__field-label">Payment address</span>
                  <div className="order-detail-gateway__address-row">
                    <div className="order-detail-gateway__address-icons" aria-hidden>
                      <AssetIcon asset={asset} />
                      <NetworkIcon network={network} />
                    </div>
                    <p
                      className="order-detail-gateway__address mono"
                      title={address || undefined}
                    >
                      {address || "—"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="order-detail-gateway__copy-btn"
                    onClick={() => void copyAddress()}
                    disabled={!address}
                  >
                    {copied ? "Copied" : "Copy address"}
                  </button>
                </div>

                {order?.memoOrTag ? (
                  <div className="order-detail-gateway__memo">
                    <span className="order-detail-gateway__field-label">Memo / tag</span>
                    <p className="order-detail-gateway__memo-value mono">{order.memoOrTag}</p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

        <aside className="order-detail-page__aside">
          <section
            className={`plat-settings__card order-detail-aside-card order-detail-chain${
              status === "verifying" ? " is-verifying" : ""
            }${
              progress.filled >= progress.total && progress.total > 0
                ? " is-complete"
                : ""
            }`}
          >
            <div className="plat-settings__card-head order-detail-chain__head">
              <h2 className="plat-settings__card-title">Blockchain confirmations</h2>
              <div className="order-detail-chain__head-meta">
                {watching ? (
                  <span
                    className={`order-detail-chain__live${polling ? " is-polling" : ""}`}
                    aria-live="polite"
                  >
                    <span className="order-detail-chain__live-dot" aria-hidden />
                    Live
                  </span>
                ) : null}
                <span className="order-detail-chain__badge" aria-hidden>
                  <span className="order-detail-chain__badge-fill">{progress.filled}</span>
                  <span className="order-detail-chain__badge-sep">/</span>
                  <span>{progress.total}</span>
                </span>
              </div>
            </div>
            <div className="plat-settings__card-body">
              <div
                className={`order-detail-chain__blocks${
                  progress.filled >= progress.total && progress.total > 0
                    ? " is-complete"
                    : ""
                }${status === "verifying" ? " is-live" : ""}`}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.filled}
                aria-label={`${progress.filled} of ${progress.total} block confirmations`}
                style={{
                  ["--conf-total" as string]: String(
                    Math.max(1, progress.total),
                  ),
                }}
              >
                {Array.from({ length: progress.total }, (_, i) => (
                  <div
                    key={i}
                    className={[
                      "order-detail-chain__block",
                      i < progress.filled ? "is-filled" : "",
                      status === "verifying" && i === progress.filled
                        ? "is-next"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      ["--i" as string]: i,
                      ["--fill-t" as string]:
                        progress.total > 1 ? i / (progress.total - 1) : 0,
                    }}
                  />
                ))}
              </div>
              <p className="order-detail-chain__status">
                <span className="order-detail-chain__status-count">
                  {progress.filled} of {progress.total} block confirmations
                </span>
                <span className="order-detail-chain__status-note">
                  {confirmationStatusSuffix}
                </span>
              </p>
              {chain?.txHash ? (
                <label className="order-detail-chain__tx plat-settings__field">
                  <span>Transaction hash</span>
                  <div className="field-shell field-shell--copy">
                    <input
                      className="plat-settings__input mono"
                      readOnly
                      value={chain.txHash}
                      aria-label="Transaction hash"
                    />
                    <button
                      type="button"
                      className="field-shell__copy-btn"
                      onClick={() => void copyTxHash()}
                    >
                      {copiedTx ? "Copied" : "Copy"}
                    </button>
                  </div>
                </label>
              ) : null}
            </div>
          </section>

          {canViewWebhooks ? (
            <section className="plat-settings__card order-detail-aside-card order-detail-webhooks-card no-print">
              <div className="plat-settings__card-head">
                <h2 className="plat-settings__card-title">Webhook deliveries</h2>
              </div>
              <div className="plat-settings__card-body">
                {webhookMsg ? (
                  <p className="plat-settings__card-note" role="status">
                    {webhookMsg}
                  </p>
                ) : null}
                {webhookRows.length === 0 ? (
                  <p className="muted">No webhook deliveries recorded for this order yet.</p>
                ) : (
                  <div className="delivery-table">
                    <div className="delivery-head">
                      <span>EVENT</span>
                      <span>STATUS</span>
                      <span>HTTP</span>
                      <span>ATTEMPT</span>
                      <span>TIME</span>
                      {canResendWebhooks ? <span /> : null}
                    </div>
                    {webhookRows.map((d) => (
                      <div key={d.id} className="delivery-row">
                        <span className="mono">{d.eventType}</span>
                        <span>{d.status}</span>
                        <span>{d.responseStatus ?? d.httpStatus ?? "—"}</span>
                        <span>{d.attempt}</span>
                        <span className="muted">
                          {formatShortTime(d.deliveredAt ?? d.createdAt)}
                        </span>
                        {canResendWebhooks ? (
                          <button
                            type="button"
                            className="btn-ghost btn-tiny"
                            disabled={
                              webhookBusy ||
                              (d.status !== "failed" && d.status !== "success")
                            }
                            onClick={() => {
                              if (!orgId) return;
                              void (async () => {
                                setWebhookBusy(true);
                                setWebhookMsg(null);
                                try {
                                  await resendWebhookDelivery(
                                    d.webhookId,
                                    d.id,
                                    orgId,
                                  );
                                  setWebhookMsg("Delivery queued for resend.");
                                  const hooks = await listWebhooks(orgId);
                                  const rows: Array<
                                    WebhookDelivery & { webhookId: string }
                                  > = [];
                                  for (const hook of hooks) {
                                    const deliveries = await listWebhookDeliveries(
                                      hook.id,
                                      orgId,
                                    );
                                    for (const row of deliveries) {
                                      if (row.orderId === order?.id) {
                                        rows.push({ ...row, webhookId: hook.id });
                                      }
                                    }
                                  }
                                  setWebhookRows(rows);
                                } catch (err) {
                                  setWebhookMsg(
                                    err instanceof ApiError
                                      ? err.message
                                      : "Resend failed",
                                  );
                                } finally {
                                  setWebhookBusy(false);
                                }
                              })();
                            }}
                          >
                            Resend
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          ) : null}

          <section className="plat-settings__card order-detail-aside-card order-detail-timeline-card">
            <div className="plat-settings__card-head">
              <h2 className="plat-settings__card-title">Order timeline</h2>
            </div>
            <div className="plat-settings__card-body">
              <ul
                className={`order-detail-timeline${
                  status === "verifying" ? " is-flowing" : ""
                }${
                  status === "completed" || status === "confirmed"
                    ? " is-done"
                    : ""
                }`}
              >
                <li
                  className={timelineStepClass(0, timelineIndex)}
                  style={{ ["--i" as string]: 0 }}
                >
                  <div className="order-detail-timeline__mark" aria-hidden>
                    <span className="order-detail-timeline__dot" />
                  </div>
                  <div className="order-detail-timeline__body">
                    <div className="order-detail-timeline__row">
                      <strong>Created</strong>
                      <span>{formatShortTime(order?.createdAt ?? expiresAt)}</span>
                    </div>
                    <p>{asset} payment order initialized</p>
                  </div>
                </li>
                <li
                  className={timelineStepClass(1, timelineIndex)}
                  style={{ ["--i" as string]: 1 }}
                >
                  <div className="order-detail-timeline__mark" aria-hidden>
                    <span className="order-detail-timeline__dot" />
                  </div>
                  <div className="order-detail-timeline__body">
                    <div className="order-detail-timeline__row">
                      <strong>Detected</strong>
                      <span>{hasTx ? "Seen on chain" : "—"}</span>
                    </div>
                    <p>Incoming tx on {networkLabel(network)}</p>
                  </div>
                </li>
                <li
                  className={timelineStepClass(2, timelineIndex)}
                  style={{ ["--i" as string]: 2 }}
                >
                  <div className="order-detail-timeline__mark" aria-hidden>
                    <span className="order-detail-timeline__dot" />
                  </div>
                  <div className="order-detail-timeline__body">
                    <div className="order-detail-timeline__row">
                      <strong>Verifying</strong>
                      <span>
                        {status === "verifying"
                          ? `${progress.filled}/${progress.total}`
                          : timelineIndex > 2
                            ? "Done"
                            : "—"}
                      </span>
                    </div>
                    <p>Awaiting required confirmations</p>
                  </div>
                </li>
                <li
                  className={timelineStepClass(3, timelineIndex)}
                  style={{ ["--i" as string]: 3 }}
                >
                  <div className="order-detail-timeline__mark" aria-hidden>
                    <span className="order-detail-timeline__dot" />
                  </div>
                  <div className="order-detail-timeline__body">
                    <div className="order-detail-timeline__row">
                      <strong>Confirmed</strong>
                      <span>
                        {paidAt
                          ? formatShortTime(paidAt)
                          : chain?.confirmedAt || pay?.confirmedAt
                            ? formatShortTime(
                                chain?.confirmedAt ?? pay?.confirmedAt,
                              )
                            : settled
                              ? "Done"
                              : "—"}
                      </span>
                    </div>
                    <p>Settlement validation success</p>
                  </div>
                </li>
              </ul>
            </div>
          </section>
          </aside>
          </div>

          <div className="order-detail-page__rail-actions">
            <div className="order-detail-page__rail-action">
              {pay?.paymentPageUrl ? (
                <a
                  href={pay.paymentPageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="order-detail-gateway__guest-btn"
                >
                  Open guest payment page
                </a>
              ) : (
                <span className="order-detail-page__rail-action-spacer" aria-hidden />
              )}
            </div>
            <div className="order-detail-page__rail-action order-detail-page__foot">
              {showCancel ? (
                <button
                  type="button"
                  className="order-detail-page__cancel"
                  disabled={cancelling}
                  onClick={() => void onCancelOrder()}
                >
                  {cancelling ? "Cancelling…" : "Cancel pending order"}
                </button>
              ) : null}
              {!isPlatform ? (
                <Link className="order-detail-page__cta" to={merchantRoute("orders/new")}>
                  Create another payment order
                </Link>
              ) : order?.orgId ? (
                <Link
                  className="order-detail-page__cta"
                  to={`${platformRoute(`merchants/${order.orgId}`)}?tab=compliance`}
                >
                  Open merchant
                </Link>
              ) : (
                <Link className="order-detail-page__cta" to={platformRoute("compliance")}>
                  Back to compliance
                </Link>
              )}
            </div>
          </div>

          {isAnomaly ? (
            <section
              className="order-detail-anomaly order-detail-anomaly--live no-print"
              role="alert"
              key={`anomaly-${order?.id ?? orderNumber}`}
            >
              <header className="order-detail-anomaly__head">
                <p className="order-detail-anomaly__title">Payment needs review</p>
              </header>

              <div className="order-detail-anomaly__section">
                <p className="order-detail-anomaly__label">Why</p>
                <p className="order-detail-anomaly__why">{reasonLabel}</p>
                {explain.inferred ? (
                  <p className="order-detail-anomaly__inferred">
                    Exact cause code was not stored on this ticket — this is the best
                    explanation from the amounts and matching mode.
                  </p>
                ) : null}
                <dl className="order-detail-anomaly__amounts">
                  <div>
                    <dt>Expected</dt>
                    <dd className="order-detail-anomaly__amt">
                      <AssetIcon asset={asset} />
                      <span>
                        {amount} {asset}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Received</dt>
                    <dd className="order-detail-anomaly__amt">
                      <AssetIcon asset={asset} />
                      <span>
                        {received != null && String(received).trim()
                          ? `${received} ${asset}`
                          : "— (check tx on explorer; amount may still be syncing)"}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="order-detail-anomaly__section">
                <div className="order-detail-anomaly__what">
                  <p className="order-detail-anomaly__label">What to do</p>
                  <span className="plat-card-help order-detail-anomaly__help">
                    <button
                      type="button"
                      className="plat-card-help__btn"
                      aria-label={guidance}
                    >
                      ?
                    </button>
                    <span className="plat-card-help__tip" role="tooltip">
                      {guidance}
                    </span>
                  </span>
                </div>
                {showResolve ? (
                  <div className="order-detail-anomaly__resolve">
                    <label
                      className="order-detail-anomaly__note-label"
                      htmlFor="anomaly-resolve-note"
                    >
                      Resolve note <span aria-hidden>(required)</span>
                    </label>
                    <textarea
                      id="anomaly-resolve-note"
                      className="order-detail-anomaly__note"
                      rows={3}
                      maxLength={1000}
                      value={resolveNote}
                      onChange={(e) => setResolveNote(e.target.value)}
                      placeholder="e.g. Checked explorer — customer A paid this 60 USDT; closed sibling ticket."
                      disabled={resolving}
                    />
                    <div className="order-detail-anomaly__actions">
                      <button
                        type="button"
                        className="order-detail-anomaly__resolve-btn"
                        disabled={resolving || !resolveNote.trim()}
                        onClick={() => void onResolveAnomaly()}
                      >
                        {resolving ? "Resolving…" : "Resolve anomaly"}
                      </button>
                      <p className="order-detail-anomaly__hint">
                        Closes this ticket after you reconcile. Does not mark paid.
                        Urgent alerts stop once resolved.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="order-detail-anomaly__hint">
                    {isPlatform
                      ? "Platform is watch-only here. Merchant Owner or Administrator resolves after reconciling — never mark paid from platform."
                      : "Ask Owner or Administrator to resolve if this is not your order."}
                  </p>
                )}
              </div>
            </section>
          ) : order?.anomalyResolutionNote ? (
            <section className="order-detail-anomaly order-detail-anomaly--resolved no-print">
              <header className="order-detail-anomaly__head">
                <p className="order-detail-anomaly__title">Anomaly resolved</p>
              </header>
              <p className="order-detail-anomaly__copy">
                {reasonLabel ? `${reasonLabel}. ` : ""}
                {amountLine ? `${amountLine} ` : ""}
                Staff note: {order.anomalyResolutionNote}
                {order.anomalyResolvedAt
                  ? ` (${formatShortTime(order.anomalyResolvedAt)})`
                  : ""}
              </p>
            </section>
          ) : null}
        </div>
      </div>
      <AuthToast
        message={error}
        tone="error"
        onDismiss={() => setError(null)}
      />
    </div>
  );
}
