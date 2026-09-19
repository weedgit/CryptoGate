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

/**
 * Even Y-axis ticks for line charts (exchange-style).
 * Aims for ~`targetCount` labels including 0, using 1 / 2 / 2.5 / 5 / 10 × 10ⁿ steps
 * so scales like 0–1k get 0 / 250 / 500 / 750 / 1k instead of sparse 0 / 500 / 1k.
 */
export function niceAxisTicks(maxValue: number, targetCount = 5): number[] {
  const max = Math.max(maxValue, 0);
  if (max === 0) return [0];
  const gaps = Math.max(targetCount - 1, 1);
  const rough = max / gaps;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / mag;
  let step: number;
  if (residual <= 1.2) step = mag;
  else if (residual <= 2.2) step = 2 * mag;
  else if (residual <= 3.5) step = 2.5 * mag;
  else if (residual <= 7) step = 5 * mag;
  else step = 10 * mag;

  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step * 0.001; v += step) {
    ticks.push(Number(v.toPrecision(12)));
  }
  // If still too many lines, coarsen once (keeps charts readable).
  if (ticks.length > targetCount + 2) {
    const coarser =
      step === mag
        ? 2 * mag
        : step === 2 * mag
          ? 2.5 * mag
          : step === 2.5 * mag
            ? 5 * mag
            : 10 * mag;
    const top2 = Math.ceil(max / coarser) * coarser;
    const out: number[] = [];
    for (let v = 0; v <= top2 + coarser * 0.001; v += coarser) {
      out.push(Number(v.toPrecision(12)));
    }
    return out;
  }
  return ticks;
}

/** Sparkline Y max — never zero so all-zero series sit on the baseline. */
export function chartScaleTop(maxValue: number, targetCount = 5): number {
  const max = Math.max(maxValue, 0);
  const ticks = niceAxisTicks(max, targetCount);
  const tickTop = ticks[ticks.length - 1] ?? 0;
  return Math.max(tickTop, max || 1);
}
