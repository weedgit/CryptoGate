import type { CommissionPayoutRecord } from "../commercial/commissionPayoutRecords";
import {
  getServerJson,
  peekServerJson,
  toServerPage,
  type ServerPage,
  type ServerParams,
} from "./serverListApi";

export type CommissionPayoutSortKey =
  | "period"
  | "agent"
  | "fee"
  | "rate"
  | "commission"
  | "status"
  | "tx"
  | "address"
  | "paidAt"
  | "settledAt";

export type CommissionPayoutScope = {
  payeeOrgId?: string;
  payerOrgId?: string;
};

export type CommissionPayoutsListParams = CommissionPayoutScope & {
  status?: string | string[];
  q?: string;
  sort?: CommissionPayoutSortKey;
  dir?: "asc" | "desc";
  agingFirst?: boolean;
  limit: number;
  offset: number;
};

export type CommissionPayoutsSummary = {
  counts: { all: number; issued: number; paid: number; settled: number };
  stuckPaid: number;
};

const PATH = "/commission-payouts";

function listParams(p: CommissionPayoutsListParams): ServerParams {
  return {
    payer: "platform",
    payeeOrgId: p.payeeOrgId,
    payerOrgId: p.payerOrgId,
    status: Array.isArray(p.status) ? p.status.join(",") : p.status,
    q: p.q?.trim() || undefined,
    sort: p.sort,
    dir: p.sort ? p.dir : undefined,
    agingFirst: p.agingFirst ? 1 : undefined,
    limit: p.limit,
    offset: p.offset,
  };
}

function summaryParams(scope: CommissionPayoutScope): ServerParams {
  return {
    payer: "platform",
    payeeOrgId: scope.payeeOrgId,
    payerOrgId: scope.payerOrgId,
  };
}

/** One server page of platform → agent commission invoices (server filter/sort/search). */
export async function listCommissionPayoutsServer(
  p: CommissionPayoutsListParams,
): Promise<ServerPage<CommissionPayoutRecord>> {
  const data = await getServerJson<{
    items?: CommissionPayoutRecord[];
    total?: number;
    limit?: number;
    offset?: number;
  }>(PATH, listParams(p));
  return toServerPage(data, p.limit);
}

export function peekCommissionPayoutsServer(
  p: CommissionPayoutsListParams,
): ServerPage<CommissionPayoutRecord> | null {
  const data = peekServerJson<{
    items?: CommissionPayoutRecord[];
    total?: number;
    limit?: number;
    offset?: number;
  }>(PATH, listParams(p));
  return data ? toServerPage(data, p.limit) : null;
}

export function getCommissionPayoutsSummary(
  scope: CommissionPayoutScope = {},
): Promise<CommissionPayoutsSummary> {
  return getServerJson<CommissionPayoutsSummary>(
    `${PATH}/summary`,
    summaryParams(scope),
  );
}

export function peekCommissionPayoutsSummary(
  scope: CommissionPayoutScope = {},
): CommissionPayoutsSummary | null {
  return peekServerJson<CommissionPayoutsSummary>(
    `${PATH}/summary`,
    summaryParams(scope),
  );
}
