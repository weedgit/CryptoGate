export type BillKpiAccent = "warn" | "danger" | "blue" | "violet" | "ok" | "slate";

export function BillKpiIcon({
  accent,
  size = 28,
  className,
}: {
  accent: BillKpiAccent;
  size?: number;
  className?: string;
}) {
  const stroke = {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  const filled = {
    className,
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor" as const,
    "aria-hidden": true as const,
  };
  if (accent === "danger") {
    return (
      <svg {...stroke}>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  if (accent === "warn") {
    return (
      <svg {...stroke}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
    );
  }
  if (accent === "ok") {
    return (
      <svg {...filled}>
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.05 13.55-3.55-3.55 1.45-1.45 2.1 2.1 4.55-4.55 1.45 1.45-6 6Z" />
      </svg>
    );
  }
  if (accent === "violet") {
    return (
      <svg {...filled}>
        <path d="M21.5 6.2v5.6h-1.9V9.45l-6.55 6.55-3.4-3.4-5.9 5.9-1.35-1.35 7.25-7.25 3.4 3.4 5.2-5.2H15.9V6.2h5.6Z" />
      </svg>
    );
  }
  if (accent === "blue") {
    return (
      <svg {...stroke}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6" />
        <path d="M9 17h4" />
      </svg>
    );
  }
  return (
    <svg {...filled}>
      <path d="M12 2.8 20.2 7.4v9.2L12 21.2 3.8 16.6V7.4L12 2.8Zm0 2.2L5.7 8.55 12 12.1l6.3-3.55L12 5ZM5.7 10.65v5.2L11.05 19V13.8L5.7 10.65Zm7.35 3.15V19l5.35-3.15v-5.2L13.05 13.8Z" />
    </svg>
  );
}
