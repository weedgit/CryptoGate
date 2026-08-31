import { GateLogoMark } from "./GateLogoMark";

export function LoginBrandHeader() {
  return (
    <div className="login-brand">
      <GateLogoMark size={36} className="login-logo-mark-svg" />
      <span className="login-brand-name">CryptoGate</span>
    </div>
  );
}
