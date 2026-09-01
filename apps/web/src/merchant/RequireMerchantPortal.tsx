import type { ReactNode } from "react";
import { PortalAccessGate } from "../auth/PortalAccessGate";
import type { Session } from "./api";
import { sessionIsMerchantStaff } from "./org";
import { portalHref } from "../shared/portalRouting";

type Props = {
  session: Session;
  children: ReactNode;
  onSignOut?: () => void;
};

export function RequireMerchantPortal({ session, children, onSignOut }: Props) {
  if (!sessionIsMerchantStaff(session)) {
    return (
      <PortalAccessGate
        title="Merchant access required"
        description="This browser already has a signed-in session on the merchant portal host, but the account is not a merchant membership. Each portal subdomain keeps its own login — sign out here, then sign in with a merchant account."
        roles={[
          "Merchant Owner",
          "Merchant Administrator",
          "Merchant Viewer",
          "Cashier",
        ]}
        links={[
          {
            href: portalHref("agent"),
            label: "Open agent portal",
            primary: true,
          },
          { href: portalHref("platform"), label: "Open platform portal" },
        ]}
        onSignOut={onSignOut}
      />
    );
  }
  return <>{children}</>;
}
