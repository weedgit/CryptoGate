import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "./apiCore";

export type ActiveNetworkMaintenance = {
  network: string;
  message: string | null;
  startedAt: string | null;
  endsAt: string | null;
};

export type NetworkOrderabilityLamp = {
  code: "open" | "paused" | "down" | "off" | "checking";
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
};

export type NetworksStatus = {
  chainEnv: string;
  checkedAt: string;
  items: {
    network: string;
    title: string;
    lamp: NetworkOrderabilityLamp;
    maintenance: { active: boolean; message: string | null };
    ingestStatus: string;
    pairs: {
      asset: string;
      enabled: boolean;
      lamp: NetworkOrderabilityLamp;
      displayNetwork: string;
    }[];
  }[];
};

export type MerchantNetworkRailItem = {
  network: string;
  title: string;
  lamp: NetworkOrderabilityLamp;
  primaryAsset: string | null;
  minAmount: string | null;
  platformFloorConfirmations: number;
  merchantConfirmations: number | null;
  effectiveConfirmations: number;
  pairs: {
    asset: string;
    displayNetwork: string;
    lamp: NetworkOrderabilityLamp;
    minAmount: string;
    platformConfirmations: number;
    effectiveConfirmations: number;
  }[];
};

export async function getNetworksStatus(): Promise<NetworksStatus> {
  const res = await apiFetch(`${API_BASE}/networks/status`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as NetworksStatus;
}

export async function listActiveNetworkMaintenance(): Promise<{
  items: ActiveNetworkMaintenance[];
  checkedAt: string;
}> {
  const res = await apiFetch(`${API_BASE}/network-maintenance`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    items: ActiveNetworkMaintenance[];
    checkedAt: string;
  };
}

export async function getMerchantNetworkRails(
  orgId: string,
): Promise<{
  orgId: string;
  checkedAt: string;
  items: MerchantNetworkRailItem[];
}> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/network-rails`,
    {
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    orgId: string;
    checkedAt: string;
    items: MerchantNetworkRailItem[];
  };
}

export async function putMerchantNetworkRailSettings(
  orgId: string,
  network: string,
  body: { requiredConfirmations: number | null },
): Promise<{
  orgId: string;
  network: string;
  platformFloorConfirmations: number;
  merchantConfirmations: number | null;
  effectiveConfirmations: number;
  updatedAt: string;
}> {
  const res = await apiFetch(
    `${API_BASE}/orgs/${encodeURIComponent(orgId)}/networks/${encodeURIComponent(network)}/rail-settings`,
    {
      method: "PUT",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) await parseError(res);
  return (await res.json()) as {
    orgId: string;
    network: string;
    platformFloorConfirmations: number;
    merchantConfirmations: number | null;
    effectiveConfirmations: number;
    updatedAt: string;
  };
}
