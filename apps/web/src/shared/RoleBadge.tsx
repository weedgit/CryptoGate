import { roleLabel } from "../merchant/org";

export type RoleTone = "owner" | "admin" | "viewer" | "cashier";

export function roleTone(role: string): RoleTone {
  if (role === "owner") return "owner";
  if (role === "administrator") return "admin";
  if (role === "cashier") return "cashier";
  return "viewer";
}

type Props = {
  role: string;
  label?: string;
  className?: string;
};

/** Compact role pill — matches team table badges (Owner / Administrator / Viewer / Cashier). */
export function RoleBadge({ role, label, className = "" }: Props) {
  const tone = roleTone(role);
  const text = label ?? roleLabel(role);
  return (
    <span
      className={`plat-team__role tone-${tone}${className ? ` ${className}` : ""}`}
    >
      {text}
    </span>
  );
}
