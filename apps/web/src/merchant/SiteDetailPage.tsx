import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { OrgDeleteConfirmModal } from "../platform/ui/OrgDeleteConfirmModal";
import {
  ApiError,
  deleteOrg,
  getOrg,
  getOrgDeletePreview,
  type OrgAccount,
  type OrgDeletePreview,
  type Session,
} from "./api";
import { peekMerchantOrgs } from "./merchantOrgList";
import { AuthToast } from "../auth/AuthToast";
import { orgTypeLabel, sessionCanManageSites, truncateAddress } from "./org";
import { SiteOverridesPanel } from "./SiteOverridesPanel";

export function SiteDetailPage({ session }: { session: Session }) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const canManage = useMemo(() => sessionCanManageSites(session), [session]);
  const [site, setSite] = useState<OrgAccount | null>(() =>
    id ? (peekMerchantOrgs()?.find((o) => o.id === id) ?? null) : null,
  );
  const [loading, setLoading] = useState(
    () => !(id && peekMerchantOrgs()?.some((o) => o.id === id)),
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<OrgDeletePreview | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (!peekMerchantOrgs()?.some((o) => o.id === id)) setLoading(true);
    setError(null);
    try {
      setSite(await getOrg(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load site");
      setSite(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deleteOpen || !id) {
      setDeletePreview(null);
      return;
    }
    let cancelled = false;
    setDeletePreviewLoading(true);
    setDeleteError(null);
    void getOrgDeletePreview(id)
      .then((preview) => {
        if (!cancelled) setDeletePreview(preview);
      })
      .catch((err) => {
        if (!cancelled) {
          setDeleteError(
            err instanceof ApiError ? err.message : "Failed to load delete preview",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setDeletePreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deleteOpen, id]);

  async function onConfirmDelete() {
    if (!site || !canManage) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteOrg(site.id, { cascade: true });
      navigate(merchantRoute("sites"), { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <p className="muted">Loading site…</p>;
  if (error && !site) {
    return (
      <div className="sites-page dash-page">
        <AuthToast
          message={error}
          tone="error"
          onDismiss={() => setError(null)}
        />
        <p className="muted">Could not load this site.</p>
        <Link className="btn-ghost btn-inline" to={merchantRoute("sites")}>
          ← Back to sites
        </Link>
      </div>
    );
  }
  if (!site) return null;

  return (
    <div className="sites-page dash-page">
      <div className="orders-toolbar">
        <p className="dash-welcome">{orgTypeLabel(site.type)} overview</p>
        <Link className="btn-ghost btn-inline" to={merchantRoute("sites")}>
          All sites
        </Link>
      </div>

      <div className="panel settings-panel">
        <h2>{site.name}</h2>
        <div className="settings-field">
          <span className="settings-label">Org ID</span>
          <span className="mono">{site.id}</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Parent</span>
          <span className="mono">
            {site.parentId ? truncateAddress(site.parentId, 8, 6) : "—"}
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Status</span>
          <span>{site.status === "paused" ? "Paused" : "Active"}</span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Settlement / matching</span>
          <span>
            Inherit parent merchant defaults until the parent Owner approves a
            site override (D17).
          </span>
        </div>
        <div className="settings-field">
          <span className="settings-label">Structure</span>
          <span>{site.structure?.replace(/_/g, " ") ?? "—"}</span>
        </div>
      </div>

      <SiteOverridesPanel
        session={session}
        siteId={site.id}
        parentId={site.parentId}
      />

      <div className="orders-actions">
        <Link className="btn-primary btn-inline" to={merchantRoute("settings/settlement")}>
          Parent settlement
        </Link>
        <Link className="btn-ghost btn-inline" to={merchantRoute("orders")}>
          All orders
        </Link>
        <Link className="btn-ghost btn-inline" to={merchantRoute("reports")}>
          Reports
        </Link>
      </div>

      {canManage ? (
        <section className="panel plat-settings__card plat-settings__card--danger merchant-site-danger">
          <div className="plat-settings__card-head">
            <h2 className="plat-settings__card-title">Remove site</h2>
          </div>
          <div className="plat-settings__card-body">
            <p className="plat-settings__card-copy">
              Delete this merchant (site) account and its team, orders, keys, and
              webhooks. Nested orgs under this site are removed as well.
            </p>
            <button
              type="button"
              className="btn-ghost btn-inline merchant-site-danger__btn"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Delete site
            </button>
          </div>
        </section>
      ) : null}

      {deleteOpen ? (
        <OrgDeleteConfirmModal
          orgId={site.id}
          orgName={site.name}
          busy={deleteBusy}
          error={deleteError}
          preview={deletePreview}
          previewLoading={deletePreviewLoading}
          onClose={() => {
            if (!deleteBusy) setDeleteOpen(false);
          }}
          onConfirm={() => void onConfirmDelete()}
        />
      ) : null}
    </div>
  );
}
