/** Live guest pay — poll GET /v1/orders/{id}/payment. Do not poll chain. */
const params = new URLSearchParams(location.search);
const demoState = params.get("state") || "pending";
const apiBase = (window.CRYPTOGATE_API_BASE || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const sessionKey = (id) => `cg-order-${id}`;
const POLL_MS = 5000;

/**
 * Mirrors packages/domain ASSET_NETWORK_REGISTRY for guest UI only
 * (static page cannot import the TS package). Keep USDT+tron in sync.
 */
const ASSET_NETWORK_UI = {
  "USDT:tron": {
    displayNetwork: "TRON TRC-20",
    contractAddress: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    memoSupported: false,
  },
};

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
const amountLabelEl = document.getElementById("amount-label");
const amountEl = document.getElementById("amount");
const amountCopyEl = document.getElementById("amount-copy");
const networkEl = document.getElementById("network");
const addressEl = document.getElementById("address");
const contractEl = document.getElementById("contract");
const expiresEl = document.getElementById("expires");
const exactWarn = document.getElementById("exact-warn");
const netWarn = document.getElementById("net-warn");
const memoWarn = document.getElementById("memo-warn");
const statusEl = document.getElementById("status");
const orderRefEl = document.getElementById("order-ref");
const shareBtn = document.getElementById("share-link");
const mainEl = document.querySelector(".pay");
const qrEl = document.getElementById("qr");
const sourceEl = document.getElementById("source-banner");

function resolveOrderId() {
  const fromQuery = params.get("id");
  if (fromQuery) return fromQuery;
  const match = location.pathname.match(/\/pay\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

const orderId = resolveOrderId();

/** @type {string} */
let shareUrl = "";

function assetNetworkUi(asset, network) {
  return ASSET_NETWORK_UI[`${asset}:${network}`];
}

/**
 * Mode D guest memo UI only when the asset/network supports memo (§2.4).
 * Demo override: ?memoSupported=1
 */
function memoSupportedFor(asset, network) {
  if (params.get("memoSupported") === "1") return true;
  if (params.get("memoSupported") === "0") return false;
  const row = assetNetworkUi(asset, network);
  if (row) return row.memoSupported;
  return false;
}

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

function setSourceBanner(text) {
  if (!sourceEl) return;
  if (!text) {
    sourceEl.hidden = true;
    sourceEl.textContent = "";
    return;
  }
  sourceEl.hidden = false;
  sourceEl.textContent = text;
}

function networkLabelFor(asset, network) {
  const row = assetNetworkUi(asset, network);
  if (row) return row.displayNetwork;
  if (network === "tron") return "TRON TRC-20";
  if (network === "ethereum") return "Ethereum ERC-20";
  return String(network).toUpperCase();
}

function contractFor(asset, network, fromApi) {
  if (fromApi) return fromApi;
  return assetNetworkUi(asset, network)?.contractAddress || "";
}

function demoView() {
  const network = params.get("network") || "tron";
  const amount = params.get("amount") || "245.00";
  const asset = params.get("asset") || "USDT";
  const address = "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2";
  const matchingMode = (params.get("mode") || "B").toUpperCase();
  const memoOrTag = params.get("memo") || "";
  return {
    merchantName: "Hotel Marrakech — Casablanca",
    payableAmount: amount,
    copyAmount: amount,
    asset,
    network,
    networkLabel: networkLabelFor(asset, network),
    receiveAddress: address,
    contractAddress: contractFor(asset, network),
    matchingMode,
    memoOrTag,
    memoSupported: memoSupportedFor(asset, network),
    expiresAt: new Date(
      Date.now() + ((Number(params.get("validity")) || 28) * 60 + 42) * 1000,
    ).toISOString(),
    status: demoState,
    orderNumber: "#CG-2026-0847",
    paymentPageUrl: location.href.split("#")[0],
    qrPayload: `${network}:${address}?amount=${encodeURIComponent(amount)}&asset=${asset}&network=${network}`,
    wrongNetworkWarning: `Send only ${asset} on ${networkLabelFor(asset, network)}. Wrong network may result in lost funds.`,
    payExactAmountWarning:
      matchingMode === "C"
        ? "Send the exact payable amount. A different amount will not match this order."
        : "",
  };
}

function fromPaymentOrder(order) {
  const network = order.network || "tron";
  const asset = order.asset || "USDT";
  const payable = order.payableAmount;
  const amount =
    typeof payable === "object" && payable ? payable.amount : String(payable ?? "");
  const matchingMode = order.matchingMode || "B";
  return {
    merchantName: "Merchant",
    payableAmount: amount,
    copyAmount: amount,
    asset,
    network,
    networkLabel: networkLabelFor(asset, network),
    receiveAddress: order.receiveAddress || "",
    contractAddress: contractFor(asset, network),
    matchingMode,
    memoOrTag: order.memoOrTag || "",
    memoSupported: memoSupportedFor(asset, network),
    expiresAt: order.expiresAt,
    status: order.status || "pending_payment",
    orderNumber: order.orderNumber || order.id,
    paymentPageUrl: `${location.origin}/pay/${encodeURIComponent(order.id || orderId || "")}`,
    qrPayload: `${network}:${order.receiveAddress || ""}?amount=${encodeURIComponent(amount)}&asset=${asset}&network=${network}`,
    wrongNetworkWarning: `Send only ${asset} on ${networkLabelFor(asset, network)}. Wrong network may result in lost funds.`,
    payExactAmountWarning:
      matchingMode === "C"
        ? "Send the exact payable amount. A different amount will not match this order."
        : "",
  };
}

function fromPaymentDetails(d) {
  const network = d.network || "tron";
  const asset = d.asset || "USDT";
  const payable = d.payableAmount;
  const amount =
    d.copyAmount ||
    (typeof payable === "object" && payable ? payable.amount : String(payable ?? ""));
  const matchingMode = d.matchingMode || "B";
  return {
    merchantName: d.merchantName || "Merchant",
    payableAmount: amount,
    copyAmount: d.copyAmount || amount,
    asset,
    network,
    networkLabel: networkLabelFor(asset, network),
    receiveAddress: d.receiveAddress || "",
    contractAddress: contractFor(asset, network, d.contractAddress),
    matchingMode,
    memoOrTag: d.memoOrTag || "",
    memoSupported: memoSupportedFor(asset, network),
    expiresAt: d.expiresAt,
    status: d.status || "pending_payment",
    orderNumber: d.orderNumber,
    paymentPageUrl: d.paymentPageUrl || "",
    wrongNetworkWarning: d.wrongNetworkWarning,
    payExactAmountWarning: d.payExactAmountWarning,
    memoWarning: d.memoWarning,
    qrPayload: d.qrPayload || "",
  };
}

function remainingSeconds(expiresAt) {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

function renderQr(payload) {
  if (!qrEl) return;
  const existing = qrEl.querySelector("canvas.qr-canvas");
  if (!payload) {
    if (existing) existing.remove();
    qrEl.classList.remove("qr-live");
    return;
  }
  const draw = () => {
    let canvas = existing;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "qr-canvas";
      qrEl.appendChild(canvas);
    }
    qrEl.classList.add("qr-live");
    window.QRCode.toCanvas(
      canvas,
      payload,
      { width: 160, margin: 1, color: { dark: "#0b0f14", light: "#ffffff" } },
      () => {},
    );
  };
  if (window.QRCode) draw();
  else {
    qrEl.dataset.qrPayload = payload;
  }
}

function setShareUrl(url) {
  shareUrl = url || "";
  if (!shareBtn) return;
  shareBtn.disabled = !shareUrl;
}

function paint(view) {
  const state = uiState(view.status);
  const mode = String(view.matchingMode || "B").toUpperCase();
  const isModeC = mode === "C" || Boolean(view.payExactAmountWarning);
  const showMemo =
    mode === "D" &&
    view.memoSupported &&
    Boolean(view.memoOrTag || view.memoWarning);

  if (merchantEl) merchantEl.textContent = view.merchantName;
  if (amountLabelEl) {
    amountLabelEl.textContent = isModeC ? "Exact payable" : "Total payable";
  }
  if (amountEl) amountEl.textContent = `${view.payableAmount} ${view.asset}`;
  if (amountCopyEl) {
    amountCopyEl.textContent = view.copyAmount || view.payableAmount;
    amountCopyEl.dataset.full = view.copyAmount || view.payableAmount;
  }
  if (networkEl) networkEl.textContent = view.networkLabel;
  if (addressEl) {
    addressEl.textContent = shortAddr(view.receiveAddress);
    addressEl.dataset.full = view.receiveAddress;
  }
  if (contractEl) {
    const c = view.contractAddress || "";
    contractEl.textContent = shortAddr(c);
    contractEl.dataset.full = c;
  }
  if (netWarn) {
    netWarn.textContent =
      view.wrongNetworkWarning ||
      `Send ONLY on ${view.networkLabel} network.`;
  }
  if (orderRefEl) orderRefEl.textContent = view.orderNumber;
  if (exactWarn) {
    exactWarn.hidden = !isModeC;
    if (isModeC) {
      exactWarn.textContent =
        view.payExactAmountWarning ||
        "Pay exactly the amount shown. Do not round or edit in your wallet.";
    }
  }
  if (memoWarn) {
    memoWarn.hidden = !showMemo;
    if (showMemo) {
      memoWarn.textContent =
        view.memoWarning || `Include memo: ${view.memoOrTag}`;
    }
  }
  if (mainEl) {
    mainEl.dataset.state = state === "pending" ? "pending" : state;
    mainEl.dataset.mode = mode;
  }
  if (statusEl) {
    statusEl.textContent =
      statusCopy[view.status] || statusCopy[state] || statusCopy.pending;
  }
  setShareUrl(
    view.paymentPageUrl ||
      (orderId ? `${location.origin}/pay/${encodeURIComponent(orderId)}` : ""),
  );
  renderQr(view.qrPayload);
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

function paintInvalid() {
  setSourceBanner("");
  setShareUrl("");
  if (mainEl) {
    mainEl.dataset.state = "invalid";
    delete mainEl.dataset.mode;
  }
  if (statusEl) statusEl.textContent = statusCopy.invalid;
  if (expiresEl) expiresEl.textContent = "This payment link is not valid";
  if (exactWarn) exactWarn.hidden = true;
  if (memoWarn) memoWarn.hidden = true;
  renderQr("");
}

async function fetchPaymentDetails(id) {
  const res = await fetch(
    `${apiBase}/v1/orders/${encodeURIComponent(id)}/payment`,
  );
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`payment ${res.status}`);
  return { details: await res.json() };
}

async function loadLiveOrder(id) {
  try {
    const got = await fetchPaymentDetails(id);
    if (got.missing) {
      paintInvalid();
      return;
    }
    if (got.details) {
      setSourceBanner("");
      paint(fromPaymentDetails(got.details));
      return;
    }
  } catch {
    /* Network / CORS — fall back to create snapshot only. */
  }
  try {
    const raw = sessionStorage.getItem(sessionKey(id));
    if (raw) {
      setSourceBanner(
        "Showing create snapshot. Live GET /payment failed (CORS or network). Ask Andrew to allow this origin.",
      );
      paint(fromPaymentOrder(JSON.parse(raw)));
      return;
    }
  } catch {
    /* ignore */
  }
  paintInvalid();
}

if (orderId) {
  loadLiveOrder(orderId);
  window.setInterval(() => loadLiveOrder(orderId), POLL_MS);
} else {
  setSourceBanner("");
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

shareBtn?.addEventListener("click", async () => {
  if (!shareUrl) return;
  const restore = shareBtn.textContent;
  try {
    if (navigator.share) {
      await navigator.share({
        title: "CryptoGate payment",
        text: "Pay this CryptoGate order",
        url: shareUrl,
      });
      return;
    }
    await navigator.clipboard.writeText(shareUrl);
    shareBtn.textContent = "Link copied";
    setTimeout(() => {
      shareBtn.textContent = restore;
    }, 1200);
  } catch {
    shareBtn.textContent = "Copy failed";
    setTimeout(() => {
      shareBtn.textContent = restore;
    }, 1200);
  }
});
