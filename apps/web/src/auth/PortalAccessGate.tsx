import { Link } from "react-router-dom";

export type PortalAccessLink = {
  to: string;
  label: string;
  primary?: boolean;
};

type Props = {
  title: string;
  description: string;
  roles: readonly string[];
  links: readonly PortalAccessLink[];
};

export function PortalAccessGate({
  title,
  description,
  roles,
  links,
}: Props) {
  return (
    <div className="login-wrap portal-access-gate-wrap">
      <div className="portal-access-gate" role="alertdialog" aria-labelledby="portal-access-title">
        <div className="portal-access-gate__card">
          <div className="portal-access-gate__head">
            <div className="portal-access-gate__mark" aria-hidden>
              <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                <path
                  d="M24 6 10 12v10c0 8.5 5.8 16.4 14 18 8.2-1.6 14-9.5 14-18V12L24 6Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <path
                  d="M18 24.5 22 28.5l8-8"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.55"
                />
              </svg>
            </div>
            <h1 id="portal-access-title" className="portal-access-gate__title">
              {title}
            </h1>
          </div>
          <p className="portal-access-gate__copy">{description}</p>
          <ul className="portal-access-gate__roles" aria-label="Allowed roles">
            {roles.map((role) => (
              <li key={role}>
                <span className="portal-access-gate__role-pill">{role}</span>
              </li>
            ))}
          </ul>
          <div className="portal-access-gate__actions">
            {links.map((link) =>
              link.primary ? (
                <Link
                  key={link.to}
                  to={link.to}
                  className="btn-primary portal-access-gate__btn"
                >
                  {link.label}
                </Link>
              ) : (
                <Link
                  key={link.to}
                  to={link.to}
                  className="btn-secondary portal-access-gate__btn"
                >
                  {link.label}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
