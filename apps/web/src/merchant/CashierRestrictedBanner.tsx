export function CashierRestrictedBanner() {
  return (
    <div className="cashier-restricted-banner" role="status">
      <span className="cashier-lock" aria-hidden>
        🔒
      </span>
      <p>
        You are logged in as a <strong>Cashier</strong> — administrative dashboard
        controls, developer configurations, settings, and settlement controls are
        strictly restricted.
      </p>
    </div>
  );
}
