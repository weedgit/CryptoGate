import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "./LoginIcons";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "email" | "password" | "text";
  icon?: "mail" | "lock";
  showToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
  disabled?: boolean;
  autoComplete?: string;
  required?: boolean;
  placeholder?: string;
};

export function AuthField({
  id,
  label,
  value,
  onChange,
  type = "text",
  icon,
  showToggle = false,
  showPassword = false,
  onTogglePassword,
  disabled,
  autoComplete,
  required,
  placeholder,
}: Props) {
  const inputType =
    type === "password" ? (showPassword ? "text" : "password") : type;
  const LeadingIcon = icon === "mail" ? MailIcon : icon === "lock" ? LockIcon : null;

  return (
    <div className="field login-field">
      <label htmlFor={id}>{label}</label>
      <div
        className={`login-input-shell${icon ? " login-input-shell--with-icon" : ""}${showToggle ? " login-input-shell--toggle" : ""}`}
      >
        {LeadingIcon ? (
          <span className="login-input-icon" aria-hidden>
            <LeadingIcon />
          </span>
        ) : null}
        <input
          id={id}
          className="login-field-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={inputType}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        {showToggle ? (
          <button
            type="button"
            className="login-password-toggle"
            onClick={onTogglePassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            disabled={disabled}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>
    </div>
  );
}
