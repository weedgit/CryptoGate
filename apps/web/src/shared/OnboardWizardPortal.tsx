import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Portals onboard wizards to document.body as a centered card over a scrim. */
export function OnboardWizardPortal({ children }: Props) {
  return createPortal(
    <div className="b4-wizard-portal">{children}</div>,
    document.body,
  );
}
