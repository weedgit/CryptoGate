/**
 * Orderability lamp — single signal: can this network/pair take payments now?
 *
 * Green Open  — enabled, not maintenance, watcher ingest healthy
 * Amber Paused — enabled, but maintenance OR degraded/stub ingest
 * Red Down — enabled, but watcher down / no heartbeat
 * Grey Off — not enabled in catalog
 */

/**
 * @typedef {'open' | 'paused' | 'down' | 'off'} NetworkLampCode
 * @typedef {'ok' | 'warn' | 'bad' | 'muted'} NetworkLampTone
 * @typedef {{
 *   code: NetworkLampCode,
 *   label: string,
 *   tone: NetworkLampTone,
 * }} NetworkLamp
 */

/**
 * @param {{
 *   enabled: boolean,
 *   maintenanceActive?: boolean,
 *   ingestStatus?: string | null,
 * }} input
 * @returns {NetworkLamp}
 */
export function computeOrderabilityLamp(input) {
  if (!input.enabled) {
    return { code: "off", label: "Off", tone: "muted" };
  }

  const ingest = input.ingestStatus ?? "unknown";
  if (ingest === "down" || ingest === "unknown") {
    return { code: "down", label: "Down", tone: "bad" };
  }

  if (
    input.maintenanceActive === true ||
    ingest === "degraded" ||
    ingest === "stub"
  ) {
    return { code: "paused", label: "Paused", tone: "warn" };
  }

  return { code: "open", label: "Open", tone: "ok" };
}
