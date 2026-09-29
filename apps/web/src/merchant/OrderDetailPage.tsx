import { useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { PaymentDetails, Session } from "./api";
import { primaryMerchantOrgId, sessionCanManageIntegrations, sessionCanViewIntegrations } from "./org";
import { AuthToast } from "../auth/AuthToast";
import { merchantRoute, platformRoute } from "../shared/portalRouting";
import { ChainConfirmationsCard } from "./orderDetail/ChainConfirmationsCard";
import { OrderAnomalyPanel } from "./orderDetail/OrderAnomalyPanel";
import { OrderDetailHeader } from "./orderDetail/OrderDetailHeader";
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
  const backLabel = "← Back to invoices";

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
    copiedTx,
    polling,
    cancelling,
    resolving,
    resolveNote,
    setResolveNote,
    watching,
    webhooks,
    copyTxHash,
    onCancelOrder,
    onResolveAnomaly,
  } = useOrderDetail({ id, seededPay, session, canViewWebhooks, orgId });

  if (!id) {
    return (
      <div className="plat-bill-detail order-detail-bill">
        <p className="muted">This payment order could not be found.</p>
        <Link className="plat-bill-detail__back" to={backTo}>
          {backLabel}
        </Link>
      </div>
    );
  }

  if (loading && !order && !pay) {
    return (
      <div className="plat-bill-detail order-detail-bill">
        <p className="order-detail-page__loading muted">Loading payment order…</p>
      </div>
    );
  }

  if (error && !order) {
    return (
      <div className="plat-bill-detail order-detail-bill">
        <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />
        <p className="muted">Could not load this payment order.</p>
        <Link className="plat-bill-detail__back" to={backTo}>
          {backLabel}
        </Link>
      </div>
    );
  }

  const view = deriveOrderDetailView({ id, order, pay, chain, sellerOrg, session });
  const showCancel = !isPlatform && canCancelPendingOrder(session, order);
  const showResolve = !isPlatform && canResolveAnomalyOrder(session, order);

  return (
    <div className="plat-bill-detail order-detail-bill">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <OrderDetailHeader
        backTo={backTo}
        backLabel={backLabel}
        isPlatform={isPlatform}
        order={order}
        paymentPageUrl={pay?.paymentPageUrl}
        view={view}
      />

      <div className="plat-bill-detail__split plat-bill-detail__split--invoice">
        <div className="plat-bill-detail__main">
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

        <aside className="plat-bill-detail__side order-detail-bill__side no-print">
          {view.fulfillmentHint ? (
            <p className="plat-settings__notice order-detail-fulfillment-hint" role="status">
              {view.fulfillmentHint}
            </p>
          ) : null}

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

          <OrderTimelineCard order={order} pay={pay} chain={chain} view={view} />

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

          <OrderRailActions
            order={order}
            isPlatform={isPlatform}
            showCancel={showCancel}
            cancelling={cancelling}
            onCancel={() => void onCancelOrder()}
          />
        </aside>
      </div>
    </div>
  );
}
