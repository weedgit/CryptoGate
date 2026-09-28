import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getFulfillmentPolicy,
  getMatchingMode,
  listHdPool,
  listSettlement,
  listXpub,
  type HdPoolAddress,
  type SettlementAddress,
  type XpubSettings,
} from "../api";

export type SettlementNotify = {
  error: (message: string) => void;
  success: (message: string) => void;
  clear: () => void;
};

export type SettlementData = {
  matchingMode: string;
  matchingSource: string;
  fulfillmentPolicy: string;
  fulfillmentSource: string;
  addresses: SettlementAddress[];
  xpubs: XpubSettings[];
  pool: HdPoolAddress[];
  derivePath: string;
};

const DEFAULT_DERIVE_PATH = "0/{index}";

const EMPTY: SettlementData = {
  matchingMode: "B",
  matchingSource: "merchant",
  fulfillmentPolicy: "on_completed",
  fulfillmentSource: "merchant",
  addresses: [],
  xpubs: [],
  pool: [],
  derivePath: DEFAULT_DERIVE_PATH,
};

/** Loads matching, fulfillment, wallets, xPubs and HD pool for the merchant org. */
export function useSettlementData(orgId: string | null, notify: SettlementNotify) {
  const [data, setData] = useState<SettlementData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  const patch = useCallback((next: Partial<SettlementData>) => {
    setData((prev) => ({ ...prev, ...next }));
  }, []);

  const load = useCallback(async () => {
    if (!orgId) {
      notify.error("No merchant org on this session");
      setLoading(false);
      return;
    }
    setLoading(true);
    setForbidden(false);
    try {
      const [m, f, s] = await Promise.all([
        getMatchingMode(orgId),
        getFulfillmentPolicy(orgId),
        listSettlement(orgId),
      ]);
      const [x, h] = await Promise.allSettled([listXpub(orgId), listHdPool(orgId)]);
      setData({
        matchingMode: m.matchingMode,
        matchingSource: m.source ?? "merchant",
        fulfillmentPolicy: f.fulfillmentPolicy,
        fulfillmentSource: f.source ?? "merchant",
        addresses: s,
        xpubs: x.status === "fulfilled" ? x.value : [],
        pool: h.status === "fulfilled" ? h.value.items ?? [] : [],
        derivePath:
          h.status === "fulfilled"
            ? h.value.derivationPath ?? DEFAULT_DERIVE_PATH
            : DEFAULT_DERIVE_PATH,
      });
      if (x.status === "rejected" || h.status === "rejected") {
        notify.error("xPub and HD pool status could not load — reload to retry.");
      }
    } catch (err) {
      if (err instanceof ApiError && err.httpStatus === 403) {
        setForbidden(true);
        notify.error(
          "Cashiers cannot view or change settlement address, matching mode, or xPub.",
        );
      } else {
        notify.error(err instanceof ApiError ? err.message : "Failed to load settlement");
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadAddresses = useCallback(async () => {
    if (!orgId) return;
    patch({ addresses: await listSettlement(orgId) });
  }, [orgId, patch]);

  const reloadXpubAndPool = useCallback(async () => {
    if (!orgId) return;
    const [x, h] = await Promise.all([listXpub(orgId), listHdPool(orgId)]);
    patch({
      xpubs: x,
      pool: h.items ?? [],
      derivePath: h.derivationPath ?? DEFAULT_DERIVE_PATH,
    });
  }, [orgId, patch]);

  return { data, loading, forbidden, patch, reloadAddresses, reloadXpubAndPool };
}
