import { useAnimatedNumber } from "./useAnimatedNumber";

type Props = {
  value: number;
  /** Decimal places — 0 for counts. */
  decimals?: number;
  className?: string;
};

/** Count-up / count-down for dashboard KPIs (integers or fixed decimals). */
export function AnimatedMetric({ value, decimals = 0, className }: Props) {
  const shown = useAnimatedNumber(value);
  const safe = Number.isFinite(shown) ? shown : 0;
  const text =
    decimals > 0
      ? safe.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(safe).toLocaleString();

  return (
    <span className={className} aria-label={text}>
      {text}
    </span>
  );
}
