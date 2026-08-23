/** M1 mock — replace with GET /v1/orders/{id}/payment in M2. */
const mock = {
  payableAmount: "50.00",
  asset: "USDT",
  network: "tron",
  receiveAddress: "TExampleMerchantSettlementAddress0001",
  matchingMode: "B",
  expiresInSeconds: 899,
};

const amountEl = document.getElementById("amount");
const amountCopy = document.getElementById("amount-copy");
const addressEl = document.getElementById("address");
const networkEl = document.getElementById("network");
const expiresEl = document.getElementById("expires");
const exactWarn = document.getElementById("exact-warn");

if (amountEl) amountEl.textContent = `${mock.payableAmount} ${mock.asset}`;
if (amountCopy) amountCopy.textContent = mock.payableAmount;
if (addressEl) addressEl.textContent = mock.receiveAddress;
if (networkEl) {
  networkEl.textContent = `Network: ${mock.network} · Asset: ${mock.asset}`;
}

if (mock.matchingMode === "C" && exactWarn) {
  exactWarn.hidden = false;
}

function tick(remaining) {
  if (!expiresEl) return;
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, "0");
  expiresEl.textContent = `in ${m}:${s}`;
  if (remaining <= 0) {
    expiresEl.textContent = "Expired";
    return;
  }
  setTimeout(() => tick(remaining - 1), 1000);
}

tick(mock.expiresInSeconds);

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-copy");
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    try {
      await navigator.clipboard.writeText(el.textContent.trim());
      btn.textContent = "Copied";
      setTimeout(() => {
        btn.textContent = "Copy";
      }, 1200);
    } catch {
      btn.textContent = "Select text";
    }
  });
});
