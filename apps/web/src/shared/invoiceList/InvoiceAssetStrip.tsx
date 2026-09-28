import { useCallback, useMemo } from "react";
import type { PaymentOrderListSummary } from "../../merchant/api";
import { AssetIcon } from "../../platform/cryptoIcons";

const INVOICE_ASSET_CARD_ASSETS = ["ETH", "TRX", "USDC", "USDT"] as const;

type Props = {
  byAsset: PaymentOrderListSummary["byAsset"];
};

export function InvoiceAssetStrip({ byAsset: summaryByAsset }: Props) {
  const formatPayable = useCallback((raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    return n.toLocaleString(undefined, {
      maximumFractionDigits: n >= 1000 ? 2 : 6,
    });
  }, []);

  const assetCardRows = useMemo(() => {
    const byAsset = new Map(
      summaryByAsset.map((row) => [row.asset, row.payableAmount] as const),
    );
    return INVOICE_ASSET_CARD_ASSETS.map((asset) => ({
      asset,
      payableAmount: byAsset.get(asset) ?? "0",
    }));
  }, [summaryByAsset]);

  return (
    <div className="invoice-list__asset-cards" role="status">
      {assetCardRows.map((row) => (
        <div className="invoice-list__asset-card" key={row.asset}>
          <AssetIcon asset={row.asset} />
          <span className="invoice-list__asset-card-code">{row.asset}</span>
          <span className="invoice-list__asset-card-amt">
            {formatPayable(row.payableAmount)}
          </span>
        </div>
      ))}
    </div>
  );
}
