import type { Session } from "./api";
import { InvoiceListPage } from "../shared/InvoiceListPage";
import { sessionIsCashierOnly } from "./org";

type Props = { session: Session };

/** Merchant / cashier Invoice list (payment orders). */
export function OrdersListPage({ session }: Props) {
  const variant = sessionIsCashierOnly(session) ? "cashier" : "merchant";
  return <InvoiceListPage session={session} variant={variant} />;
}
