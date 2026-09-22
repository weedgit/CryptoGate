import type { ReactNode } from "react";
import type { OrgAccount, OrgPrimaryOwnerContact } from "../platform/api";
import { orgTypeLabel } from "../platform/org";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import { OrgOwnerSupportFields } from "./OrgOwnerSupportFields";

function dash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

type Props = {
  org: OrgAccount;
  owner: OrgPrimaryOwnerContact | null;
  ownerLoading?: boolean;
  /** Platform O/A — open org profile edit modal. */
  canEditOrg: boolean;
  /** Platform Owner — edit owner person + verification. */
  canEditOwner: boolean;
  onEditOrg: () => void;
  onOwnerUpdated: (next: OrgPrimaryOwnerContact) => void;
  /** Commission / commercial / payout / sites rows after core org fields. */
  extras?: ReactNode;
};

/**
 * Accounts detail Overview — full organization + owner fields with Edit.
 */
export function AccountOverviewProfile({
  org,
  owner,
  ownerLoading = false,
  canEditOrg,
  canEditOwner,
  onEditOrg,
  onOwnerUpdated,
  extras,
}: Props) {
  const status = org.status ?? "active";

  return (
    <div className="b3-agent-detail__overview-profile">
      <section
        className="b3-card b3-card--section b3-card--flat"
        aria-label="Organization"
      >
        <div className="b3-profile__head">
          <h3 className="b3-card__heading">Organization</h3>
          {canEditOrg ? (
            <button
              type="button"
              className="b3-profile__edit-btn"
              onClick={onEditOrg}
            >
              Edit
            </button>
          ) : null}
        </div>
        <div className="b3-profile">
          <div className="b3-profile__field">
            <p className="b3-profile__label">Business name</p>
            <p className="b3-profile__value">{dash(org.name)}</p>
          </div>
          <div className="b3-profile__field">
            <p className="b3-profile__label">Legal name</p>
            <p className="b3-profile__value">
              {dash(org.legalName || org.name)}
            </p>
          </div>
          <div className="b3-profile__field">
            <p className="b3-profile__label">Billing email</p>
            <p className="b3-profile__value">{dash(org.billingEmail)}</p>
          </div>
          <div className="b3-profile__field">
            <p className="b3-profile__label">Country</p>
            <p className="b3-profile__value">{dash(org.country)}</p>
          </div>
          <div className="b3-profile__field">
            <p className="b3-profile__label">Type</p>
            <p className="b3-profile__value">{orgTypeLabel(org.type)}</p>
          </div>
          <div className="b3-profile__field">
            <p className="b3-profile__label">Status</p>
            <p className="b3-profile__value">
              {status === "paused" ? "Paused" : "Active"}
            </p>
          </div>
          <div className="b3-profile__field">
            <p className="b3-profile__label">Onboarded</p>
            <p className="b3-profile__value">
              {formatOnboardDate(org.createdAt)}
            </p>
          </div>
          {extras}
        </div>
      </section>

      <OrgOwnerSupportFields
        orgId={org.id}
        owner={owner}
        loading={ownerLoading}
        canSupportEdit={canEditOwner}
        onOwnerUpdated={onOwnerUpdated}
        asSection
      />
    </div>
  );
}
