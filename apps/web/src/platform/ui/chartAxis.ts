/** Compact axis labels: 0, 250, 1.2k, 3.4M (optional USD suffix). */
export function formatAxisNumber(n: number, money = false): string {
  const suffix = money ? " USD" : "";
  let body: string;
  if (n === 0) {
    body = "0";
  } else {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) {
      const v = n / 1_000_000;
      body = `${v.toLocaleString(undefined, {
        maximumFractionDigits: v >= 10 ? 0 : 1,
      })}M`;
    } else if (abs >= 1_000) {
      const v = n / 1_000;
      body = `${v.toLocaleString(undefined, {
        maximumFractionDigits: v >= 10 ? 0 : 1,
      })}k`;
    } else {
      body = n.toLocaleString(undefined, {
        maximumFractionDigits: abs >= 100 ? 0 : 1,
      });
    }
  }
  return `${body}${suffix}`;
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

/** Sparkline Y max — never zero so all-zero series sit on the baseline. */
export function chartScaleTop(maxValue: number, targetCount = 4): number {
  const max = Math.max(maxValue, 0);
  const ticks = niceAxisTicks(max, targetCount);
  const tickTop = ticks[ticks.length - 1] ?? 0;
  return Math.max(tickTop, max || 1);
}
