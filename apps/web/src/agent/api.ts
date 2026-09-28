import { apiFetch } from "../auth/apiFetch";
import { API_BASE, parseError } from "../shared/apiCore";
import {
  listOrgs,
  setOrgStatus,
  getOrgDeletePreview,
  deleteOrg,
  getMerchantCommercial,
  updateMerchantCommercial,
  createOrg,
} from "../shared/orgApi";
import type {
  OrgAccount,
  OrgDeletePreview,
  MerchantCommercialSettings,
} from "../shared/orgApi";
import {
  SERVICE_BILLS_LIST_LIMIT,
  listServiceBillsPage,
  listServiceBills,
  getServiceBill,
} from "../shared/serviceBillApi";
import type { ServiceBill, ServiceBillListPage } from "../shared/serviceBillApi";
import { listAuditLog } from "../shared/auditApi";
import type { AuditLogEntry } from "../shared/auditApi";
import {
  getAgentCommission,
  listAgentCommissions,
  getAgentPayout,
  listAgentPayoutAddresses,
  putAgentPayout,
  getFeeTierSettings,
} from "../shared/agentCommissionApi";
import type { AgentPayoutAddress, FeeTierBand } from "../shared/agentCommissionApi";
import {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrgUsers,
  listOrgMemberEmails,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
  assignOrgUserRole,
  patchOrgProfile,
  type OrgMember,
  type InviteOrgUserResult,
  type PaymentOrder,
  type Session,
} from "../merchant/api";

export {
  listOrgs,
  setOrgStatus,
  getOrgDeletePreview,
  deleteOrg,
  getMerchantCommercial,
  updateMerchantCommercial,
  createOrg,
};
export type { OrgAccount, OrgDeletePreview, MerchantCommercialSettings };
export {
  SERVICE_BILLS_LIST_LIMIT,
  listServiceBillsPage,
  listServiceBills,
  getServiceBill,
};
export type { ServiceBill, ServiceBillListPage };
export { listAuditLog };
export type { AuditLogEntry };
export {
  getAgentCommission,
  listAgentCommissions,
  getAgentPayout,
  listAgentPayoutAddresses,
  putAgentPayout,
  getFeeTierSettings,
};
export type { AgentPayoutAddress, FeeTierBand };

export {
  ApiError,
  getSession,
  login,
  logout,
  listOrders,
  listOrgUsers,
  listOrgMemberEmails,
  setOrgUserStatus,
  removeOrgUser,
  inviteOrgUser,
  assignOrgUserRole,
  patchOrgProfile,
};
export type { PaymentOrder, Session, OrgMember, InviteOrgUserResult };

export {
  invalidateAgentOrgList,
  peekAgentOrgs,
  getAgentOrgs,
  refreshAgentOrgList,
  mergeAgentOrg,
  removeAgentOrgFromList,
  AGENT_ORGS_UPDATED_EVENT,
} from "./agentOrgList";

export async function listMerchantCommercialSummaries(
  orgIds: string[],
): Promise<MerchantCommercialSettings[]> {
  if (orgIds.length === 0) return [];
  const q = new URLSearchParams({ ids: orgIds.join(",") });
  const res = await apiFetch(`${API_BASE}/orgs/commercial-summaries?${q}`, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) await parseError(res);
  const data = (await res.json()) as { items: MerchantCommercialSettings[] };
  return data.items ?? [];
}

export { getOrderSummary, type OrderSummary } from "../merchant/api";

