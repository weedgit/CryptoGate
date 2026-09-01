import { Navigate, useLocation } from "react-router-dom";

/** Legacy invite links used /invite?token= — forward to reset-password. */
export function InviteLegacyRedirect() {
  const { search } = useLocation();
  const token = new URLSearchParams(search).get("token")?.trim();
  if (token) {
    return (
      <Navigate
        to={`/reset-password?token=${encodeURIComponent(token)}`}
        replace
      />
    );
  }
  return <Navigate to="/" replace />;
}
