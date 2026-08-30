/**
 * Orderability lamp — mirrors apps/api network-lamp.mjs (keep rules in sync).
 *
 * Open / Paused / Down / Off — answers “can this network take payments now?”
 */

export type NetworkLampCode = "open" | "paused" | "down" | "off";
export type NetworkLampTone = "ok" | "warn" | "bad" | "muted";

export type NetworkLamp = {
  code: NetworkLampCode;
  label: string;
  tone: NetworkLampTone;
};

export type NetworkLampInput = {
  enabled: boolean;
  maintenanceActive?: boolean;
  ingestStatus?: string | null;
};

export function computeOrderabilityLamp(input: NetworkLampInput): NetworkLamp {
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

/** Sort rank for tables (Open first). */
export const NETWORK_LAMP_SORT_RANK: Record<NetworkLampCode, number> = {
  open: 0,
  paused: 1,
  down: 2,
  off: 3,
};
