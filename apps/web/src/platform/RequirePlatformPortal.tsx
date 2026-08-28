import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { PortalAccessGate } from "../auth/PortalAccessGate";
import type { Session } from "./api";
import { sessionIsPlatformStaff } from "./org";

type Props = {
  session: Session;
  children: ReactNode;
};

export function RequirePlatformPortal({ session, children }: Props) {
  if (!sessionIsPlatformStaff(session)) {
    return (
      <PortalAccessGate
        title="Platform access required"
        description="Your account is signed in, but it is not a platform staff membership. Use the portal that matches your org role."
        roles={["Platform Owner", "Platform Administrator", "Platform Viewer"]}
        links={[
          { to: "/merchant", label: "Open merchant portal", primary: true },
          { to: "/agent", label: "Open agent portal" },
        ]}
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
    return <Navigate to="/platform" replace />;
  }
  return <>{children}</>;
}
