import { UnauthenticatedPortal } from "../auth/UnauthenticatedPortal";

type Props = {
  onSignedIn: () => void;
  startOnMfa?: boolean;
};

export function LoginPage({ onSignedIn, startOnMfa = false }: Props) {
  return (
    <UnauthenticatedPortal
      portalSubtitle="Merchant management portal"
      onSignedIn={onSignedIn}
      startOnMfa={startOnMfa}
    />
  );
}
