import { useMemo, type ReactNode } from "react";
import { formatMetricText, parseMetricText } from "./metricText";
import { useAnimatedNumber } from "./useAnimatedNumber";

type Props = {
  text: string | number | null | undefined;
  className?: string;
};

/** Count-up for an already formatted KPI figure; non-numeric text renders as-is. */
export function AnimatedText({ text, className }: Props) {
  const source = text == null ? "" : String(text);
  const parsed = useMemo(() => parseMetricText(source), [source]);
  const shown = useAnimatedNumber(parsed?.value ?? 0);

  if (!parsed) {
    return className ? <span className={className}>{source}</span> : <>{source}</>;
  }
  return (
    <span className={className} aria-label={source}>
      {formatMetricText(parsed, shown)}
    </span>
  );
}

/** Animate plain string / number card values; leave custom JSX untouched. */
export function animateCardValue(value: ReactNode): ReactNode {
  return typeof value === "string" || typeof value === "number" ? (
    <AnimatedText text={value} />
  ) : (
    value
  );
}
