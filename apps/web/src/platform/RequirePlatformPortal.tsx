import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { Session } from "./api";
import { sessionIsPlatformStaff } from "./org";

type Props = {
  session: Session;
  children: ReactNode;
};

export function RequirePlatformPortal({ session, children }: Props) {
  if (!sessionIsPlatformStaff(session)) {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>Platform access required</h1>
          <p style={{ color: "var(--muted)" }}>
            This portal is for platform Owner, Administrator, or Viewer accounts
            only.
          </p>
          <p>
            <a href="/merchant">Go to merchant portal</a>
          </p>
        </div>
      </div>
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
