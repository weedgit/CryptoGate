/** Prototype — GET /v1/orders/{id}/payment when Andrew lands M2-13. Do not poll chain. */
const params = new URLSearchParams(location.search);
const demoState = params.get("state") || "pending";
const orderId = params.get("id");
const apiBase = (window.CRYPTOGATE_API_BASE || "http://127.0.0.1:3000").replace(/\/$/, "");
const sessionKey = (id) => `cg-order-${id}`;

const networkLabels = {
  tron: "TRON TRC-20",
  ethereum: "Ethereum ERC-20",
};

const USDT_TRON_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const statusCopy = {
  pending_payment: "Pending Payment",
  pending: "Pending Payment",
  verifying: "Verifying",
  confirmed: "Confirmed",
  completed: "Completed",
  expired: "Expired",
  payment_anomaly: "Payment Anomaly",
  anomaly: "Payment Anomaly",
  failed: "Failed",
  cancelled: "Failed",
  invalid: "Invalid link",
};

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
  if (!value || value.length <= 28) return value || "";
  return `${value.slice(0, 28)}...`;
}

function uiState(status) {
  if (status === "pending_payment" || status === "pending") return "pending";
  if (status === "payment_anomaly") return "anomaly";
  if (status === "cancelled") return "failed";
  return status;
}

function demoView() {
  const network = params.get("network") || "tron";
  return {
    merchantName: "Hotel Marrakech — Casablanca",
    payableAmount: params.get("amount") || "245.00",
    asset: params.get("asset") || "USDT",
    network,
    networkLabel: networkLabels[network] || network.toUpperCase(),
    receiveAddress: "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2",
    contractAddress: USDT_TRON_CONTRACT,
    matchingMode: (params.get("mode") || "B").toUpperCase(),
    memoOrTag: params.get("memo") || "",
    expiresAt: new Date(Date.now() + ((Number(params.get("validity")) || 28) * 60 + 42) * 1000).toISOString(),
    status: demoState,
    orderNumber: "#CG-2026-0847",
  };
}

function fromPaymentOrder(order) {
  const network = order.network || "tron";
  const payable = order.payableAmount;
  const amount = typeof payable === "object" && payable ? payable.amount : String(payable ?? "");
  return {
    merchantName: "Merchant",
    payableAmount: amount,
    asset: order.asset || "USDT",
    network,
    networkLabel: networkLabels[network] || String(network).toUpperCase(),
    receiveAddress: order.receiveAddress || "",
    contractAddress: network === "tron" ? USDT_TRON_CONTRACT : "",
    matchingMode: order.matchingMode || "B",
    memoOrTag: order.memoOrTag || "",
    expiresAt: order.expiresAt,
    status: order.status || "pending_payment",
    orderNumber: order.orderNumber || order.id,
  };
}

function fromPaymentDetails(d) {
  const network = d.network || "tron";
  const payable = d.payableAmount;
  const amount =
    d.copyAmount ||
    (typeof payable === "object" && payable ? payable.amount : String(payable ?? ""));
  return {
    merchantName: d.merchantName || "Merchant",
    payableAmount: amount,
    asset: d.asset || "USDT",
    network,
    networkLabel: networkLabels[network] || String(network).toUpperCase(),
    receiveAddress: d.receiveAddress || "",
    contractAddress: d.contractAddress || (network === "tron" ? USDT_TRON_CONTRACT : ""),
    matchingMode: d.matchingMode || "B",
    memoOrTag: d.memoOrTag || "",
    expiresAt: d.expiresAt,
    status: d.status || "pending_payment",
    orderNumber: d.orderNumber,
    wrongNetworkWarning: d.wrongNetworkWarning,
    payExactAmountWarning: d.payExactAmountWarning,
    memoWarning: d.memoWarning,
  };
}

function remainingSeconds(expiresAt) {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

function paint(view) {
  const state = uiState(view.status);
  if (merchantEl) merchantEl.textContent = view.merchantName;
  if (amountEl) amountEl.textContent = `${view.payableAmount} ${view.asset}`;
  if (networkEl) networkEl.textContent = view.networkLabel;
  if (addressEl) {
    addressEl.textContent = shortAddr(view.receiveAddress);
    addressEl.dataset.full = view.receiveAddress;
  }
  if (contractEl) {
    contractEl.textContent = shortAddr(view.contractAddress);
    contractEl.dataset.full = view.contractAddress;
  }
  if (netWarn) {
    netWarn.textContent =
      view.wrongNetworkWarning || `Send ONLY on ${view.networkLabel} network.`;
  }
  if (orderRefEl) orderRefEl.textContent = view.orderNumber;
  if (exactWarn) {
    exactWarn.hidden = !(view.matchingMode === "C" || view.payExactAmountWarning);
    if (view.payExactAmountWarning) exactWarn.textContent = view.payExactAmountWarning;
  }
  if (memoWarn) {
    const show = Boolean(view.matchingMode === "D" || view.memoOrTag || view.memoWarning);
    memoWarn.hidden = !show;
    if (show) {
      memoWarn.textContent =
        view.memoWarning || `Include memo: ${view.memoOrTag || "CG-0847"}`;
    }
  }
  if (mainEl) mainEl.dataset.state = state === "pending" ? "pending" : state;
  if (statusEl) statusEl.textContent = statusCopy[view.status] || statusCopy[state] || statusCopy.pending;
  tick(remainingSeconds(view.expiresAt), state);
}

let tickTimer = 0;
function tick(remaining, state) {
  if (!expiresEl) return;
  window.clearTimeout(tickTimer);
  if (state === "expired") {
    expiresEl.textContent = "This order has expired";
    return;
  }
  if (state === "completed" || state === "confirmed") {
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
  tickTimer = window.setTimeout(() => tick(remaining - 1, state), 1000);
}

async function fetchPaymentDetails(id) {
  const res = await fetch(`${apiBase}/v1/orders/${encodeURIComponent(id)}/payment`);
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`payment ${res.status}`);
  return { details: await res.json() };
}

async function loadLiveOrder(id) {
  try {
    const got = await fetchPaymentDetails(id);
    if (got.details) {
      paint(fromPaymentDetails(got.details));
      return;
    }
  } catch {
    /* CORS or GET /payment not on API yet (M2-13). */
  }
  try {
    const raw = sessionStorage.getItem(sessionKey(id));
    if (raw) {
      paint(fromPaymentOrder(JSON.parse(raw)));
      return;
    }
  } catch {
    /* ignore */
  }
  if (mainEl) mainEl.dataset.state = "invalid";
  if (statusEl) statusEl.textContent = statusCopy.invalid;
  if (expiresEl) expiresEl.textContent = "This payment link is not valid";
}

if (orderId) {
  loadLiveOrder(orderId);
  window.setInterval(() => loadLiveOrder(orderId), 5000);
} else {
  paint(demoView());
}

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
