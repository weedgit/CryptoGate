import type { Session } from "../api";
import { primaryMerchantOrgId } from "../org";
import { PagePending } from "../../platform/ui/PlatformPending";
import { POS_ONLY_NOTE, useCashierWebOrders } from "./cashierPosPolicy";
import { PayPadPage } from "./PayPadPage";
import { ShiftPage } from "./ShiftPage";

type Props = { session: Session };

/** Cashier index: the charge pad, or My shift when the merchant takes payments in the POS app only. */
export function CashierHomePage({ session }: Props) {
  const allowed = useCashierWebOrders(primaryMerchantOrgId(session));
  if (allowed == null) return <PagePending />;
  if (!allowed) return <ShiftPage session={session} notice={POS_ONLY_NOTE} />;
  return <PayPadPage session={session} />;
}
