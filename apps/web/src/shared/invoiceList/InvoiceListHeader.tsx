import { Link } from "react-router-dom";
import {
  invoiceExportDownloadUrl,
  type InvoiceExportJob,
  type PaymentOrderListSummary,
} from "../../merchant/api";
import { FundAmount } from "../../platform/FundAmount";
import { merchantRoute } from "../portalRouting";
import { DownloadIcon, PlusIcon } from "./InvoiceListIcons";
import { ChargeLink } from "../../merchant/chargeLink";

type Props = {
  summary: PaymentOrderListSummary;
  canExport: boolean;
  canCreate: boolean;
  needsScopeGate: boolean;
  total: number;
  exportJob: InvoiceExportJob | null;
  exportBusy: boolean;
  exportHref: string | null;
  requestAsyncExport: () => Promise<void>;
};

export function InvoiceListHeader({
  summary,
  canExport,
  canCreate,
  needsScopeGate,
  total,
  exportJob,
  exportBusy,
  exportHref,
  requestAsyncExport,
}: Props) {
  return (
    <header className="invoice-list__header">
      <div>
        <h1 className="invoice-list__title">Invoices</h1>
        <span className="invoice-list__count">
          {summary.count.toLocaleString()} invoices
        </span>
      </div>
      <div className="invoice-list__header-search" id="invoice-list-header-search" />
      <div className="invoice-list__total">
        <span className="invoice-list__total-label">
          Total invoice value
        </span>
        <span className="invoice-list__total-value">
          <FundAmount amount={summary.invoiceAmountUsd ?? "0"} />
        </span>
      </div>
      <div className="invoice-list__header-actions">
        {canExport && !needsScopeGate && total > 5000 ? (
          exportJob?.status === "ready" ? (
            <a
              className="invoice-list__btn"
              href={invoiceExportDownloadUrl(exportJob.id)}
            >
              <DownloadIcon />
              Download CSV
            </a>
          ) : (
            <button
              type="button"
              className="invoice-list__btn"
              onClick={() => void requestAsyncExport()}
              disabled={
                exportBusy ||
                exportJob?.status === "queued" ||
                exportJob?.status === "running"
              }
            >
              <DownloadIcon />
              {exportJob?.status === "queued" ||
              exportJob?.status === "running" ||
              exportBusy
                ? "Preparing…"
                : "Request export"}
            </button>
          )
        ) : null}
        {canExport && !needsScopeGate && total > 0 && exportHref ? (
          <a
            className="invoice-list__btn invoice-list__btn--icon"
            href={exportHref}
            aria-label="Export CSV"
            title="Export CSV"
          >
            <DownloadIcon />
          </a>
        ) : null}
        {canCreate ? (
          <ChargeLink className="invoice-list__btn invoice-list__btn--primary">
            <PlusIcon />
            Charge
          </ChargeLink>
        ) : null}
      </div>
    </header>
  );
}
