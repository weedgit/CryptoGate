import { Link } from "react-router-dom";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { OnboardWizardPortal } from "./OnboardWizardPortal";

type Props = {
  title: string;
  copy?: string;
  closeTo?: string;
};

/** Modal shell shown while an onboard wizard chunk loads or prefetches data. */
export function OnboardWizardLoading({
  title,
  copy = "Opening this form.",
  closeTo,
}: Props) {
  return (
    <OnboardWizardPortal>
      <div className="b4-wizard-page">
        <div className="b4-wizard-backdrop">
          <div
            className="b4-wizard"
            role="dialog"
            aria-modal="true"
            aria-busy="true"
            aria-labelledby="onboard-wizard-loading-title"
          >
            <header className="b4-wizard__head">
              <h2 id="onboard-wizard-loading-title" className="b4-wizard__title">
                {title}
              </h2>
              {closeTo ? (
                <Link className="b4-wizard__close" to={closeTo} aria-label="Close">
                  ×
                </Link>
              ) : null}
            </header>
            <div className="b4-wizard__body">
              <PlatformPending title="Loading" copy={copy} compact />
            </div>
          </div>
        </div>
      </div>
    </OnboardWizardPortal>
  );
}
