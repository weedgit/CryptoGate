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
 * (static page cannot import the TS package). Keep confirmations in sync.
 */
const ASSET_NETWORK_UI = {
  "USDT:tron": {
    displayNetwork: "TRON TRC-20",
    memoSupported: false,
    requiredConfirmations: 19,
  },
  "USDT:tron_nile": {
    displayNetwork: "TRON Nile (testnet)",
    memoSupported: false,
    requiredConfirmations: 19,
  },
  "USDT:ethereum": {
    displayNetwork: "Ethereum ERC-20",
    memoSupported: false,
    requiredConfirmations: 12,
  },
  "USDT:bnb_smart_chain": {
    displayNetwork: "BNB Smart Chain BEP-20",
    memoSupported: false,
    requiredConfirmations: 15,
  },
  "USDT:polygon": {
    displayNetwork: "Polygon PoS",
    memoSupported: false,
    requiredConfirmations: 64,
  },
  "USDT:arbitrum_one": {
    displayNetwork: "Arbitrum One",
    memoSupported: false,
    requiredConfirmations: 12,
  },
  "USDT:solana": {
    displayNetwork: "Solana",
    memoSupported: false,
    requiredConfirmations: 32,
  },
  "USDT:ton": {
    displayNetwork: "TON",
    memoSupported: false,
    requiredConfirmations: 5,
  },
  "USDC:ethereum": {
    displayNetwork: "Ethereum ERC-20",
    memoSupported: false,
    requiredConfirmations: 12,
  },
  "USDC:polygon": {
    displayNetwork: "Polygon PoS",
    memoSupported: false,
    requiredConfirmations: 64,
  },
  "USDC:arbitrum_one": {
    displayNetwork: "Arbitrum One",
    memoSupported: false,
    requiredConfirmations: 12,
  },
  "USDC:base": {
    displayNetwork: "Base",
    memoSupported: false,
    requiredConfirmations: 12,
  },
  "USDC:solana": {
    displayNetwork: "Solana",
    memoSupported: false,
    requiredConfirmations: 32,
  },
  "BTC:bitcoin": {
    displayNetwork: "Bitcoin",
    memoSupported: false,
    requiredConfirmations: 3,
  },
  "ETH:ethereum": {
    displayNetwork: "Ethereum",
    memoSupported: false,
    requiredConfirmations: 12,
  },
  "TRX:tron": {
    displayNetwork: "Tron (native)",
    memoSupported: false,
    requiredConfirmations: 19,
  },
};

const TERMINAL_STATUSES = new Set([
  "completed",
  "confirmed",
  "expired",
  "payment_anomaly",
  "failed",
  "cancelled",
  "invalid",
]);

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
  maintenance: "Network unavailable",
};

const amountLabelEl = document.getElementById("amount-label");
const amountEl = document.getElementById("amount");
const amountValueEl = document.getElementById("amount-value");
const amountAssetEl = document.getElementById("amount-asset");
const amountCopyEl = document.getElementById("amount-copy");
const networkEl = document.getElementById("network");
const assetMarkEl = document.getElementById("asset-mark");
const networkMarkEl = document.getElementById("network-mark");
const addressEl = document.getElementById("address");
const expiresEl = document.getElementById("expires");
const timerCardEl = document.getElementById("timer-card");
const timerLabelEl = document.getElementById("timer-label");
const exactWarn = document.getElementById("exact-warn");
const memoWarn = document.getElementById("memo-warn");
const statusEl = document.getElementById("status");
const orderRefEl = document.getElementById("order-ref");
const confirmTrackEl = document.getElementById("confirm-track");
const confirmCountEl = document.getElementById("confirm-count");
const confirmNoteEl = document.getElementById("confirm-note");
const payFlowEl = document.getElementById("pay-flow");
const payProgressEl = document.getElementById("pay-progress");
const mainEl = document.querySelector(".pay");
const qrEl = document.getElementById("qr");
const qrMarkEl = document.getElementById("qr-mark");
const addressMarkEl = document.getElementById("address-mark");
const sourceEl = document.getElementById("source-banner");
const shareBtn = document.getElementById("share-link");
const qrModeEl = document.getElementById("qr-mode");
const amountCopyBtn = document.querySelector('[data-copy="amount-copy"]');
const addressCopyBtn = document.querySelector('[data-copy="address"]');

/** @type {"with_amount" | "address_only"} */
let qrMode = "address_only";
/** @type {object | null} */
let currentView = null;
/** @type {string} */
let currentUiState = "pending";

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

/** Required confirmations for this asset/network (domain registry), then API override. */
function resolveRequiredConfirmations(asset, network, apiValue) {
  const fromApi = Number(apiValue);
  if (Number.isFinite(fromApi) && fromApi > 0) return Math.floor(fromApi);
  const fromRegistry = assetNetworkUi(asset, network)?.requiredConfirmations;
  if (Number.isFinite(fromRegistry) && fromRegistry > 0) {
    return Math.floor(fromRegistry);
  }
  return 1;
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

/** Prefer full address on screen; CSS ellipsis clips only when the row is too narrow. */
function displayAddress(value) {
  return (value || "").trim();
}

function uiState(status) {
  if (status === "pending_payment" || status === "pending") return "pending";
  if (status === "payment_anomaly") return "anomaly";
  if (status === "cancelled") return "failed";
  return status;
}

function isTerminalStatus(status) {
  const state = uiState(status);
  return TERMINAL_STATUSES.has(state) || TERMINAL_STATUSES.has(status);
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
  if (network === "bnb_smart_chain") return "BNB Smart Chain BEP-20";
  return String(network).toUpperCase();
}

function demoProgress(status, asset, network) {
  const total = resolveRequiredConfirmations(asset, network, null);
  if (status === "completed" || status === "confirmed") {
    return { confirmations: total, requiredConfirmations: total, txHash: "demo" };
  }
  if (status === "verifying") {
    return {
      confirmations: Math.min(2, total),
      requiredConfirmations: total,
      txHash: "demo",
    };
  }
  if (status === "payment_anomaly" || status === "anomaly") {
    return {
      confirmations: Math.min(1, total),
      requiredConfirmations: total,
      txHash: "demo",
    };
  }
  return { confirmations: 0, requiredConfirmations: total, txHash: null };
}

function demoView() {
  const network = params.get("network") || "tron";
  const amount = params.get("amount") || "245.00";
  const asset = params.get("asset") || "USDT";
  const address = "TX7s39gK1p9ZqR5mY8bV2wXn5uH4kP9qR2";
  const matchingMode = (params.get("mode") || "B").toUpperCase();
  const memoOrTag = params.get("memo") || "";
  const progress = demoProgress(demoState, asset, network);
  return {
    merchantName: "Hotel Marrakech — Casablanca",
    payableAmount: amount,
    copyAmount: amount,
    asset,
    network,
    networkLabel: networkLabelFor(asset, network),
    receiveAddress: address,
    matchingMode,
    memoOrTag,
    memoSupported: memoSupportedFor(asset, network),
    expiresAt: new Date(
      Date.now() + ((Number(params.get("validity")) || 28) * 60 + 42) * 1000,
    ).toISOString(),
    status: demoState,
    orderNumber: "#CG-2026-0847",
    paymentPageUrl: location.href.split("#")[0],
    qrPayload: location.href.split("#")[0],
    walletUri: `${network}:${address}?amount=${encodeURIComponent(amount)}&asset=${asset}&network=${network}`,
    wrongNetworkWarning: `Send only ${asset} on ${networkLabelFor(asset, network)}. Wrong network may result in lost funds.`,
    payExactAmountWarning:
      matchingMode === "C"
        ? "Send the exact payable amount. A different amount will not match this order."
        : "",
    confirmations: progress.confirmations,
    requiredConfirmations: progress.requiredConfirmations,
    txHash: progress.txHash,
    createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    confirmedAt:
      demoState === "completed" || demoState === "confirmed"
        ? new Date().toISOString()
        : null,
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
    matchingMode,
    memoOrTag: order.memoOrTag || "",
    memoSupported: memoSupportedFor(asset, network),
    expiresAt: order.expiresAt,
    status: order.status || "pending_payment",
    orderNumber: order.orderNumber || order.id,
    paymentPageUrl: `${location.origin}/pay/${encodeURIComponent(order.id || orderId || "")}`,
    qrPayload: `${location.origin}/pay/${encodeURIComponent(order.id || orderId || "")}`,
    walletUri: `${network}:${order.receiveAddress || ""}?amount=${encodeURIComponent(amount)}&asset=${asset}&network=${network}`,
    wrongNetworkWarning: `Send only ${asset} on ${networkLabelFor(asset, network)}. Wrong network may result in lost funds.`,
    payExactAmountWarning:
      matchingMode === "C"
        ? "Send the exact payable amount. A different amount will not match this order."
        : "",
    confirmations: Number(order.confirmations) || 0,
    requiredConfirmations: resolveRequiredConfirmations(
      asset,
      network,
      order.requiredConfirmations,
    ),
    txHash: order.txHash || null,
    createdAt: order.createdAt || null,
    confirmedAt: order.confirmedAt || null,
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
    anomalyReason: d.anomalyReason,
    qrPayload: d.qrPayload || "",
    walletUri: d.walletUri || "",
    confirmations: Number(d.confirmations) || 0,
    requiredConfirmations: resolveRequiredConfirmations(
      asset,
      network,
      d.requiredConfirmations,
    ),
    txHash: d.txHash || null,
    createdAt: d.createdAt || null,
    confirmedAt: d.confirmedAt || null,
    networkMaintenanceMessage: d.networkMaintenance?.message || null,
  };
}

function remainingSeconds(expiresAt) {
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((t - Date.now()) / 1000));
}

function renderQr(payload, network) {
  if (!qrEl) return;
  const existing = qrEl.querySelector("canvas.qr-img, img.qr-img");

  if (!payload) {
    if (existing) existing.remove();
    qrEl.classList.remove("qr-live");
    renderQrMark(network, false);
    return;
  }

  if (typeof QRCode === "undefined" || typeof QRCode.toCanvas !== "function") {
    qrEl.classList.remove("qr-live");
    renderQrMark(network, false);
    return;
  }

  let canvas = qrEl.querySelector("canvas.qr-img");
  if (existing && existing.tagName === "IMG") existing.remove();
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "qr-img";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Payment QR code");
    qrEl.appendChild(canvas);
  }

  QRCode.toCanvas(
    canvas,
    payload,
    {
      errorCorrectionLevel: "H",
      margin: 1,
      width: 224,
      color: { dark: "#000000", light: "#ffffff" },
    },
    (err) => {
      if (err) {
        console.warn("QR encode failed", err);
        qrEl.classList.remove("qr-live");
        renderQrMark(network, false);
        return;
      }
      qrEl.classList.add("qr-live");
      renderQrMark(network, true);
    },
  );
}

/** Brand glyphs (cryptocurrency-icons style) — white mark on brand tile.
 *  viewBox cropped — source paths include padding for a full-bleed circle. */
const CRYPTO_MARK = {
  tron: {
    bg: "#ef0027",
    title: "Tron",
    svg: `<svg viewBox="4 4 24 24" fill="none" aria-hidden="true"><path fill="#fff" d="M21.932 9.913 7.5 7.257l7.595 19.112 10.583-12.894-3.746-3.562zm-.232 1.17 2.208 2.099-6.038 1.093 3.83-3.192zm-5.142 2.973-6.364-5.278 10.402 1.914-4.038 3.364zm-.453.934-1.038 8.58L9.472 9.487l6.633 5.502zm.96.455 6.687-1.21-7.67 9.343.983-8.133z"/></svg>`,
  },
  ethereum: {
    bg: "#627eea",
    title: "Ethereum",
    svg: `<svg viewBox="4 4 24 24" fill="none" aria-hidden="true"><g fill="#fff" fill-rule="nonzero"><path fill-opacity=".602" d="M16.498 4v8.87l7.497 3.35z"/><path d="M16.498 4 9 16.22l7.498-3.35z"/><path fill-opacity=".602" d="M16.498 21.968v6.027L24 17.616z"/><path d="M16.498 27.995v-6.028L9 17.616z"/><path fill-opacity=".2" d="m16.498 20.573 7.497-4.353-7.497-3.348z"/><path fill-opacity=".602" d="m9 16.22 7.498 4.353v-7.701z"/></g></svg>`,
  },
  bnb_smart_chain: {
    bg: "#f3ba2f",
    title: "BNB Smart Chain",
    svg: `<svg viewBox="4 4 24 24" fill="none" aria-hidden="true"><path fill="#fff" d="M12.116 14.404 16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144 2.26 2.26zM6 16l2.26-2.26L10.52 16l-2.26 2.26L6 16zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003 2.263-2.257zM21.48 16l2.26-2.26L26 16l-2.26 2.26L21.48 16zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706l2.293 2.293z"/></svg>`,
  },
  usdt: {
    bg: "#26a17b",
    title: "USDT",
    svg: `<svg viewBox="4 4 24 24" fill="none" aria-hidden="true"><path fill="#fff" d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658 0-.809 2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118 0 1.044 3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116 0-1.043-3.301-1.914-7.694-2.117"/></svg>`,
  },
};

function networkMarkTileHtml(network, tileClass) {
  const n = String(network || "").toLowerCase();
  const key = n === "tron_nile" ? "tron" : n;
  const mark = CRYPTO_MARK[key];
  if (mark) {
    return `<span class="${tileClass}" style="background:${mark.bg}" title="${mark.title}">${mark.svg}</span>`;
  }
  const letter = n ? n.slice(0, 1).toUpperCase() : "?";
  return `<span class="${tileClass} ${tileClass}--fallback" title="${n || "network"}">${letter}</span>`;
}

function assetMarkTileHtml(asset, tileClass) {
  const a = String(asset || "").toUpperCase();
  const mark = a === "USDT" ? CRYPTO_MARK.usdt : null;
  if (mark) {
    return `<span class="${tileClass}" style="background:${mark.bg}" title="${mark.title}">${mark.svg}</span>`;
  }
  return `<span class="${tileClass} ${tileClass}--fallback" title="${a || "asset"}">${(a || "?").slice(0, 1)}</span>`;
}

function qrMarkHtml(network) {
  return networkMarkTileHtml(network, "qr-mark__tile");
}

function addressMarkHtml(network) {
  return networkMarkTileHtml(network, "address-row__tile");
}

function renderAddressMark(network) {
  if (!addressMarkEl) return;
  addressMarkEl.innerHTML = addressMarkHtml(network);
}

function renderAssetMark(asset) {
  if (!assetMarkEl) return;
  assetMarkEl.innerHTML = assetMarkTileHtml(asset, "amount-asset-mark__tile");
}

function renderNetworkPillMark(network) {
  if (!networkMarkEl) return;
  networkMarkEl.innerHTML = networkMarkTileHtml(network, "network-pill__tile");
}

function renderQrMark(network, visible) {
  if (!qrMarkEl) return;
  if (!visible) {
    qrMarkEl.hidden = true;
    qrMarkEl.innerHTML = "";
    return;
  }
  qrMarkEl.hidden = false;
  qrMarkEl.innerHTML = qrMarkHtml(network);
}

function setShareUrl(url) {
  shareUrl = url || "";
  if (!shareBtn) return;
  shareBtn.disabled = !shareUrl;
}

/**
 * Prefer HTTPS pay page so camera scan shows amount + asset.
 * Falls back to API qrPayload, then current page.
 */
function resolvePayPageQr(view) {
  const page = String(view.paymentPageUrl || "").trim();
  const qr = String(view.qrPayload || "").trim();
  if (page && /^https?:\/\//i.test(page)) return page;
  if (qr && /^https?:\/\//i.test(qr)) return qr;
  if (orderId) {
    return `${location.origin}/pay/${encodeURIComponent(orderId)}`;
  }
  return qr || page || location.href.split("#")[0];
}

/**
 * @param {object} view
 * @param {"with_amount" | "address_only"} mode
 */
function resolveQrPayload(view, mode) {
  if (mode === "address_only") {
    return String(view.receiveAddress || "").trim();
  }
  const wallet = String(view.walletUri || "").trim();
  // Prefer pay-page URL (amount visible after camera scan). walletUri is amount-in-URI.
  return resolvePayPageQr(view) || wallet;
}

function syncQrModeUi() {
  if (!qrModeEl) return;
  for (const btn of qrModeEl.querySelectorAll("[data-qr-mode]")) {
    const active = btn.getAttribute("data-qr-mode") === qrMode;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

function refreshQrFromMode() {
  if (!currentView) return;
  const payload = resolveQrPayload(currentView, qrMode);
  renderQr(payload, currentView.network);
  if (qrEl) {
    qrEl.setAttribute(
      "aria-label",
      qrMode === "address_only"
        ? "Receive address QR code"
        : "Payment page QR code with amount",
    );
  }
}

function setQrModeVisible(state) {
  if (!qrModeEl) return;
  const hide =
    state === "expired" ||
    state === "completed" ||
    state === "confirmed" ||
    state === "failed" ||
    state === "anomaly" ||
    state === "invalid";
  qrModeEl.hidden = hide;
}

function flowStepIndex(status, hasTx) {
  const state = uiState(status);
  if (state === "completed" || state === "confirmed") return 3;
  if (state === "verifying") return 2;
  if (hasTx) return 1;
  return 0;
}

function confirmationEtaLabel(network, total) {
  const n = String(network || "").toLowerCase();
  if (n === "tron" || n === "tron_nile") {
    const secs = Math.max(3, total * 3);
    return secs < 60
      ? `~${secs}s on TRON`
      : `~${Math.ceil(secs / 60)} min on TRON`;
  }
  if (n === "ethereum" || n === "arbitrum_one" || n === "base") {
    return `~${Math.max(1, Math.ceil((total * 12) / 60))} min on ${n === "ethereum" ? "Ethereum" : "EVM"}`;
  }
  if (n === "bitcoin") return `~${total * 10} min on Bitcoin`;
  return "network confirmations in progress";
}

function confirmationNote(state, filled, total, network) {
  if (state === "completed" || state === "confirmed") {
    return "Payment confirmed on-chain";
  }
  if (state === "verifying") {
    const eta = confirmationEtaLabel(network, total);
    const closeHint = " You can close this page.";
    return filled > 0
      ? `Confirming · ${filled} of ${total} blocks (${eta}).${closeHint}`
      : `Transaction detected · waiting for confirmations (${eta}).${closeHint}`;
  }
  if (state === "anomaly") {
    return "Payment seen but needs merchant review";
  }
  if (state === "expired" || state === "failed" || state === "invalid") {
    return "No further confirmations for this order";
  }
  return "Awaiting your payment";
}

function paintConfirmations(view, state) {
  if (!confirmTrackEl || !confirmCountEl || !confirmNoteEl) return;
  const total = resolveRequiredConfirmations(
    view.asset,
    view.network,
    view.requiredConfirmations,
  );
  let filled = Math.max(0, Number(view.confirmations) || 0);
  if (state === "completed" || state === "confirmed") filled = total;
  if (state === "pending" && !view.txHash) filled = 0;
  filled = Math.min(filled, total);

  confirmCountEl.textContent = `${filled} / ${total}`;
  confirmNoteEl.textContent = confirmationNote(state, filled, total, view.network);
  confirmTrackEl.setAttribute("aria-valuenow", String(filled));
  confirmTrackEl.setAttribute("aria-valuemax", String(total));
  confirmTrackEl.setAttribute(
    "aria-label",
    `${filled} of ${total} block confirmations`,
  );
  confirmTrackEl.classList.toggle("is-complete", filled >= total && total > 0);
  confirmTrackEl.classList.toggle(
    "is-active",
    state === "verifying" && filled < total,
  );
  confirmTrackEl.classList.toggle(
    "is-idle",
    state === "pending" && filled === 0,
  );
  confirmTrackEl.dataset.total = String(total);
  confirmTrackEl.style.removeProperty("--fill-pct");

  const segCount = total > 32 ? 32 : total;
  const filledSegs =
    total <= 32 ? filled : Math.round((filled / total) * segCount);
  confirmTrackEl.innerHTML = "";
  for (let i = 0; i < segCount; i += 1) {
    const seg = document.createElement("span");
    seg.className =
      "pay-confirm-track__seg" + (i < filledSegs ? " is-filled" : "");
    if (state === "verifying" && i === filledSegs && filledSegs < segCount) {
      seg.classList.add("is-next");
    }
    const t = segCount > 1 ? i / (segCount - 1) : 0;
    seg.style.setProperty("--i", String(i));
    seg.style.setProperty("--fill-t", String(t));
    confirmTrackEl.appendChild(seg);
  }
}

function paintFlow(view, state) {
  if (!payFlowEl) return;
  const current = flowStepIndex(view.status, Boolean(view.txHash));
  const items = payFlowEl.querySelectorAll(":scope > li");
  items.forEach((li, index) => {
    li.classList.remove("is-reached", "is-current", "is-ahead");
    if (index < current) li.classList.add("is-reached");
    else if (index === current) li.classList.add("is-reached", "is-current");
    else li.classList.add("is-ahead");
  });
  payFlowEl.classList.toggle("is-flowing", state === "verifying");
  payFlowEl.classList.toggle(
    "is-done",
    state === "completed" || state === "confirmed",
  );
  payFlowEl.setAttribute("aria-label", `Payment step ${current + 1} of 4`);
}

function paintProgress(view) {
  if (!payProgressEl) return;
  const state = uiState(view.status);
  paintConfirmations(view, state);
  paintFlow(view, state);
  payProgressEl.dataset.state = state;
}

function paint(view) {
  const state = uiState(view.status);
  const mode = String(view.matchingMode || "B").toUpperCase();
  const isModeC = mode === "C" || Boolean(view.payExactAmountWarning);
  const showMemo =
    mode === "D" &&
    view.memoSupported &&
    Boolean(view.memoOrTag || view.memoWarning);

  if (amountLabelEl) {
    amountLabelEl.textContent = isModeC ? "Exact payable" : "Total payable";
  }
  if (view.merchantName) {
    document.title = `Pay · ${view.merchantName}`;
  }
  if (amountValueEl) amountValueEl.textContent = view.payableAmount;
  if (amountAssetEl) amountAssetEl.textContent = view.asset;
  if (amountEl) {
    amountEl.setAttribute(
      "aria-label",
      `${view.payableAmount} ${view.asset}`,
    );
  }
  if (amountCopyEl) {
    amountCopyEl.textContent = view.copyAmount || view.payableAmount;
    amountCopyEl.dataset.full = view.copyAmount || view.payableAmount;
  }
  if (amountCopyBtn) {
    amountCopyBtn.dataset.copyValue = view.copyAmount || view.payableAmount || "";
  }
  if (networkEl) networkEl.textContent = view.networkLabel;
  renderAssetMark(view.asset);
  renderNetworkPillMark(view.network);
  if (addressEl) {
    const full = displayAddress(view.receiveAddress);
    addressEl.textContent = full || "—";
    addressEl.dataset.full = full;
    addressEl.title = full;
  }
  if (addressCopyBtn) {
    addressCopyBtn.dataset.copyValue = view.receiveAddress || "";
  }
  renderAddressMark(view.network);
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
    const base =
      statusCopy[view.status] || statusCopy[state] || statusCopy.pending;
    statusEl.textContent =
      state === "anomaly" && view.anomalyReason
        ? `${base} · ${String(view.anomalyReason).replace(/_/g, " ")}`
        : base;
  }
  if (mainEl) {
    mainEl.dataset.pollState = state;
  }
  setShareUrl(
    view.paymentPageUrl ||
      (orderId ? `${location.origin}/pay/${encodeURIComponent(orderId)}` : ""),
  );
  currentView = {
    ...view,
    paymentPageUrl: shareUrl || view.paymentPageUrl,
  };
  currentUiState = state;
  syncQrModeUi();
  setQrModeVisible(state);
  refreshQrFromMode();
  paintProgress(view);
  tick(remainingSeconds(view.expiresAt), state);
}

let tickTimer = 0;
function setTimerTone(remaining, state) {
  if (!expiresEl) return;
  expiresEl.classList.remove(
    "countdown--warn",
    "countdown--critical",
    "countdown--ok",
  );
  if (timerCardEl) {
    timerCardEl.classList.remove(
      "timer-card--warn",
      "timer-card--critical",
      "timer-card--ok",
      "timer-card--idle",
    );
  }
  if (state === "completed" || state === "confirmed") {
    expiresEl.classList.add("countdown--ok");
    timerCardEl?.classList.add("timer-card--ok");
    return;
  }
  if (state === "verifying") {
    expiresEl.classList.add("countdown--warn");
    timerCardEl?.classList.add("timer-card--warn");
    return;
  }
  if (
    state === "expired" ||
    state === "anomaly" ||
    state === "failed" ||
    state === "invalid"
  ) {
    timerCardEl?.classList.add("timer-card--idle");
    return;
  }
  if (remaining > 0 && remaining <= 10) {
    expiresEl.classList.add("countdown--critical");
    timerCardEl?.classList.add("timer-card--critical");
  } else if (remaining > 10 && remaining <= 60) {
    expiresEl.classList.add("countdown--warn");
    timerCardEl?.classList.add("timer-card--warn");
  }
}

function tick(remaining, state) {
  if (!expiresEl) return;
  window.clearTimeout(tickTimer);
  window.clearTimeout(window.__cgPayTick);
  if (state === "expired") {
    if (timerLabelEl) timerLabelEl.textContent = "Status";
    expiresEl.textContent = "Expired";
    setTimerTone(0, state);
    return;
  }
  if (state === "completed" || state === "confirmed") {
    if (timerLabelEl) timerLabelEl.textContent = "Status";
    expiresEl.textContent = "Received";
    setTimerTone(0, state);
    return;
  }
  if (state === "verifying") {
    if (timerLabelEl) timerLabelEl.textContent = "On-chain";
    expiresEl.textContent = "Confirming";
    setTimerTone(0, state);
    return;
  }
  if (state === "anomaly" || state === "failed" || state === "invalid") {
    if (timerLabelEl) timerLabelEl.textContent = "Status";
    expiresEl.textContent = state === "anomaly" ? "Review" : "Closed";
    setTimerTone(0, state);
    return;
  }
  if (timerLabelEl) timerLabelEl.textContent = "Time remaining";
  const m = Math.floor(remaining / 60);
  const s = String(remaining % 60).padStart(2, "0");
  expiresEl.textContent = `${m}:${s}`;
  setTimerTone(remaining, state);
  if (remaining <= 0) {
    if (timerLabelEl) timerLabelEl.textContent = "Status";
    expiresEl.textContent = "Expired";
    if (mainEl) mainEl.dataset.state = "expired";
    if (statusEl) statusEl.textContent = statusCopy.expired;
    setTimerTone(0, "expired");
    return;
  }
  tickTimer = window.setTimeout(() => tick(remaining - 1, state), 1000);
  window.__cgPayTick = tickTimer;
}

function paintInvalid() {
  setSourceBanner("");
  setShareUrl("");
  currentView = null;
  if (mainEl) {
    mainEl.dataset.state = "invalid";
    delete mainEl.dataset.mode;
  }
  if (statusEl) statusEl.textContent = statusCopy.invalid;
  if (timerLabelEl) timerLabelEl.textContent = "Status";
  if (expiresEl) expiresEl.textContent = "Invalid";
  setTimerTone(0, "invalid");
  if (exactWarn) exactWarn.hidden = true;
  if (memoWarn) memoWarn.hidden = true;
  setQrModeVisible("invalid");
  renderQr("", "");
}

function paintMaintenance(message) {
  setSourceBanner("");
  setShareUrl("");
  currentView = null;
  if (mainEl) {
    mainEl.dataset.state = "maintenance";
    delete mainEl.dataset.mode;
  }
  if (statusEl) statusEl.textContent = statusCopy.maintenance;
  if (timerLabelEl) timerLabelEl.textContent = "Status";
  if (expiresEl) expiresEl.textContent = "Paused";
  if (confirmNoteEl) {
    confirmNoteEl.textContent =
      message || "This network is temporarily unavailable.";
  }
  setTimerTone(0, "maintenance");
  if (exactWarn) exactWarn.hidden = true;
  if (memoWarn) memoWarn.hidden = true;
  setQrModeVisible("invalid");
  renderQr("", "");
}

async function fetchPaymentDetails(id) {
  const res = await fetch(
    `${apiBase}/v1/orders/${encodeURIComponent(id)}/payment`,
  );
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(`payment ${res.status}`);
  return { details: await res.json() };
}

let pollTimer = 0;

function stopPolling() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = 0;
  }
}

async function loadLiveOrder(id) {
  try {
    const got = await fetchPaymentDetails(id);
    if (got.missing) {
      stopPolling();
      paintInvalid();
      return;
    }
    if (got.details) {
      if (got.details.networkMaintenance) {
        stopPolling();
        paintMaintenance(got.details.networkMaintenance.message);
        return;
      }
      setSourceBanner("");
      const view = fromPaymentDetails(got.details);
      paint(view);
      if (isTerminalStatus(view.status)) stopPolling();
      return;
    }
  } catch {
    /* Network / CORS — fall back to create snapshot only. */
  }
  try {
    const raw = sessionStorage.getItem(sessionKey(id));
    if (raw) {
      setSourceBanner(
        "Showing create snapshot. Live GET /payment failed — check CORS_ALLOWED_ORIGINS includes this page’s exact Origin (localhost vs 127.0.0.1).",
      );
      const view = fromPaymentOrder(JSON.parse(raw));
      paint(view);
      if (isTerminalStatus(view.status)) stopPolling();
      return;
    }
  } catch {
    /* ignore */
  }
  stopPolling();
  paintInvalid();
}

if (orderId) {
  loadLiveOrder(orderId);
  pollTimer = window.setInterval(() => loadLiveOrder(orderId), POLL_MS);
} else {
  setSourceBanner("");
  paint(demoView());
}

document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    const id = btn.getAttribute("data-copy");
    const el = id ? document.getElementById(id) : null;
    const text =
      btn.dataset.copyValue ||
      el?.dataset.full ||
      el?.textContent?.trim() ||
      "";
    const restore = btn.getAttribute("aria-label") || "Copy";
    const ok = await copyText(text);
    if (ok) {
      setCopyButtonVisual(btn, "copied");
      btn.setAttribute("aria-label", "Copied");
      window.setTimeout(() => {
        setCopyButtonVisual(btn, "idle");
        btn.setAttribute("aria-label", restore);
      }, 1400);
      return;
    }
    setCopyButtonVisual(btn, "failed");
    btn.setAttribute("aria-label", "Copy failed");
    window.setTimeout(() => {
      setCopyButtonVisual(btn, "idle");
      btn.setAttribute("aria-label", restore);
    }, 1400);
  });
});

function setCopyButtonVisual(btn, state) {
  const copyIcon = btn.querySelector(".icon-btn__icon--copy");
  const checkIcon = btn.querySelector(".icon-btn__icon--check");
  btn.classList.remove("is-copied", "is-copy-failed");
  if (state === "copied") {
    btn.classList.add("is-copied");
    copyIcon?.setAttribute("hidden", "");
    checkIcon?.removeAttribute("hidden");
    return;
  }
  if (state === "failed") {
    btn.classList.add("is-copy-failed");
  }
  copyIcon?.removeAttribute("hidden");
  checkIcon?.setAttribute("hidden", "");
}

async function copyText(text) {
  const value = String(text || "").trim();
  if (!value) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fall through to execCommand */
  }

  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.focus();
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch {
    return false;
  }
}

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
    const ok = await copyText(shareUrl);
    shareBtn.textContent = ok ? "Link copied" : "Copy failed";
    window.setTimeout(() => {
      shareBtn.textContent = restore;
    }, 1200);
  } catch {
    shareBtn.textContent = "Copy failed";
    window.setTimeout(() => {
      shareBtn.textContent = restore;
    }, 1200);
  }
});

qrModeEl?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-qr-mode]");
  if (!btn || !qrModeEl.contains(btn)) return;
  const next = btn.getAttribute("data-qr-mode");
  if (next !== "with_amount" && next !== "address_only") return;
  if (next === qrMode) return;
  qrMode = next;
  syncQrModeUi();
  refreshQrFromMode();
});
