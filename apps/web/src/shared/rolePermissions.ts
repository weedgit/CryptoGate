export type PortalKind = "platform" | "agent" | "merchant";
export type RoleKey = "owner" | "administrator" | "viewer" | "cashier";

export type RolePermissionSummary = {
  role: RoleKey;
  label: string;
  /** One line under the role badge in the sidebar. */
  summary: string;
  can: string[];
  /** Actions reserved for another role (hidden for this user). */
  cannot: { label: string; items: string[] } | null;
};

export function normalizeRoleKey(raw: string | null | undefined): RoleKey {
  if (raw === "owner" || raw === "administrator" || raw === "cashier") return raw;
  return "viewer";
}

const LABELS: Record<RoleKey, string> = {
  owner: "Owner",
  administrator: "Administrator",
  viewer: "Viewer",
  cashier: "Cashier",
};

const VIEWER_CANNOT = {
  label: "Hidden for Viewers",
  items: ["Every create, edit, pay, and delete action"],
};

/**
 * Role × portal permission copy for the sidebar role card (Business-Model
 * "Roles and permissions"). Actions a role cannot take are hidden in the UI.
 */
export function rolePermissionSummary(
  portal: PortalKind,
  rawRole: string | null | undefined,
): RolePermissionSummary {
  const role = normalizeRoleKey(rawRole);
  const label = LABELS[role];

  if (portal === "platform") {
    if (role === "owner") {
      return {
        role,
        label,
        summary: "Full access",
        can: [
          "Onboard and manage agents, merchants, and sites",
          "Issue and adjust service bills",
          "Commissions and agent payouts",
          "Fee schedule, networks, and rates",
          "Merchant settlement wallet and xPub",
          "Add or remove team members",
        ],
        cannot: null,
      };
    }
    if (role === "administrator") {
      return {
        role,
        label,
        summary: "Operate accounts & billing",
        can: [
          "Onboard and manage agents, merchants, and sites",
          "Suspend / resume accounts (MFA)",
          "Issue and adjust service bills",
          "Commissions and agent payout override",
          "Network rails and maintenance",
        ],
        cannot: {
          label: "Owner only",
          items: [
            "Add or remove team members",
            "Merchant settlement wallet and xPub",
            "Edit an account Owner's personal profile",
          ],
        },
      };
    }
    return {
      role: "viewer",
      label: LABELS.viewer,
      summary: "Read-only",
      can: ["View dashboards, accounts, bills, commissions, and audit"],
      cannot: VIEWER_CANNOT,
    };
  }

  if (portal === "agent") {
    if (role === "owner") {
      return {
        role,
        label,
        summary: "Full agent access",
        can: [
          "Onboard merchants and sites",
          "Payout wallet (MFA + cool-down)",
          "Confirm commission receipts",
          "Add or remove team members",
        ],
        cannot: {
          label: "Managed by merchants",
          items: ["Merchant settlement, credentials, and fees"],
        },
      };
    }
    if (role === "administrator") {
      return {
        role,
        label,
        summary: "Onboard & operate",
        can: [
          "Onboard merchants and sites",
          "Payout wallet (MFA + cool-down)",
          "Confirm commission receipts",
        ],
        cannot: {
          label: "Owner only",
          items: [
            "Add or remove team members",
            "Edit the Owner's personal profile",
          ],
        },
      };
    }
    return {
      role: "viewer",
      label: LABELS.viewer,
      summary: "Read-only",
      can: ["View merchants, bills, and commissions"],
      cannot: VIEWER_CANNOT,
    };
  }

  if (role === "owner") {
    return {
      role,
      label,
      summary: "Full store access",
      can: [
        "Payment orders and sites",
        "Settlement wallet and xPub (MFA + cool-down)",
        "API keys and webhooks",
        "Pay service bills",
        "Add or remove team members",
      ],
      cannot: null,
    };
  }
  if (role === "administrator") {
    return {
      role,
      label,
      summary: "Manage store",
      can: [
        "Payment orders and sites",
        "API keys and webhooks",
        "Cashier POS PINs",
        "Pay service bills",
      ],
      cannot: {
        label: "Owner only",
        items: [
          "Settlement wallet and xPub",
          "Add or remove team members",
          "Edit the Owner's personal profile",
        ],
      },
    };
  }
  if (role === "cashier") {
    return {
      role,
      label,
      summary: "Own orders only",
      can: ["Create and manage your own payment orders"],
      cannot: {
        label: "Hidden for Cashiers",
        items: ["Dashboard controls, settings, settlement, team, and bills"],
      },
    };
  }
  return {
    role: "viewer",
    label: LABELS.viewer,
    summary: "Read-only",
    can: ["View orders, bills, and settings"],
    cannot: VIEWER_CANNOT,
  };
}
