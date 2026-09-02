import { AuthLayout } from "./AuthLayout";

type Props = {
  title: string;
  copy: string;
};

/** Full-viewport boot splash — same chrome as sign-in, not a bare text dump. */
export function PortalBootScreen({ title, copy }: Props) {
  return (
    <AuthLayout showBrand footer={false}>
      <div
        className="login-card login-card--boot login-card--enter"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="login-boot-mark" aria-hidden>
          <span className="cg-spinner cg-spinner--sm login-boot-spinner" />
        </div>
        <div className="login-card-head login-card-head--center">
          <h1>{title}</h1>
          <p>{copy}</p>
        </div>
        <div className="login-boot-bar" aria-hidden>
          <span className="login-boot-bar__fill" />
        </div>
      </div>
    </AuthLayout>
  );
}
