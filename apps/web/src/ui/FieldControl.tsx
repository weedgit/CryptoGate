import type { ReactNode } from "react";
import {
  ClockIcon,
  CoinsIcon,
  CoinIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  LockIcon,
  MailIcon,
  TagIcon,
  UserIcon,
} from "../auth/LoginIcons";

export type FieldControlIcon =
  | "user"
  | "mail"
  | "globe"
  | "clock"
  | "lock"
  | "coins"
  | "coin"
  | "tag";

function FieldIconGlyph({ name }: { name: FieldControlIcon }) {
  if (name === "user") return <UserIcon />;
  if (name === "mail") return <MailIcon />;
  if (name === "globe") return <GlobeIcon />;
  if (name === "clock") return <ClockIcon />;
  if (name === "coins") return <CoinsIcon />;
  if (name === "coin") return <CoinIcon />;
  if (name === "tag") return <TagIcon />;
  return <LockIcon />;
}

type Props = {
  /** Optional left icon addon — omit for plain Setting-style shell. */
  icon?: FieldControlIcon;
  /** Custom leading mark (e.g. asset icon); takes precedence over `icon`. */
  leading?: ReactNode;
  children: ReactNode;
  invalid?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  toggleDisabled?: boolean;
  /** Extra class on the shell root (e.g. amount row layout). */
  shellClassName?: string;
};

/** Shared input shell — optional left icon + optional password eye. */
export function FieldControl({
  icon,
  leading,
  children,
  invalid = false,
  showPassword,
  onTogglePassword,
  toggleDisabled,
  shellClassName,
}: Props) {
  const withToggle = typeof onTogglePassword === "function";
  return (
    <div
      className={[
        "field-shell",
        icon || leading ? "field-shell--icon" : "",
        leading ? "field-shell--custom-icon" : "",
        withToggle ? "field-shell--toggle" : "",
        invalid ? "is-invalid" : "",
        shellClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon || leading ? (
        <span className="field-shell__icon" aria-hidden>
          {leading ?? (icon ? <FieldIconGlyph name={icon} /> : null)}
        </span>
      ) : null}
      {children}
      {withToggle ? (
        <button
          type="button"
          className="field-shell__password-toggle"
          onClick={onTogglePassword}
          aria-label={showPassword ? "Hide password" : "Show password"}
          disabled={toggleDisabled}
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      ) : null}
    </div>
  );
}
