import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import { OrgDeleteConfirmModal } from "../platform/ui/OrgDeleteConfirmModal";
import { PlatformPending } from "../platform/ui/PlatformPending";
import { SuspendOrgModal } from "../platform/ui/SuspendOrgModal";
import { FundAmount } from "../platform/FundAmount";
import {
  ApiError,
  deleteOrg,
  getOrg,
  getOrgDeletePreview,
  listOrders,
  listOrgUsers,
  setOrgStatus,
  type OrgAccount,
  type OrgDeletePreview,
  type OrgMember,
  type PaymentOrder,
  type Session,
} from "./api";
import { invalidateMerchantOrgList, peekMerchantOrgs } from "./merchantOrgList";
import { AuthToast } from "../auth/AuthToast";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import { sessionCanManageSites } from "./org";
import { formatShortTime, orderStatusLabel } from "./orderStatus";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "orders", label: "Orders" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase() || "ST";
}

type Props = {
  session: Session;
  site: OrgAccount;
  /** Owner or first member email when known; falls back to site name. */
  contactEmail?: string | null;
  onDeleted?: () => void;
};

function preferredMemberEmail(members: OrgMember[]): string | null {
  const preferred =
    members.find((m) => /owner/i.test(m.role)) ??
    members.find((m) => /admin/i.test(m.role)) ??
    members[0];
  const email = preferred?.email?.trim();
  return email || null;
}

function siteHeaderContact(
  site: OrgAccount,
  contactEmail?: string | null,
): { text: string; mailto: boolean } {
  const email = contactEmail?.trim();
  if (email && email !== "—") {
    return { text: email, mailto: true };
  }
  const name = site.name.trim();
  return { text: name || "—", mailto: false };
}

/** Site detail pane — platform b3 chrome inside merchant sites split view. */
export function SiteDetailCard({
  session,
  site: initialSite,
  contactEmail,
  onDeleted,
}: Props) {
  const navigate = useNavigate();
  const canManage = useMemo(() => sessionCanManageSites(session), [session]);
  const [site, setSite] = useState(initialSite);
  const [tab, setTab] = useState<TabId>("overview");
  const [loading, setLoading] = useState(
    () => !peekMerchantOrgs()?.some((o) => o.id === initialSite.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<OrgDeletePreview | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendError, setSuspendError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [memberEmail, setMemberEmail] = useState<string | null>(null);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  useEffect(() => {
    setSite(initialSite);
    setTab("overview");
  }, [initialSite]);

  useEffect(() => {
    let cancelled = false;
    setMemberEmail(null);
    void listOrgUsers(initialSite.id)
      .then((members) => {
        if (!cancelled) setMemberEmail(preferredMemberEmail(members));
      })
      .catch(() => {
        if (!cancelled) setMemberEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSite.id]);

  const load = useCallback(async () => {
    setError(null);
    if (!peekMerchantOrgs()?.some((o) => o.id === initialSite.id)) {
      setLoading(true);
    }
    try {
      setSite(await getOrg(initialSite.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load site");
    } finally {
      setLoading(false);
    }
  }, [initialSite.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab !== "orders") return;
    let cancelled = false;
    setOrdersLoading(true);
    void listOrders({ orgId: site.id, limit: 200 })
      .then((rows) => {
        if (!cancelled) setOrders(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Failed to load orders");
          setOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, site.id]);

  useEffect(() => {
    if (!deleteOpen) {
      setDeletePreview(null);
      return;
    }
    let cancelled = false;
    setDeletePreviewLoading(true);
    setDeleteError(null);
    void getOrgDeletePreview(site.id)
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
  }, [deleteOpen, site.id]);

  async function onConfirmDelete() {
    if (!canManage) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteOrg(site.id, { cascade: true });
      invalidateMerchantOrgList();
      onDeleted?.();
      navigate(merchantRoute("sites"), { replace: true });
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onConfirmSuspend(reason: string) {
    if (!canManage) return;
    setStatusBusy(true);
    setSuspendError(null);
    try {
      const next = await setOrgStatus(site.id, "paused", {
        reason: reason.trim() || undefined,
      });
      setSite(next);
      setSuspendOpen(false);
      onDeleted?.();
    } catch (err) {
      setSuspendError(err instanceof ApiError ? err.message : "Suspend failed");
    } finally {
      setStatusBusy(false);
    }
  }

  async function onResume() {
    if (!canManage) return;
    setStatusBusy(true);
    setError(null);
    try {
      const next = await setOrgStatus(site.id, "active");
      setSite(next);
      onDeleted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Resume failed");
    } finally {
      setStatusBusy(false);
    }
  }

  const status = site.status ?? "active";
  const headerContact = siteHeaderContact(site, contactEmail || memberEmail);
  const headerBusy = deleteBusy || statusBusy;

  return (
    <div className="b3-agent-detail merchant-site-detail">
      <AuthToast message={error} tone="error" onDismiss={() => setError(null)} />

      <div className="b3-agent-detail__head">
        <div className="b3-agent-detail__identity">
          <div className="b3-agent-detail__avatar" aria-hidden>
            {initials(site.name)}
          </div>
          <div className="b3-agent-detail__titles">
            <div className="b3-agent-detail__title-row">
              <h2 className="b3-agent-detail__name">{site.name}</h2>
              <span
                className={`b3-agent-detail__status${
                  status === "paused" ? " is-paused" : ""
                }`}
              >
                {status === "paused" ? "Paused" : "Active"}
              </span>
            </div>
            {headerContact.mailto ? (
              <a
                className="b3-agent-detail__email"
                href={`mailto:${headerContact.text}`}
                title={headerContact.text}
              >
                {headerContact.text}
              </a>
            ) : (
              <span className="b3-agent-detail__email" title={headerContact.text}>
                {headerContact.text}
              </span>
            )}
          </div>
        </div>
        {canManage ? (
          <div className="b3-agent-detail__head-actions">
            {status === "active" ? (
              <button
                type="button"
                className="b3-agent-detail__suspend"
                disabled={headerBusy}
                onClick={() => {
                  setSuspendError(null);
                  setSuspendOpen(true);
                }}
              >
                Suspend
              </button>
            ) : (
              <button
                type="button"
                className="b3-agent-detail__suspend"
                disabled={headerBusy}
                onClick={() => void onResume()}
              >
                Resume
              </button>
            )}
            <button
              type="button"
              className="b3-agent-detail__delete"
              disabled={headerBusy}
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      <div
        className="b3-agent-detail__tabs"
        role="tablist"
        aria-label="Site tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className={`b3-agent-detail__tab${tab === t.id ? " is-active" : ""}`}
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <PlatformPending title="Loading site…" compact />
      ) : (
        <div className="b3-agent-detail__body">
          {tab === "overview" ? (
            <section className="b3-card b3-card--section b3-card--flat">
              <div className="b3-profile__head">
                <h3 className="b3-card__heading">Profile</h3>
              </div>
              <div className="b3-profile">
                <div className="b3-profile__field">
                  <p className="b3-profile__label">Created</p>
                  <p className="b3-profile__value">
                    {site.createdAt ? formatOnboardDate(site.createdAt) : "—"}
                  </p>
                </div>
                <div className="b3-profile__field">
                  <p className="b3-profile__label">Structure</p>
                  <p className="b3-profile__value">
                    {site.structure?.replace(/_/g, " ") ?? "—"}
                  </p>
                </div>
                <div className="b3-profile__field">
                  <p className="b3-profile__label">Settings</p>
                  <p className="b3-profile__value">
                    Inherits parent merchant (wallet, matching, fulfillment,
                    retention)
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {tab === "orders" ? (
            ordersLoading ? (
              <PlatformPending
                compact
                title="Loading orders"
                copy="Fetching invoices for this site and its cashiers."
              />
            ) : orders.length === 0 ? (
              <div className="b3-agent-detail__empty" role="status">
                <p className="b3-agent-detail__empty-title">No orders</p>
                <p className="b3-agent-detail__empty-copy">
                  Invoices created at this site, including cashier invoices, appear
                  here.
                </p>
              </div>
            ) : (
              <div className="b3-agent-detail__table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Status</th>
                      <th>Amount</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => {
                      const href = merchantRoute(`orders/${o.id}`);
                      return (
                        <tr
                          key={o.id}
                          className="is-clickable"
                          onClick={() => navigate(href)}
                        >
                          <td>
                            <Link
                              className="plat-bills__id"
                              to={href}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {o.orderNumber}
                            </Link>
                          </td>
                          <td>{orderStatusLabel(o.status, o)}</td>
                          <td>
                            <FundAmount>{o.payableAmount.amount}</FundAmount>
                            <span className="plat-bills__currency muted">
                              {" "}
                              {o.asset}
                            </span>
                          </td>
                          <td className="muted">
                            {o.createdAt ? formatShortTime(o.createdAt) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </div>
      )}

      {suspendOpen ? (
        <SuspendOrgModal
          orgName={site.name}
          busy={statusBusy}
          error={suspendError}
          onClose={() => {
            if (!statusBusy) setSuspendOpen(false);
          }}
          onConfirm={(reason) => void onConfirmSuspend(reason)}
        />
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
