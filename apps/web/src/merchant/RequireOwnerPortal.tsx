import type { ReactNode } from "react";
import type { Session } from "./api";
import { CashierForbiddenPage } from "./CashierForbiddenPage";
import { sessionIsCashierOnly } from "./org";

type Props = {
  session: Session;
  area: string;
  children: ReactNode;
};

/** Blocks cashier-only sessions from owner/admin portal routes. */
export function RequireOwnerPortal({ session, area, children }: Props) {
  if (sessionIsCashierOnly(session)) {
    return <CashierForbiddenPage area={area} />;
  }
  return children;
}
