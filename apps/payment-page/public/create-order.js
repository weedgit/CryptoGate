/** POST /v1/orders (Andrew stub). Needs a merchant/cashier session cookie. */
const apiBase = (window.CRYPTOGATE_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");

const form = document.querySelector("form");
const errorEl = document.getElementById("form-error");

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (errorEl) errorEl.hidden = true;
  const data = new FormData(form);
  const minutes = Number(data.get("validity")) || 15;
  const orgId = String(data.get("orgId") || "").trim();
  const body = {
    amount: String(data.get("amount") || "").trim(),
    asset: String(data.get("asset") || "USDT"),
    network: String(data.get("network") || "tron"),
    validitySeconds: Math.max(60, Math.round(minutes * 60)),
  };
  if (orgId) body.orgId = orgId;

  let res;
  try {
    res = await fetch(`${apiBase}/v1/orders`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
  } catch {
    showError(
      "Cannot reach API (CORS or server down). Log in on the API origin, or ask Andrew to allow this page origin.",
    );
    return;
  }

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    showError(payload.message || `Create failed (${res.status})`);
    return;
  }

  try {
    sessionStorage.setItem(`cg-order-${payload.id}`, JSON.stringify(payload));
  } catch {
    /* private mode */
  }
  location.href = `/pay/${encodeURIComponent(payload.id)}`;
});

function showError(message) {
  if (!errorEl) return;
  errorEl.hidden = false;
  errorEl.textContent = message;
}
