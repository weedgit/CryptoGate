import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { FundAmount } from "../platform/FundAmount";
import { AssetIcon, NetworkIcon } from "../platform/cryptoIcons";
import { serviceBillStatusLabel } from "../platform/serviceBillStatus";
import { CopyableChainValue } from "../shared/CopyableChainValue";
import { platformFeeNetwork } from "../shared/platformFeePair";
import { formatCommissionPeriodLabel } from "./commissionStatements";
import {
  commissionPayoutRemittanceUri,
  type CommissionPayoutRecord,
} from "./commissionPayoutRecords";

type OrgParentLookup = { parentId?: string | null };

type Dest = {
  address: string;
  asset: string;
  network: string;
};

type SlipTimelineStep = {
  id: string;
  label: string;
  state: "done" | "current" | "todo";
};

export function slipLifecycleSteps(payoutStatus: string): SlipTimelineStep[] {
  const issued =
    payoutStatus === "issued" ||
    payoutStatus === "ready" ||
    payoutStatus === "verifying" ||
    payoutStatus === "paid" ||
    payoutStatus === "settled";
  const paid = payoutStatus === "paid" || payoutStatus === "settled";
  const settled = payoutStatus === "settled";
  return [
    {
      id: "issued",
      label: "Issued",
      state: settled || paid ? "done" : issued ? "current" : "todo",
    },
    {
      id: "paid",
      label: "Paid",
      state: settled ? "done" : paid ? "current" : issued ? "todo" : "todo",
    },
    {
      id: "settled",
      label: "Settled",
      state: settled ? "done" : "todo",
    },
  ];
}

export function remittanceNetwork(record: {
  network?: string | null;
}): string {
  const n = record.network?.trim().toLowerCase();
  return n || platformFeeNetwork();
}

function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(data)}`;
}

function formatOnboardDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function invoiceStatusTone(status: string): string {
  if (status === "issued") return "issued";
  if (status === "paid") return "paid";
  if (status === "settled") return "settled";
  if (status === "ready") return "ready";
  if (status === "verifying") return "verifying";
  return status;
}

export function invoiceStatusLabel(status: string): string {
  if (status === "issued") return "Issued";
  if (status === "paid") return "Paid (awaiting confirm)";
  if (status === "settled") return "Settled";
  if (status === "ready") return "Ready";
  if (status === "verifying") return "Verifying";
  return status;
}

export function destForInvoice(
  slip: CommissionPayoutRecord,
  fallback?: Dest | null,
): Dest | null {
  if (slip.payoutAddress) {
    return {
      address: slip.payoutAddress,
      asset: slip.asset ?? "USDT",
      network: slip.network ?? "tron",
    };
  }
  return fallback ?? null;
}

type Props = {
  slip: CommissionPayoutRecord;
  dest: Dest | null;
  kicker: string;
  byId: Map<string, OrgParentLookup>;
  orgHref: (
    type: string,
    orgId: string,
    parentId: string | null,
  ) => string | null;
  canPay: boolean;
  canConfirmReceipt: boolean;
  paidNote: string;
  onPaidNoteChange: (value: string) => void;
  onConfirmPay: () => void;
  onConfirmReceipt: () => void;
  busy: boolean;
  onClose: () => void;
  missingAddressHint: string;
};

export function CommissionInvoiceModal({
  slip,
  dest,
  kicker,
  byId,
  orgHref,
  canPay,
  canConfirmReceipt,
  paidNote,
  onPaidNoteChange,
  onConfirmPay,
  onConfirmReceipt,
  busy,
  onClose,
  missingAddressHint,
}: Props) {
  const remittanceUri =
    dest?.address
      ? commissionPayoutRemittanceUri({
          address: dest.address,
          amount: slip.commissionAmount,
          asset: dest.asset,
          network: dest.network,
        })
      : "";
  const qrPayload = remittanceUri || dest?.address || "";
  const payable =
    canPay &&
    (slip.payoutStatus === "issued" || slip.payoutStatus === "ready");

  return (
    <div
      className="b3-commission-modal-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="b3-commission-modal plat-commissions-slip"
        role="dialog"
        aria-modal="true"
        aria-labelledby="commission-invoice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="b3-commission-modal__head plat-commissions-slip__head">
          <div className="plat-commissions-slip__head-text">
            <p className="plat-commissions-slip__kicker">{kicker}</p>
            <h3 id="commission-invoice-title">
              Commission invoice ·{" "}
              {formatCommissionPeriodLabel(slip.periodKey)}
            </h3>
          </div>
          <button
            type="button"
            className="b3-commission-modal__close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="b3-commission-modal__body plat-commissions-slip__body">
          <div className="plat-commissions-slip__layout">
            <div className="plat-commissions-slip__main">
              {slip.treeSnapshot?.merchants?.length ? (
                <section className="plat-commissions-slip__tree">
                  <div className="plat-commissions-slip__tree-head">
                    <h4 className="plat-commissions-slip__tree-title">
                      Merchant tree snapshot
                    </h4>
                    <button
                      type="button"
                      className="plat-commissions-slip__print-btn no-print"
                      onClick={() => window.print()}
                    >
                      Print
                    </button>
                  </div>
                  <div className="plat-commissions-slip__tree-wrap">
                    <table className="plat-commissions-slip__tree-table">
                      <thead>
                        <tr>
                          <th>Merchant / site</th>
                          <th>Onboarded</th>
                          <th>Bill status</th>
                          <th className="plat-commissions__th-num">
                            Volume fee
                          </th>
                          <th>Included</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slip.treeSnapshot.merchants.map((line) => {
                          const parentId =
                            byId.get(line.orgId)?.parentId ?? null;
                          const href = orgHref(
                            line.type,
                            line.orgId,
                            parentId,
                          );
                          return (
                            <tr key={line.orgId}>
                              <td>
                                {href ? (
                                  <Link
                                    className="plat-commissions-slip__tree-link"
                                    to={href}
                                    onClick={onClose}
                                  >
                                    {line.name}
                                  </Link>
                                ) : (
                                  line.name
                                )}
                              </td>
                              <td>{formatOnboardDate(line.onboardedAt)}</td>
                              <td>
                                {line.billStatus ? (
                                  <span
                                    className={`org-agents__bill is-${line.billStatus}`}
                                  >
                                    {serviceBillStatusLabel(line.billStatus)}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="plat-commissions__num">
                                <FundAmount amount={line.volumeFeeAmount} />
                              </td>
                              <td>
                                {line.includedInCommission ? "Y" : "N"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : (
                <p className="plat-commissions-slip__hint">
                  No merchant tree snapshot for this invoice period.
                </p>
              )}
            </div>
            <aside className="plat-commissions-slip__aside">
              <section className="plat-commissions-slip__summary">
                <div className="plat-commissions-slip__summary-top">
                  <div>
                    <p className="plat-commissions-slip__label">Payee</p>
                    <p className="plat-commissions-slip__payee">
                      {slip.payeeName}
                    </p>
                  </div>
                  <span
                    className={`plat-commissions__status is-${invoiceStatusTone(slip.payoutStatus)}`}
                  >
                    {invoiceStatusLabel(slip.payoutStatus)}
                  </span>
                </div>

                <div className="plat-commissions-slip__amount-row">
                  <div className="plat-commissions-slip__amount-block">
                    <p className="plat-commissions-slip__label">
                      Commission due
                    </p>
                    <p className="plat-commissions-slip__amount">
                      <FundAmount amount={slip.commissionAmount} />
                    </p>
                  </div>
                  <ol
                    className="plat-commissions-slip__lifecycle"
                    aria-label="Invoice lifecycle"
                  >
                    {slipLifecycleSteps(slip.payoutStatus).map(
                      (step, i, arr) => {
                        const next = arr[i + 1];
                        const arrowTone =
                          step.state === "done" && next?.state === "done"
                            ? "is-done"
                            : (step.state === "done" &&
                                  next?.state === "current") ||
                                (step.state === "current" &&
                                  next?.state === "todo")
                              ? "is-flowing"
                              : "is-idle";
                        return (
                          <li
                            key={step.id}
                            className={`plat-commissions-slip__life-step is-${step.state}`}
                            style={
                              {
                                "--step-delay": `${i * 90}ms`,
                              } as CSSProperties
                            }
                          >
                            <span className="plat-commissions-slip__life-dot" />
                            <span className="plat-commissions-slip__life-label">
                              {step.label}
                            </span>
                            {next ? (
                              <span
                                className={`plat-commissions-slip__life-arrow ${arrowTone}`}
                                aria-hidden
                              >
                                <span className="plat-commissions-slip__life-chevron">
                                  &gt;
                                </span>
                                <span className="plat-commissions-slip__life-chevron">
                                  &gt;
                                </span>
                                <span className="plat-commissions-slip__life-chevron">
                                  &gt;
                                </span>
                              </span>
                            ) : null}
                          </li>
                        );
                      },
                    )}
                  </ol>
                </div>

                <dl className="plat-commissions-slip__facts">
                  <div>
                    <dt>Rate</dt>
                    <dd>{slip.commissionPercent}%</dd>
                  </div>
                  <div>
                    <dt>Platform fees</dt>
                    <dd>
                      <FundAmount amount={slip.platformFeeCollected} />
                    </dd>
                  </div>
                  <div>
                    <dt>Period</dt>
                    <dd>{formatCommissionPeriodLabel(slip.periodKey)}</dd>
                  </div>
                </dl>
              </section>

              {dest?.address ? (
                <section className="plat-commissions-slip__pay">
                  <div className="plat-commissions-slip__qr-wrap">
                    <img
                      src={qrUrl(qrPayload)}
                      alt="Commission remittance QR"
                      width={148}
                      height={148}
                    />
                    <p className="plat-commissions-slip__asset">
                      <span className="plat-commissions-slip__asset-icons">
                        <AssetIcon asset={dest.asset} />
                        <NetworkIcon network={dest.network} />
                      </span>
                      <span className="plat-commissions-slip__asset-text">
                        <span>{dest.asset}</span>
                        <span aria-hidden>·</span>
                        <span>{dest.network}</span>
                      </span>
                    </p>
                  </div>
                  <div className="plat-commissions-slip__dest">
                    <div className="plat-commissions-slip__field">
                      <span className="plat-commissions-slip__label">
                        Payout address
                      </span>
                      <CopyableChainValue
                        className="plat-commissions-slip__chain"
                        value={dest.address}
                        network={remittanceNetwork({ network: dest.network })}
                        kind="address"
                      />
                    </div>
                    <div className="plat-commissions-slip__field">
                      <span className="plat-commissions-slip__label">
                        Tx hash
                      </span>
                      <CopyableChainValue
                        className="plat-commissions-slip__chain"
                        value={slip.txRef}
                        network={remittanceNetwork(slip)}
                        kind="tx"
                      />
                    </div>
                    {slip.note?.trim() ? (
                      <div className="plat-commissions-slip__field">
                        <span className="plat-commissions-slip__label">
                          Note
                        </span>
                        <p className="plat-commissions-slip__note">
                          {slip.note.trim()}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : (
                <p className="banner banner-warn">{missingAddressHint}</p>
              )}

              {slip.payoutStatus === "paid" ? (
                <p className="plat-commissions-slip__paid-meta">
                  Awaiting confirm
                  {slip.paidAt
                    ? ` · ${new Date(slip.paidAt).toLocaleString()}`
                    : ""}
                </p>
              ) : slip.payoutStatus === "settled" && slip.settledAt ? (
                <p className="plat-commissions-slip__paid-meta">
                  Settled · {new Date(slip.settledAt).toLocaleString()}
                </p>
              ) : slip.paidAt ? (
                <p className="plat-commissions-slip__paid-meta">
                  Paid · {new Date(slip.paidAt).toLocaleString()}
                </p>
              ) : null}

              {payable ? (
                <div className="plat-commissions-slip__confirm no-print">
                  <label className="plat-commissions-slip__confirm-note">
                    <span className="plat-commissions-slip__label">
                      Note{" "}
                      <span className="plat-commissions-slip__optional">
                        (required)
                      </span>
                    </span>
                    <textarea
                      className="field-control plat-commissions-slip__note-input"
                      value={paidNote}
                      onChange={(e) => onPaidNoteChange(e.target.value)}
                      rows={2}
                      maxLength={2000}
                      placeholder="Payment reference or ops note"
                    />
                  </label>
                  <div className="plat-commissions-slip__confirm-row">
                    <button
                      type="button"
                      className="btn-primary plat-commissions-slip__confirm-btn"
                      disabled={busy || !paidNote.trim() || !dest?.address}
                      onClick={onConfirmPay}
                    >
                      {busy ? "Saving…" : "Confirm & pay"}
                    </button>
                  </div>
                </div>
              ) : null}

              {canConfirmReceipt && slip.payoutStatus === "paid" ? (
                <div className="plat-commissions-slip__confirm no-print">
                  <div className="plat-commissions-slip__confirm-row">
                    <button
                      type="button"
                      className="btn-primary plat-commissions-slip__confirm-btn"
                      disabled={busy}
                      onClick={onConfirmReceipt}
                    >
                      {busy ? "Confirming…" : "Confirm receipt"}
                    </button>
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
