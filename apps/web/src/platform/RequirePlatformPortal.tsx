import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { PortalAccessGate } from "../auth/PortalAccessGate";
import type { Session } from "./api";
import { sessionIsPlatformStaff } from "./org";
import { platformRoute, portalHref } from "../shared/portalRouting";

type Props = {
  session: Session;
  children: ReactNode;
  onSignOut?: () => void;
};

export function RequirePlatformPortal({ session, children, onSignOut }: Props) {
  if (!sessionIsPlatformStaff(session)) {
    return (
      <PortalAccessGate
        title="Platform access required"
        description="This browser already has a signed-in session on the platform portal host, but the account is not a platform staff membership. Each portal subdomain keeps its own login — sign out here, then sign in with a platform account."
        roles={["Platform Owner", "Platform Administrator", "Platform Viewer"]}
        links={[
          {
            href: portalHref("merchant"),
            label: "Open merchant portal",
            primary: true,
          },
          { href: portalHref("agent"), label: "Open agent portal" },
        ]}
        onSignOut={onSignOut}
      />
    );
  }
  return <>{children}</>;
}

export function RequirePlatformOperator({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const allowed = session.memberships.some(
    (m) =>
      m.orgType === "platform" &&
      (m.role === "owner" || m.role === "administrator"),
  );
  if (!allowed) {
    return <Navigate to={platformRoute()} replace />;
  }
  return <>{children}</>;
}
