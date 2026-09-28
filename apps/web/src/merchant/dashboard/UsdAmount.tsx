type Props = {
  value: number;
};

/** Table amount: bold figure with a muted "USD" unit. */
export function UsdAmount({ value }: Props) {
  const amount = value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  return (
    <span className={`merchant-dash-table__amount${value === 0 ? " is-zero" : ""}`}>
      {amount}
      <span className="merchant-dash-table__unit">USD</span>
    </span>
  );
}
