/**
 * Lazy ops extras for Architecture hierarchy detail (B3/B6 Overview fields).
 */
import { useEffect, useRef, useState } from "react";
import { getOrgOverview } from "./api";
import type { PlatformOrgTreeNode } from "./platformOrgTree";

export type OrgTreeOpsExtras = {
  loading: boolean;
  commissionPercent: string | null;
  tier: string | null;
  volumeFeePercent: string | null;
};

const EMPTY: OrgTreeOpsExtras = {
  loading: false,
  commissionPercent: null,
  tier: null,
  volumeFeePercent: null,
};

/**
 * Fetches overview commercial/commission for agent or merchant nodes.
 * Cached per orgId for the lifetime of the page.
 */
export function useOrgTreeOpsExtras(
  node: PlatformOrgTreeNode | null,
): OrgTreeOpsExtras {
  const cacheRef = useRef(new Map<string, OrgTreeOpsExtras>());
  const [state, setState] = useState<OrgTreeOpsExtras>(EMPTY);

  useEffect(() => {
    if (!node) {
      setState(EMPTY);
      return;
    }
    const needsFetch =
      node.type === "agent" ||
      node.type === "agent_sub" ||
      node.type === "merchant";
    if (!needsFetch) {
      setState(EMPTY);
      return;
    }

    const cached = cacheRef.current.get(node.id);
    if (cached && !cached.loading) {
      setState(cached);
      return;
    }

    let cancelled = false;
    setState({ ...EMPTY, loading: true });

    void getOrgOverview(node.id)
      .then((overview) => {
        if (cancelled) return;
        const next: OrgTreeOpsExtras = {
          loading: false,
          commissionPercent: overview.commission?.commissionPercent ?? null,
          tier: overview.commercial?.tier ?? null,
          volumeFeePercent: overview.commercial?.volumeFeePercent ?? null,
        };
        cacheRef.current.set(node.id, next);
        setState(next);
      })
      .catch(() => {
        if (cancelled) return;
        const next: OrgTreeOpsExtras = { ...EMPTY, loading: false };
        cacheRef.current.set(node.id, next);
        setState(next);
      });

    return () => {
      cancelled = true;
    };
  }, [node?.id, node?.type]);

  return state;
}
