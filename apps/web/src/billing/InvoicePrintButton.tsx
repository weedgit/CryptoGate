import type { ButtonHTMLAttributes } from "react";

function IconPrint() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="currentColor"
        d="M7 3h10v4H7zm-3 6h16a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2m2 8v2h10v-2zm12-5.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2"
      />
    </svg>
  );
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label?: string;
};

/** Shared print control for invoice / order detail chrome. */
export function InvoicePrintButton({
  label = "Print",
  className = "sb-invoice__print-btn",
  type = "button",
  onClick,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={className}
      onClick={onClick ?? (() => window.print())}
      {...rest}
    >
      <IconPrint />
      <span>{label}</span>
    </button>
  );
}
