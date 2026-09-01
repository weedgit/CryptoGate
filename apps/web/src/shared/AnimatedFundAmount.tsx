import { useAnimatedNumber } from "./useAnimatedNumber";

export function formatFundAmount(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type Props = {
  value: number;
  className: string;
  showUnit?: boolean;
};

/** Funds rail figure with a short count-up / count-down tween. */
export function AnimatedFundAmount({
  value,
  className,
  showUnit = true,
}: Props) {
  const shown = useAnimatedNumber(value);
  const label = showUnit
    ? `${formatFundAmount(value)} USD`
    : formatFundAmount(value);

  return (
    <span className={className} aria-label={label}>
      <span className="fund-amount" aria-hidden="true">
        {formatFundAmount(shown)}
      </span>
      {showUnit ? <span className="plat-fund-rail__unit">USD</span> : null}
    </span>
  );
}
