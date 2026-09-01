import { Route, Routes } from "react-router-dom";
import { PortalLoginPage } from "./PortalLoginPage";
import { InviteLegacyRedirect } from "./InviteLegacyRedirect";

type Props = {
  portalSubtitle: string;
  onSignedIn: () => void;
  startOnMfa?: boolean;
};

export function UnauthenticatedPortal({
  portalSubtitle,
  onSignedIn,
  startOnMfa = false,
}: Props) {
  return (
    <Routes>
      <Route path="invite" element={<InviteLegacyRedirect />} />
      <Route
        path="forgot-password"
        element={
          <PortalLoginPage
            portalSubtitle={portalSubtitle}
            onSignedIn={onSignedIn}
          />
        }
      />
      <Route
        path="reset-password"
        element={
          <PortalLoginPage
            portalSubtitle={portalSubtitle}
            onSignedIn={onSignedIn}
          />
        }
      />
      <Route
        path="*"
        element={
          <PortalLoginPage
            portalSubtitle={portalSubtitle}
            onSignedIn={onSignedIn}
            startOnMfa={startOnMfa}
          />
        }
      />
    </Routes>
  );
}
