export const PASSWORD_MIN_LENGTH = 12;

export type PasswordPolicyState = {
  hasLength: boolean;
  hasMixedCase: boolean;
  hasNumber: boolean;
  valid: boolean;
};

export function evaluatePasswordPolicy(password: string): PasswordPolicyState {
  const hasLength = password.length >= PASSWORD_MIN_LENGTH;
  const hasMixedCase = /[a-z]/.test(password) && /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  return {
    hasLength,
    hasMixedCase,
    hasNumber,
    valid: hasLength && hasMixedCase && hasNumber,
  };
}

export function passwordPolicyLabel(): string {
  return `${PASSWORD_MIN_LENGTH}+ chars · mixed case · number`;
}
export function formatManualSecret(secret: string): string {
  const compact = secret.replace(/\s+/g, "").toUpperCase();
  return compact.match(/.{1,4}/g)?.join(" ") ?? compact;
}
