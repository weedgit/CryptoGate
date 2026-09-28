import { BATCH_MARK_PAID_MAX } from "./commissionsShared";

export function CommissionsBulkBar({
  count,
  onClear,
  onConfirmPay,
}: {
  count: number;
  onClear: () => void;
  onConfirmPay: () => void;
}) {
  return (
    <div className="plat-commissions__bulk-bar" role="status">
      <span>
        {count} selected
        {count >= BATCH_MARK_PAID_MAX
          ? ` (max ${BATCH_MARK_PAID_MAX} per batch)`
          : ""}
      </span>
      <button type="button" className="btn-secondary" onClick={onClear}>
        Clear
      </button>
      <button
        type="button"
        className="btn-primary"
        onClick={onConfirmPay}
      >
        Confirm &amp; pay {count}
      </button>
    </div>
  );
}
