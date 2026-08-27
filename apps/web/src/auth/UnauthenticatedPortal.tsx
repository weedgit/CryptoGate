import { Route, Routes } from "react-router-dom";
import { PortalLoginPage } from "./PortalLoginPage";

type Props = {
  portalSubtitle: string;
  onSignedIn: () => void;
};

export function UnauthenticatedPortal({ portalSubtitle, onSignedIn }: Props) {
  return (
    <Routes>
      <Route
        path="forgot-password"
        element={
          <PortalLoginPage portalSubtitle={portalSubtitle} onSignedIn={onSignedIn} />
        }
      />
      <Route
        path="reset-password"
        element={
          <PortalLoginPage portalSubtitle={portalSubtitle} onSignedIn={onSignedIn} />
        }
      />
      <Route
        path="*"
        element={
          <PortalLoginPage portalSubtitle={portalSubtitle} onSignedIn={onSignedIn} />
        }
      />
    </Routes>
  );
}
