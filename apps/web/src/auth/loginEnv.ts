const REMEMBER_EMAIL_KEY = "paymentgate.rememberEmail";

export function loadRememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

export function persistRememberedEmail(email: string, remember: boolean): void {
  try {
    if (remember && email.trim()) {
      localStorage.setItem(REMEMBER_EMAIL_KEY, email.trim());
      return;
    }
    localStorage.removeItem(REMEMBER_EMAIL_KEY);
  } catch {
    // ignore storage failures
  }
}

export function hadRememberedEmail(): boolean {
  return loadRememberedEmail().length > 0;
}
