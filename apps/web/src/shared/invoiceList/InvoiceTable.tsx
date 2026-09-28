import type { OrgAccount, PaymentOrder } from "../../merchant/api";
import type { InvoiceListVariant } from "../invoiceListModel";
import { InvoiceRow } from "./InvoiceRow";

type Props = {
  variant: InvoiceListVariant;
  orders: PaymentOrder[];
  orgById: Map<string, OrgAccount>;
  userNameById: Map<string, string>;
  userAvatarById: Map<string, string | null>;
  nowMs: number;
  orderHref: (id: string) => string;
};

export function InvoiceTable({
  variant,
  orders,
  orgById,
  userNameById,
  userAvatarById,
  nowMs,
  orderHref,
}: Props) {
  const partyColumnLabel =
    variant === "cashier" ? "Site" : "Merchant & Cashier";

  return (
    <table className="invoice-list__table">
      <thead>
        <tr>
          <th>Invoice</th>
          <th className="invoice-list__th-merchant">{partyColumnLabel}</th>
          <th className="invoice-list__th-amount">Amount (USD)</th>
          <th>Asset &amp; Network</th>
          <th>Status</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <InvoiceRow
            key={order.id}
            variant={variant}
            order={order}
            orgById={orgById}
            userNameById={userNameById}
            userAvatarById={userAvatarById}
            nowMs={nowMs}
            orderHref={orderHref}
          />
        ))}
      </tbody>
    </table>
  );
}
