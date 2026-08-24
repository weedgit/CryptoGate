import { PortalLoginPage } from "../auth/PortalLoginPage";

type Props = {
  onSignedIn: () => void;
};

export function LoginPage({ onSignedIn }: Props) {
  return (
    <PortalLoginPage portalLabel="Agent portal sign-in" onSignedIn={onSignedIn} />
  );
}
