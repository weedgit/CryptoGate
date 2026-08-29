import { Link } from "react-router-dom";
import { AuthLayout } from "../auth/AuthLayout";
import { LoginBrandHeader } from "../auth/LoginBrandHeader";
import "./marketing.css";

const PORTALS = [
  {
    to: "/merchant",
    label: "Merchant portal",
    description: "Owners, administrators, cashiers — payment orders & settlement",
  },
  {
    to: "/agent",
    label: "Agent portal",
    description: "Channel partners — merchants, commissions, subtree volume",
  },
  {
    to: "/platform",
    label: "Platform portal",
    description: "CryptoGate operators — tiers, billing, compliance",
  },
] as const;

export function SignInHubPage() {
  return (
    <div className="signin-hub-wrap">
      <AuthLayout footer={false}>
        <div className="signin-hub-card">
          <LoginBrandHeader />
          <div>
            <h1>Sign in</h1>
            <p>Choose the portal for your account. Guest pay links do not require sign-in.</p>
          </div>
          <ul className="signin-hub-portals">
            {PORTALS.map((portal) => (
              <li key={portal.to}>
                <Link className="signin-hub-portal" to={portal.to}>
                  <span className="signin-hub-portal__label">{portal.label}</span>
                  <span className="signin-hub-portal__desc">{portal.description}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="signin-hub-back">
            <Link to="/">← Back to CryptoGate home</Link>
          </p>
        </div>
      </AuthLayout>
    </div>
  );
}
