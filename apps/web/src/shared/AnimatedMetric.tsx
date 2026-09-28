import { useAnimatedNumber } from "./useAnimatedNumber";

type Props = {
  value: number;
  /** Decimal places — 0 for counts. */
  decimals?: number;
  className?: string;
  /** Rendered inside the same span (e.g. "$") so it shares size and colour. */
  prefix?: string;
};

/** Count-up / count-down for dashboard KPIs (integers or fixed decimals). */
export function AnimatedMetric({ value, decimals = 0, className, prefix = "" }: Props) {
  const shown = useAnimatedNumber(value);
  const safe = Number.isFinite(shown) ? shown : 0;
  const text =
    prefix +
    (decimals > 0
      ? safe.toLocaleString(undefined, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : Math.round(safe).toLocaleString());

  return (
    <span className={className} aria-label={text}>
      {text}
    </span>
  );
}
