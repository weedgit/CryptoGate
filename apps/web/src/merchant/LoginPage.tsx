import { FormEvent, useState } from "react";
import { ApiError, login } from "./api";

type Props = {
  onSignedIn: () => void;
};

export function LoginPage({ onSignedIn }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onSignedIn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>CryptoGate</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>Merchant portal sign-in</p>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="field-control"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            disabled={loading}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="field-control"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            disabled={loading}
          />
        </div>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
