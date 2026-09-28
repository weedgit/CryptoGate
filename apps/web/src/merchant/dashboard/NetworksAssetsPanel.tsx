import { Link } from "react-router-dom";
import { AssetNetworkTables } from "../../platform/AssetNetworkTables";
import { merchantRoute } from "../../shared/portalRouting";

type Props = {
  /** Bump (dashboard Refresh / live events) to reload lamps. */
  reloadToken?: number;
};

/** Right column beside Transaction Volume — same panel as the platform dashboard. */
export function NetworksAssetsPanel({ reloadToken = 0 }: Props) {
  return (
    <div className="panel glass-tone-slate plat-health-card pg-networks-panel">
      <div className="pg-networks-panel__head">
        <div className="pg-networks-panel__title-row">
          <div className="pg-networks-panel__titles">
            <h2>
              <span className="pg-networks-panel__title-icon" aria-hidden>
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="6" cy="7" r="2.25" />
                  <circle cx="18" cy="7" r="2.25" />
                  <circle cx="12" cy="17" r="2.25" />
                  <path d="M8 7h8" />
                  <path d="M7.2 8.6 10.8 15" />
                  <path d="M16.8 8.6 13.2 15" />
                </svg>
              </span>
              Networks &amp; Assets
            </h2>
          </div>
          <Link to={merchantRoute("networks")} className="pg-networks-panel__more">
            View All →
          </Link>
        </div>
      </div>
      <div className="plat-health-pairs">
        <AssetNetworkTables compact sortable={false} reloadToken={reloadToken} />
      </div>
    </div>
  );
}
