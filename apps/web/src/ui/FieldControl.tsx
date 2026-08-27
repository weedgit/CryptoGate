import type { ReactNode } from "react";
import {
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  LockIcon,
  MailIcon,
  UserIcon,
} from "../auth/LoginIcons";

export type FieldControlIcon = "user" | "mail" | "globe" | "clock" | "lock";

function FieldIconGlyph({ name }: { name: FieldControlIcon }) {
  if (name === "user") return <UserIcon />;
  if (name === "mail") return <MailIcon />;
  if (name === "globe") return <GlobeIcon />;
  if (name === "clock") return <ClockIcon />;
  return <LockIcon />;
}

type Props = {
  /** Optional left icon addon — omit for plain Setting-style shell. */
  icon?: FieldControlIcon;
  children: ReactNode;
  invalid?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  toggleDisabled?: boolean;
};

/** Shared input shell — optional left icon + optional password eye. */
export function FieldControl({
  icon,
  children,
  invalid = false,
  showPassword,
  onTogglePassword,
  toggleDisabled,
}: Props) {
  const withToggle = typeof onTogglePassword === "function";
  return (
    <div
      className={[
        "field-shell",
        icon ? "field-shell--icon" : "",
        withToggle ? "field-shell--toggle" : "",
        invalid ? "is-invalid" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? (
        <span className="field-shell__icon" aria-hidden>
          <FieldIconGlyph name={icon} />
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
