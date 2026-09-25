import { useLayoutEffect, useRef, useState, type ElementType } from "react";

type Props = {
  text: string;
  className?: string;
  title?: string;
  as?: "p" | "span";
};

let measureCanvas: HTMLCanvasElement | null = null;

function measureWidth(font: string, value: string): number {
  if (typeof document === "undefined") return value.length * 8;
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return value.length * 8;
  ctx.font = font;
  return ctx.measureText(value).width;
}

function fitMiddleEllipsis(font: string, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || measureWidth(font, text) <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 1;
  let hi = Math.max(1, Math.floor((text.length - ellipsis.length) / 2));
  let best = `${text.slice(0, 1)}${ellipsis}${text.slice(-1)}`;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = `${text.slice(0, mid)}${ellipsis}${text.slice(-mid)}`;
    if (measureWidth(font, candidate) <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

/** Shows full `text` when it fits; otherwise middle-truncates with a centered ellipsis. */
export function MiddleEllipsisText({
  text,
  className,
  title,
  as = "p",
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [display, setDisplay] = useState(text);
  const Tag = as as ElementType;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const sync = () => {
      const styles = getComputedStyle(el);
      const font = `${styles.fontStyle} ${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;
      setDisplay(fitMiddleEllipsis(font, text, el.clientWidth));
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  return (
    <Tag ref={ref} className={className} title={title ?? text}>
      {display}
    </Tag>
  );
}
