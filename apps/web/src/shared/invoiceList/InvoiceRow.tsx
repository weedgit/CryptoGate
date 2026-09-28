import { Link } from "react-router-dom";
import { DefaultUserAvatar } from "../../auth/DefaultUserAvatar";
import type { OrgAccount, PaymentOrder } from "../../merchant/api";
import { getMerchantOrder } from "../../merchant/merchantOrderDetail";
import { getMerchantOrderPayment } from "../../merchant/merchantOrderPaymentDetails";
import { orderStatusLabel, orderStatusTone } from "../../merchant/orderStatus";
import { FundAmount } from "../../platform/FundAmount";
import { displayNetworkForPair } from "../assetNetworks";
import { AssetIcon, NetworkIcon } from "../../platform/cryptoIcons";
import {
  formatInvoiceCreatedDate,
  formatInvoiceCreatedTime,
  invoiceConversion,
  type InvoiceListVariant,
} from "../invoiceListModel";
import { OrderChannelTag } from "../OrderChannelTag";
import { OrgBrandMark } from "../OrgBrandMark";
import { platformRoute } from "../portalRouting";
import { EvidenceChip } from "./EvidenceChip";
import { ExpiryLeft } from "./ExpiryLeft";

function merchantIdForOrg(
  org: OrgAccount | undefined,
  byId: Map<string, OrgAccount>,
): string | null {
  if (!org) return null;
  if (org.type === "merchant") return org.id;
  if (org.type === "merchant_site" && org.parentId) {
    const parent = byId.get(org.parentId);
    if (parent?.type === "merchant") return parent.id;
    return org.parentId;
  }
  return null;
}

type Props = {
  variant: InvoiceListVariant;
  order: PaymentOrder;
  orgById: Map<string, OrgAccount>;
  userNameById: Map<string, string>;
  userAvatarById: Map<string, string | null>;
  nowMs: number;
  orderHref: (id: string) => string;
};

export function InvoiceRow({
  variant,
  order,
  orgById,
  userNameById,
  userAvatarById,
  nowMs,
  orderHref,
}: Props) {
  const rowOrg = order.orgId
    ? orgById.get(order.orgId)
    : undefined;
  const isSite = rowOrg?.type === "merchant_site";
  const mid = merchantIdForOrg(rowOrg, orgById);
  const merchantOrg = mid ? orgById.get(mid) : undefined;
  const displayName =
    merchantOrg?.name ??
    rowOrg?.name ??
    order.orgName ??
    (order.orgId ? order.orgId.slice(0, 8) : "—");
  const siteName = isSite ? rowOrg?.name ?? null : null;
  const refLabel = order.merchantReference?.trim() || "—";
  const cashierLabel =
    order.createdByName?.trim() ||
    (order.createdBy
      ? userNameById.get(order.createdBy)
      : undefined) ||
    order.createdByEmail?.trim() ||
    (order.createdBy ? order.createdBy.slice(0, 8) : "—");
  const partyIconKey =
    rowOrg?.iconKey ?? merchantOrg?.iconKey ?? null;
  const cashierAvatar =
    order.createdByAvatarUrl?.trim() ||
    (order.createdBy
      ? userAvatarById.get(order.createdBy)
      : undefined) ||
    null;
  const conversion = invoiceConversion(order);

  return (
    <tr
      className={
        order.status === "payment_anomaly"
          ? "invoice-list__row--anomaly"
          : undefined
      }
    >
      <td className="invoice-list__invoice-cell">
        <Link
          className="invoice-list__order"
          to={orderHref(order.id)}
          onMouseEnter={() => {
            void getMerchantOrder(order.id);
            void getMerchantOrderPayment(order.id);
          }}
        >
          {order.orderNumber}
        </Link>
        <OrderChannelTag via={order.createdVia} className="invoice-list__channel" />
        <span className="invoice-list__invoice-ref">
          Ref : {refLabel}
        </span>
      </td>
      <td className="invoice-list__merchant">
        <div className="invoice-list__party">
          <OrgBrandMark
            name={displayName}
            iconKey={partyIconKey}
            size={40}
            className="invoice-list__party-mark"
          />
          <div className="invoice-list__party-body">
            <div className="invoice-list__party-merchant">
              <span className="invoice-list__party-name">
                {displayName}
              </span>
              {siteName ? (
                <span className="invoice-list__site">
                  {" "}
                  · {siteName}
                </span>
              ) : null}
              {variant === "platform" && mid
                ? (() => {
                    const paused =
                      merchantOrg?.status === "paused" ||
                      rowOrg?.status === "paused";
                    const createBlocked =
                      merchantOrg?.orderCreateSuspended ===
                        true ||
                      rowOrg?.orderCreateSuspended === true;
                    const merchantHref = platformRoute(
                      `accounts/merchants/${encodeURIComponent(mid)}`,
                    );
                    if (!paused && !createBlocked) return null;
                    return (
                      <span className="invoice-list__compliance">
                        {paused ? (
                          <Link
                            className="invoice-list__compliance-badge is-paused"
                            to={merchantHref}
                            title="Merchant suspended — open merchant"
                          >
                            Suspended
                          </Link>
                        ) : null}
                        {createBlocked ? (
                          <Link
                            className="invoice-list__compliance-badge is-suspended"
                            to={merchantHref}
                            title="Order create blocked — open merchant"
                          >
                            Create blocked
                          </Link>
                        ) : null}
                      </span>
                    );
                  })()
                : null}
            </div>
            {variant !== "cashier" ? (
              <div className="invoice-list__party-cashier">
                <span
                  className="invoice-list__user-avatar"
                  aria-hidden
                >
                  {cashierAvatar ? (
                    <img src={cashierAvatar} alt="" />
                  ) : (
                    <DefaultUserAvatar className="invoice-list__user-avatar-default" />
                  )}
                </span>
                <span className="invoice-list__cashier-name">
                  {cashierLabel}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="invoice-list__amount-usd">
        <FundAmount
          amount={
            order.invoiceAmountUsd ?? order.payableAmount.amount
          }
        />
      </td>
      <td className="invoice-list__crypto">
        <span className="invoice-list__crypto-amount">
          {conversion.cryptoLabel}{" "}
          <span className="invoice-list__crypto-unit">{conversion.unit}</span>
        </span>
        {conversion.formula ? (
          <span className="invoice-list__crypto-formula">
            {conversion.formula}/{order.asset}
          </span>
        ) : null}
      </td>
      <td className="invoice-list__rate">
        {conversion.rateLabel ? (
          <span className="invoice-list__rate-value">
            {conversion.rateLabel}{" "}
            <span className="invoice-list__rate-unit">/ {order.asset}</span>
          </span>
        ) : (
          <span className="invoice-list__rate-value is-none">—</span>
        )}
        <EvidenceChip evidence={conversion.evidence} />
        <span className="invoice-list__rate-meta">{conversion.evidence.meta}</span>
      </td>
      <td className="invoice-list__asset-net">
        <span className="invoice-list__asset-net-cell">
          <span className="invoice-list__asset-net-icons" aria-hidden>
            <AssetIcon asset={order.asset} />
            <span className="invoice-list__asset-net-badge">
              <NetworkIcon network={order.network} />
            </span>
          </span>
          <span className="invoice-list__asset-net-text">
            <span className="invoice-list__asset-net-asset">
              {order.asset}
            </span>
            <span className="invoice-list__asset-net-network">
              {displayNetworkForPair(order.asset, order.network)}
            </span>
          </span>
        </span>
      </td>
      <td>
        <span
          className={`status-badge invoice-list__status-badge tone-${orderStatusTone(order.status, order)}`}
        >
          {orderStatusLabel(order.status, order)}
        </span>
        {order.status === "pending_payment" ? (
          <ExpiryLeft expiresAt={order.expiresAt} nowMs={nowMs} />
        ) : null}
      </td>
      <td className="invoice-list__created">
        <span className="invoice-list__created-date">
          {formatInvoiceCreatedDate(order.createdAt)}
        </span>
        <span className="invoice-list__created-time">
          {formatInvoiceCreatedTime(order.createdAt)}
        </span>
      </td>
    </tr>
  );
}
