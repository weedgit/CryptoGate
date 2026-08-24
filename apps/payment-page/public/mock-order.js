/** Prototype — replace with GET /v1/orders/{id}/payment. Do not poll chain. */
const params = new URLSearchParams(location.search);
const state = params.get("state") || "pending";

const networkLabels = {
  tron: "TRON TRC-20",
  ethereum: "Ethereum ERC-20",
};

const mock = {
  merchantName: "Hotel Marrakech — Casablanca",
  payableAmount: params.get("amount") || "245.00",
  asset: params.get("asset") || "USDT",
  network: params.get("network") || "tron",
  networkLabel: "",
  receiveAddress: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
  contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  matchingMode: (params.get("mode") || "B").toUpperCase(),
  memo: params.get("memo") || "",
  expiresInSeconds: (Number(params.get("validity")) || 28) * 60 + 42,
  orderRef: "#CG-2026-0847",
};

mock.networkLabel = networkLabels[mock.network] || mock.network.toUpperCase();

const merchantEl = document.getElementById("merchant");
const amountEl = document.getElementById("amount");
const networkEl = document.getElementById("network");
const addressEl = document.getElementById("address");
const contractEl = document.getElementById("contract");
const expiresEl = document.getElementById("expires");
const exactWarn = document.getElementById("exact-warn");
const netWarn = document.getElementById("net-warn");
const memoWarn = document.getElementById("memo-warn");
const statusEl = document.getElementById("status");
const orderRefEl = document.getElementById("order-ref");
const mainEl = document.querySelector(".pay");

function shortAddr(value) {
  if (value.length <= 28) return value;
  return `${value.slice(0, 28)}...`;
}

if (merchantEl) merchantEl.textContent = mock.merchantName;
if (amountEl) amountEl.textContent = `${mock.payableAmount} ${mock.asset}`;
if (networkEl) networkEl.textContent = mock.networkLabel;
if (addressEl) {
  addressEl.textContent = shortAddr(mock.receiveAddress);
  addressEl.dataset.full = mock.receiveAddress;
}
if (contractEl) {
  contractEl.textContent = shortAddr(mock.contractAddress);
  contractEl.dataset.full = mock.contractAddress;
}
if (netWarn) netWarn.textContent = `Send ONLY on ${mock.networkLabel} network.`;
if (orderRefEl) orderRefEl.textContent = mock.orderRef;
if (mock.matchingMode === "C" && exactWarn) exactWarn.hidden = false;
if ((mock.matchingMode === "D" || mock.memo) && memoWarn) {
  memoWarn.hidden = false;
  memoWarn.textContent = `Include memo: ${mock.memo || "CG-0847"}`;
}
if (mainEl) mainEl.dataset.state = state;

const statusCopy = {
  pending: "Pending Payment",
  verifying: "Verifying",
  confirmed: "Confirmed",
  completed: "Completed",
  expired: "Expired",
  anomaly: "Payment Anomaly",
  failed: "Failed",
  invalid: "Invalid link",
};
if (statusEl) statusEl.textContent = statusCopy[state] || statusCopy.pending;

function tick(remaining) {
  if (!expiresEl) return;
  if (state === "expired") {
    expiresEl.textContent = "This order has expired";
    return;
  }
  if (state === "completed") {
    expiresEl.textContent = "Payment received";
    return;
  }
  if (state === "verifying") {
    expiresEl.textContent = "Waiting for confirmations";
    return;
  }
  if (state === "anomaly" || state === "failed" || state === "invalid") {
    expiresEl.textContent = "Do not send another payment";
    return;
  }
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, "0");
  expiresEl.textContent = `${m}:${s} remaining`;
  if (remaining <= 0) {
    expiresEl.textContent = "Expired";
    if (mainEl) mainEl.dataset.state = "expired";
    if (statusEl) statusEl.textContent = "Expired";
    return;
  }
  setTimeout(() => tick(remaining - 1), 1000);
}

tick(mock.expiresInSeconds);

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.getAttribute("data-copy");
    const el = id ? document.getElementById(id) : null;
    const text = el?.dataset.full || el?.textContent?.trim() || "";
    const restore = btn.getAttribute("aria-label") || "Copy";
    try {
      await navigator.clipboard.writeText(text);
      btn.setAttribute("aria-label", "Copied");
      setTimeout(() => btn.setAttribute("aria-label", restore), 1200);
    } catch {
      btn.setAttribute("aria-label", "Select text to copy");
    }
  });
});
