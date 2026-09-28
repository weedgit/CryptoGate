import { CommissionPeriodPicker } from "./CommissionPeriodPicker";

export function CommissionsPeriodBar({
  isPortal,
  canPay,
  generatePeriod,
  onGeneratePeriodChange,
  fetching,
  onRefresh,
  busy,
  onGenerate,
}: {
  isPortal: boolean;
  canPay: boolean;
  generatePeriod: string;
  onGeneratePeriodChange: (next: string) => void;
  fetching: boolean;
  onRefresh: () => void;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="plat-bills__period-bar">
      <div className="plat-bills__intro">
        <span className="plat-bills__intro-icon" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="36"
            height="36"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6" />
            <path d="M9 13h6" />
            <path d="M9 17h4" />
          </svg>
        </span>
        <div className="plat-bills__intro-copy">
          <h1 className="plat-bills__intro-title">Commissions</h1>
          <p className="plat-bills__intro-sub">
            {isPortal
              ? "Monthly commission invoices from the platform."
              : "Platform → agent monthly invoices and remittance."}
          </p>
        </div>
      </div>
      <div className="plat-bills__period-tools">
        <div className="plat-commissions__period-group">
          {canPay ? (
            <CommissionPeriodPicker
              value={generatePeriod}
              onChange={onGeneratePeriodChange}
            />
          ) : null}
          <button
            type="button"
            className={`plat-commissions__refresh${fetching ? " is-spinning" : ""}`}
            onClick={onRefresh}
            disabled={fetching}
            aria-label="Refresh commissions"
            title="Refresh"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
              <path
                d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4.5h-4.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {canPay ? (
          <div
            className="plat-commissions__generate"
            aria-label="Commission invoice actions"
          >
            <button
              type="button"
              className="btn-primary plat-bills__action-btn plat-commissions__generate-btn"
              disabled={busy}
              onClick={onGenerate}
            >
              {busy ? "Generating…" : "Generate invoices"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
