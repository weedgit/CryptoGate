import { PortalLoginPage } from "../auth/PortalLoginPage";

type Props = {
  onSignedIn: () => void;
};

export function LoginPage({ onSignedIn }: Props) {
  return (
    <PortalLoginPage portalLabel="Merchant portal sign-in" onSignedIn={onSignedIn} />
  );
}
