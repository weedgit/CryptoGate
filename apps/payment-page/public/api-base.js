/** Resolve guest pay API origin (production pay-config + legacy alias). */
(function () {
  const raw =
    window.PAYMENTGATE_API_BASE ||
    window.CRYPTOGATE_API_BASE ||
    "";
  window.PAYMENTGATE_API_BASE = String(raw || "http://127.0.0.1:3000").replace(
    /\/$/,
    "",
  );
})();
