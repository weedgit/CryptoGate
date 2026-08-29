import { useMemo, useState } from "react";
import {
  NetworkId,
  type AssetNetworkConfig,
} from "@cryptogate/domain";
import { NetworkIcon } from "./cryptoIcons";
import { visibleRegistry } from "../shared/assetNetworks";

type CardStatus = "active" | "maint" | "staging" | "catalogued";

type NetworkCard = {
  network: AssetNetworkConfig["network"];
  title: string;
  watcherTag: string;
  primary: AssetNetworkConfig;
  assetCount: number;
  liveCount: number;
  status: CardStatus;
  healthPct: number;
  canToggle: boolean;
};

function shortContract(addr: string | null): string {
  if (!addr) return "Native";
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** One card per chain — primary pair prefers live, then USDT, then first. */
function buildNetworkCards(): NetworkCard[] {
  const byNet = new Map<string, AssetNetworkConfig[]>();
  for (const row of visibleRegistry()) {
    const list = byNet.get(row.network) ?? [];
    list.push(row);
    byNet.set(row.network, list);
  }

  const cards: NetworkCard[] = [];
  let watcherIdx = 1;
  for (const [network, rows] of byNet) {
    const live = rows.filter((r) => r.enabled);
    const primary =
      live[0] ??
      rows.find((r) => r.asset === "USDT") ??
      rows.find((r) => r.asset === "BTC") ??
      rows[0]!;

    let status: CardStatus = "catalogued";
    let healthPct = 0;
    if (live.length > 0) {
      status = "active";
      healthPct = rows.length > 0 ? (live.length / rows.length) * 100 : 100;
    } else if (
      primary.asset === "USDT" &&
      primary.network === NetworkId.Ethereum
    ) {
      status = "staging";
      healthPct = 0;
    }

    cards.push({
      network: network as AssetNetworkConfig["network"],
      title: primary.displayNetwork,
      watcherTag: `SYS_NODE // WATCHER_${String(watcherIdx).padStart(2, "0")}`,
      primary,
      assetCount: rows.length,
      liveCount: live.length,
      status,
      healthPct,
      canToggle: status === "active",
    });
    watcherIdx += 1;
  }

  // Live first, then staging, then catalogued — stable within group by title.
  const rank: Record<CardStatus, number> = {
    active: 0,
    maint: 1,
    staging: 2,
    catalogued: 3,
  };
  return cards.sort((a, b) => {
    const d = rank[a.status] - rank[b.status];
    if (d !== 0) return d;
    return a.title.localeCompare(b.title);
  });
}

function statusLabel(status: CardStatus): string {
  if (status === "active") return "ACTIVE";
  if (status === "maint") return "MAINT_MODE";
  if (status === "staging") return "STAGING";
  return "CATALOGUED";
}

function formatCatalogStatus(
  pct: number,
  status: CardStatus,
  liveCount: number,
  assetCount: number,
): string {
  if (status === "catalogued" || status === "staging") return "—";
  if (status === "maint") return `${pct.toFixed(0)}%`;
  if (assetCount <= 0) return "—";
  return `${liveCount}/${assetCount} live`;
}

/** B16 — Network & asset catalog (Figma `b16-network-catalog`). */
export function NetworkCatalogPage() {
  const baseCards = useMemo(() => buildNetworkCards(), []);
  /** Local-only maintenance overlay until ops API ships. */
  const [maintOff, setMaintOff] = useState<Record<string, boolean>>({});

  const cards = useMemo(
    () =>
      baseCards.map((card) => {
        if (!card.canToggle || !maintOff[card.network]) return card;
        return {
          ...card,
          status: "maint" as const,
          healthPct: Math.max(88, card.healthPct - 8.76),
        };
      }),
    [baseCards, maintOff],
  );

  return (
    <div className="dash-page plat-network-catalog">
      <div className="plat-network-catalog__grid">
        {cards.map((card, index) => {
          const isMaint = card.status === "maint";
          const isActive = card.status === "active";
          const isStaging = card.status === "staging";
          const healthWidth =
            card.status === "catalogued" || card.status === "staging"
              ? 0
              : Math.min(100, Math.max(0, card.healthPct));

          return (
            <article
              key={card.network}
              className={[
                "plat-network-card",
                "panel",
                `plat-network-card--${card.network.replace(/_/g, "-")}`,
                isMaint ? "plat-network-card--maint" : "",
                isActive ? "plat-network-card--active" : "",
                isStaging ? "plat-network-card--staging" : "",
                card.status === "catalogued" ? "plat-network-card--catalogued" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="plat-network-card__head">
                <div className="plat-network-card__identity">
                  <span className="plat-network-card__badge" aria-hidden="true">
                    <NetworkIcon network={card.network} />
                  </span>
                  <div className="plat-network-card__titles">
                    <h2 className="plat-network-card__title">{card.title}</h2>
                    <p className="plat-network-card__watcher">{card.watcherTag}</p>
                  </div>
                </div>
                <span
                  className={`plat-network-card__status plat-network-card__status--${card.status}`}
                >
                  {statusLabel(card.status)}
                </span>
              </div>

              <div className="plat-network-card__health">
                <div className="plat-network-card__health-row">
                  <span>Catalog status</span>
                  <span
                    className={`plat-network-card__health-value plat-network-card__health-value--${card.status}`}
                  >
                    {formatCatalogStatus(
                      card.healthPct,
                      card.status,
                      card.liveCount,
                      card.assetCount,
                    )}
                  </span>
                </div>
                <div
                  className="plat-network-card__bar"
                  role="progressbar"
                  aria-valuenow={healthWidth}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${card.title} catalog status`}
                >
                  <div
                    className={`plat-network-card__bar-fill plat-network-card__bar-fill--${
                      isMaint ? "amber" : isActive ? "ok" : "muted"
                    }`}
                    style={{ width: `${healthWidth}%` }}
                  />
                </div>
              </div>

              <div className="plat-network-card__meta">
                <div className="plat-network-card__meta-row">
                  <span>Confirmations</span>
                  <span className="plat-network-card__meta-value">
                    {card.primary.requiredConfirmations}
                  </span>
                </div>
                <div className="plat-network-card__meta-row">
                  <span>Min amount</span>
                  <span className="plat-network-card__meta-value">
                    {card.primary.minAmount} {card.primary.asset}
                  </span>
                </div>
                <div className="plat-network-card__meta-row">
                  <span>Contract</span>
                  <span
                    className="plat-network-card__meta-value"
                    title={card.primary.contractAddress ?? undefined}
                  >
                    {shortContract(card.primary.contractAddress)}
                  </span>
                </div>
                <div className="plat-network-card__meta-row">
                  <span>Assets</span>
                  <span className="plat-network-card__meta-value">
                    {card.liveCount}/{card.assetCount} live
                  </span>
                </div>
              </div>

              <div className="plat-network-card__divider" />

              <div className="plat-network-card__footer">
                <span>Maintenance Mode</span>
                <button
                  type="button"
                  className={`plat-network-toggle${isMaint ? " is-on" : ""}`}
                  role="switch"
                  aria-checked={isMaint}
                  disabled={!card.canToggle}
                  title={
                    card.canToggle
                      ? "Local preview — persistence ships with ops API"
                      : "Unavailable until this network is live"
                  }
                  onClick={() => {
                    setMaintOff((prev) => ({
                      ...prev,
                      [card.network]: !prev[card.network],
                    }));
                  }}
                >
                  <span className="plat-network-toggle__knob" />
                </button>
              </div>

              <div className="plat-network-card__icon-corner" aria-hidden="true">
                <NetworkIcon network={card.network} />
              </div>
            </article>
          );
        })}
      </div>

      <p className="plat-network-catalog__note muted">
        Catalog respects CRYPTOGATE_CHAIN_ENV / VITE_CRYPTOGATE_CHAIN_ENV — mainnet
        (product default) hides testnet pairs; testnet shows local Nile only.
        Only LIVE pairs accept create-order. Catalog status shows how many asset pairs
        are enabled on each network (not live watcher ingest). Maintenance toggle is UI
        preview until the ops API persists schedule + merchant banner.
      </p>
    </div>
  );
}
