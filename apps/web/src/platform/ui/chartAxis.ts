/** Compact axis labels: 0, 250, 1.2k, 3.4M (optional $ prefix). */
export function formatAxisNumber(n: number, money = false): string {
  const prefix = money ? "$" : "";
  if (n === 0) return `${prefix}0`;
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${prefix}${v.toLocaleString(undefined, {
      maximumFractionDigits: v >= 10 ? 0 : 1,
    })}M`;
  }
  if (abs >= 1_000) {
    const v = n / 1_000;
    return `${prefix}${v.toLocaleString(undefined, {
      maximumFractionDigits: v >= 10 ? 0 : 1,
    })}k`;
  }
  return `${prefix}${n.toLocaleString(undefined, {
    maximumFractionDigits: abs >= 100 ? 0 : 1,
  })}`;
}

export function niceAxisTicks(maxValue: number, targetCount = 4): number[] {
  const max = Math.max(maxValue, 0);
  if (max === 0) return [0];
  const rough = max / Math.max(targetCount - 1, 1);
  const mag = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / mag;
  let step = mag;
  if (residual > 5) step = 10 * mag;
  else if (residual > 2) step = 5 * mag;
  else if (residual > 1) step = 2 * mag;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}
