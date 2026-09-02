/** Local API origin. Guest pay must not poll chain — only this host. */
window.PAYMENTGATE_API_BASE = "http://127.0.0.1:3000";

/**
 * Tip: open the pay page with the same hostname listed in API CORS_ALLOWED_ORIGINS
 * (http://localhost:5173 and/or http://127.0.0.1:5173). Origin must match exactly.
 */
