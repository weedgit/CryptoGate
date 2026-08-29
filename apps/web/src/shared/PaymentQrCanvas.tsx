import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  payload: string;
  size?: number;
  className?: string;
  alt?: string;
};

/** Local canvas QR — no external image host (instant, ECC H for center marks). */
export function PaymentQrCanvas({
  payload,
  size = 164,
  className,
  alt = "Payment QR code",
}: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !payload) return;
    let cancelled = false;
    void QRCode.toCanvas(canvas, payload, {
      errorCorrectionLevel: "H",
      margin: 1,
      width: size,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err: unknown) => {
      if (!cancelled) console.warn("QR encode failed", err);
    });
    return () => {
      cancelled = true;
    };
  }, [payload, size]);

  return (
    <canvas
      ref={ref}
      className={className}
      width={size}
      height={size}
      role="img"
      aria-label={alt}
    />
  );
}
