import type { ReactNode } from "react";
import type { OrgAccount, OrgPrimaryOwnerContact } from "../platform/api";
import { formatOnboardDate } from "../platform/orgDetailSeeds";
import { OrgOwnerSupportFields } from "./OrgOwnerSupportFields";
import {
  subjectOrgSetupStatus,
  type SubjectSetupKind,
} from "./subjectOrgSetup";

function PencilIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3 12.5h2.8L12.8 5.5 10.5 3.2 3 10.7v1.8Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 4l2.8 2.8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function OrgHeadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2.5 13.5V6.2L8 2.8l5.5 3.4v7.3"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M6.2 13.5V9.2h3.6v4.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

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
  /** Agent vs merchant checklist rules. */
  setupKind?: SubjectSetupKind;
  /** Settlement or payout wallet present. */
  walletSet?: boolean;
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
  setupKind = "merchant",
  walletSet = false,
  extras,
}: Props) {
  const setup = subjectOrgSetupStatus({
    kind: setupKind,
    name: org.name,
    billingEmail: org.billingEmail,
    country: org.country,
    owner,
    walletSet,
  });

  return (
    <div className="b3-agent-detail__overview-profile">
      <section
        className="b3-card b3-card--section b3-card--flat"
        aria-label="Organization"
      >
        <div className="b3-profile__head">
          <span className="b3-profile__head-icon" aria-hidden>
            <OrgHeadIcon />
          </span>
          <div className="b3-profile__head-copy">
            <h3 className="b3-card__heading">Organization</h3>
            <p className="b3-profile__sub">Business and configuration details</p>
          </div>
          {canEditOrg ? (
            <button
              type="button"
              className="b3-profile__edit-btn"
              onClick={onEditOrg}
            >
              <PencilIcon />
              Edit
            </button>
          ) : null}
        </div>
        <div className="b3-profile">
          <div className="b3-profile__field">
            <p className="b3-profile__label">Activity gate</p>
            <p className="b3-profile__value">
              {ownerLoading && !owner ? (
                "…"
              ) : setup.ready ? (
                <span className="b3-profile__pill b3-profile__pill--ok">
                  Ready · {setup.done}/{setup.total}
                </span>
              ) : (
                <span
                  className="b3-profile__pill b3-profile__pill--warn"
                  title={setup.missing.join(", ")}
                >
                  Incomplete · {setup.done}/{setup.total}
                </span>
              )}
            </p>
            {!setup.ready && setup.missing.length > 0 && !ownerLoading ? (
              <p className="b3-profile__meta">
                Missing: {setup.missing.join(", ")}
              </p>
            ) : null}
          </div>
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
