export type ParsedMetric = {
  prefix: string;
  suffix: string;
  value: number;
  decimals: number;
  grouping: boolean;
};

const NUMBER_RE = /-?\d[\d,]*(?:\.\d+)?/;

/** First number in a formatted figure (`$1,234.50`, `12 USD`, `98.5%`), with its surroundings. */
export function parseMetricText(text: string): ParsedMetric | null {
  const m = NUMBER_RE.exec(text);
  if (!m) return null;
  const raw = m[0];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  const dot = raw.indexOf(".");
  return {
    prefix: text.slice(0, m.index),
    suffix: text.slice(m.index + raw.length),
    value,
    decimals: dot < 0 ? 0 : raw.length - dot - 1,
    grouping: raw.includes(",") || Math.abs(value) < 1000,
  };
}

/** Render `shown` in the same shape as the parsed source figure. */
export function formatMetricText(parsed: ParsedMetric, shown: number): string {
  const safe = Number.isFinite(shown) ? shown : 0;
  const figure = safe.toLocaleString("en-US", {
    minimumFractionDigits: parsed.decimals,
    maximumFractionDigits: parsed.decimals,
    useGrouping: parsed.grouping,
  });
  return `${parsed.prefix}${figure}${parsed.suffix}`;
}
