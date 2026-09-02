type Props = {
  size?: number;
  className?: string;
  alt?: string;
};

const SRC = "/brand/paymentgate-icon.png";

/** Official PaymentGate gate + check mark (3D brand icon). */
export function GateLogoMark({ size = 36, className = "", alt = "" }: Props) {
  return (
    <img
      className={className}
      src={SRC}
      width={size}
      height={size}
      alt={alt}
      decoding="async"
      draggable={false}
    />
  );
}
