/**
 * In-memory fair-rotation cursors per asset:network scope.
 * Process-local only — restart resets to 0 (acceptable).
 */

/** @type {Map<string, number>} */
const cursors = new Map();

/**
 * @param {string} asset
 * @param {string} network
 */
export function scopeCursorKey(asset, network) {
  return `${String(asset)}:${String(network)}`;
}

/**
 * @param {string} key
 */
export function getScopeCursor(key) {
  return cursors.get(key) ?? 0;
}

/**
 * @param {string} key
 * @param {number} next
 */
export function setScopeCursor(key, next) {
  cursors.set(key, Math.max(0, Math.floor(Number(next) || 0)));
}

/** Test helper. */
export function resetScopeCursors() {
  cursors.clear();
}
