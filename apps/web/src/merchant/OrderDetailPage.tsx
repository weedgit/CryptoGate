import { useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { PaymentDetails, Session } from "./api";
import { primaryMerchantOrgId, sessionCanManageIntegrations, sessionCanViewIntegrations } from "./org";
import { AuthToast } from "../auth/AuthToast";
import { merchantRoute, platformRoute } from "../shared/portalRouting";
import { ChainConfirmationsCard } from "./orderDetail/ChainConfirmationsCard";
import { OrderAnomalyPanel } from "./orderDetail/OrderAnomalyPanel";
import { OrderDetailTopbar } from "./orderDetail/OrderDetailTopbar";
import { OrderGatewayCard } from "./orderDetail/OrderGatewayCard";
import { OrderInvoice } from "./orderDetail/OrderInvoice";
import { OrderRailActions } from "./orderDetail/OrderRailActions";
import { OrderTimelineCard } from "./orderDetail/OrderTimelineCard";
import { WebhookDeliveriesCard } from "./orderDetail/WebhookDeliveriesCard";
import { deriveOrderDetailView } from "./orderDetail/orderDetailView";
import { canCancelPendingOrder, canResolveAnomalyOrder } from "./orderDetail/orderPermissions";
import { useOrderDetail } from "./orderDetail/useOrderDetail";

type Props = {
  session: Session;
  /** Platform opens the same evidence UI watch-only (no cancel / resolve / create). */
  variant?: "merchant" | "platform";
  /**
   * Merchant orders live under `orders/*`, so React Router splat is `*` not `:id`.
   * Parent routes pass the id explicitly; platform still uses `orders/:id`.
   */
  orderId?: string;
};

function paymentOrderIdFromRoute(
  explicit: string | undefined,
  params: Record<string, string | undefined>,
): string | undefined {
  const splat = params["*"]?.split("/").filter(Boolean)[0];
  const raw = explicit || params.id || params.orderId || splat;
  if (!raw || raw === "new") return undefined;
  return raw;
}

export function OrderDetailPage({
  session,
  variant = "merchant",
  orderId: orderIdProp,
}: Props) {
  const params = useParams();
  const id = paymentOrderIdFromRoute(orderIdProp, params);
  const location = useLocation();
  const invoiceRef = useRef<HTMLElement | null>(null);
  const seededPay = (location.state as { pay?: PaymentDetails } | null)?.pay;
  const isPlatform = variant === "platform";
  const backTo = isPlatform ? platformRoute("invoices") : merchantRoute("orders");
  const backLabel = isPlatform ? "← Back to invoices" : "← Back to invoices";
  const topbarCenterId = isPlatform
    ? "platform-topbar-center"
    : "platform-topbar-center";

  const [topbarSlot, setTopbarSlot] = useState<HTMLElement | null>(null);

  const orgId = primaryMerchantOrgId(session);
  const canViewWebhooks = !isPlatform && sessionCanViewIntegrations(session);
  const canResendWebhooks = sessionCanManageIntegrations(session);

  const {
    order,
    pay,
    chain,
    sellerOrg,
    sellerContactEmail,
    loading,
    error,
    setError,
    copied,
    copiedTx,
    nowTick,
    polling,
    cancelling,
    resolving,
    resolveNote,
    setResolveNote,
    watching,
    webhooks,
    copyAddress,
    copyTxHash,
    onCancelOrder,
    onResolveAnomaly,
  } = useOrderDetail({ id, seededPay, session, canViewWebhooks, orgId });

  useLayoutEffect(() => {
    setTopbarSlot(document.getElementById(topbarCenterId));
  }, [topbarCenterId]);

  if (!id) {
    return (
      <div className="order-detail-page plat-settings plat-settings--merchant">
        <section className="plat-settings__card">
          <div className="plat-settings__card-body">
            <p className="muted">This payment order could not be found.</p>
            <Link className="order-detail-topbar__back" to={backTo}>
              {backLabel}
            </Link>
          </div>
        </section>
      </div>
    );
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

  const view = deriveOrderDetailView({ id, order, pay, chain, sellerOrg, session });
  const showCancel = !isPlatform && canCancelPendingOrder(session, order);
  const showResolve = !isPlatform && canResolveAnomalyOrder(session, order);

  const topbarChrome =
    topbarSlot && !loading && (order || pay) ? (
      <OrderDetailTopbar
        slot={topbarSlot}
        backTo={backTo}
        isPlatform={isPlatform}
        order={order}
        pay={pay}
        view={view}
      />
    ) : null;

  return (
    <div className="order-detail-page plat-settings plat-settings--merchant">
      {topbarChrome}

      <div className="order-detail-page__layout">
        <div className="order-detail-page__main">
          <OrderInvoice
            id={id}
            order={order}
            pay={pay}
            chain={chain}
            sellerOrg={sellerOrg}
            sellerContactEmail={sellerContactEmail}
            view={view}
            invoiceRef={invoiceRef}
          />
        </div>

        <div className="order-detail-page__rail no-print">
          <div className="order-detail-page__rail-body">
            {view.fulfillmentHint ? (
              <p className="plat-settings__notice order-detail-fulfillment-hint" role="status">
                {view.fulfillmentHint}
              </p>
            ) : null}
            <OrderGatewayCard
              order={order}
              view={view}
              nowTick={nowTick}
              copied={copied}
              onCopyAddress={() => void copyAddress()}
            />

            <aside className="order-detail-page__aside">
              <ChainConfirmationsCard
                status={view.status}
                progress={view.progress}
                confirmationStatusSuffix={view.confirmationStatusSuffix}
                txHash={chain?.txHash}
                watching={watching}
                polling={polling}
                copiedTx={copiedTx}
                onCopyTxHash={() => void copyTxHash()}
              />

              {canViewWebhooks ? (
                <WebhookDeliveriesCard
                  rows={webhooks.webhookRows}
                  msg={webhooks.webhookMsg}
                  busy={webhooks.webhookBusy}
                  canResend={canResendWebhooks}
                  onResend={webhooks.resendDelivery}
                />
              ) : null}

              <OrderTimelineCard order={order} pay={pay} chain={chain} view={view} />
            </aside>
          </div>

          <OrderRailActions
            order={order}
            paymentPageUrl={pay?.paymentPageUrl}
            isPlatform={isPlatform}
            showCancel={showCancel}
            cancelling={cancelling}
            onCancel={() => void onCancelOrder()}
          />

          <OrderAnomalyPanel
            order={order}
            view={view}
            isPlatform={isPlatform}
            showResolve={showResolve}
            resolveNote={resolveNote}
            onResolveNoteChange={setResolveNote}
            resolving={resolving}
            onResolve={() => void onResolveAnomaly()}
          />
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
