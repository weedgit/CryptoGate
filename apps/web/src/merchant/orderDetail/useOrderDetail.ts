import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  cancelOrder,
  getOnChain,
  getOrg,
  listOrgUsers,
  resolveOrderAnomaly,
  type OnChainDetails,
  type OrgAccount,
  type PaymentDetails,
  type PaymentOrder,
  type Session,
} from "../api";
import {
  getMerchantOrder,
  peekMerchantOrder,
  primeMerchantOrder,
} from "../merchantOrderDetail";
import {
  getMerchantOrderPayment,
  peekMerchantOrderPayment,
  primeMerchantOrderPayment,
} from "../merchantOrderPaymentDetails";
import { primaryMerchantOrgId } from "../org";
import { refreshMerchantAlerts } from "../merchantAlerts";
import { useOrderWebhookDeliveries } from "./useOrderWebhookDeliveries";

const ORDER_DETAIL_POLL_MS = 5000;

function isOpenOrderStatus(status: string | undefined | null): boolean {
  return status === "pending_payment" || status === "verifying";
}

type Options = {
  id: string | undefined;
  seededPay: PaymentDetails | undefined;
  session: Session;
  canViewWebhooks: boolean;
  orgId: string | null;
};

/** Order, payment, on-chain and seller data for one payment order, with live polling while open. */
export function useOrderDetail({
  id,
  seededPay,
  session,
  canViewWebhooks,
  orgId,
}: Options) {
  const [order, setOrder] = useState<PaymentOrder | null>(() =>
    id ? peekMerchantOrder(id) : null,
  );
  const [pay, setPay] = useState<PaymentDetails | null>(
    () => seededPay ?? (id ? peekMerchantOrderPayment(id) : null),
  );
  const [chain, setChain] = useState<OnChainDetails | null>(null);
  const [sellerOrg, setSellerOrg] = useState<OrgAccount | null>(null);
  const [sellerContactEmail, setSellerContactEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () =>
      !(
        id &&
        (peekMerchantOrder(id) || seededPay || peekMerchantOrderPayment(id))
      ),
  );
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedTx, setCopiedTx] = useState(false);
  const [nowTick, setNowTick] = useState(0);
  const [polling, setPolling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState("");

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const load = useCallback(async () => {
    if (!id) return;
    if (!peekMerchantOrder(id) && !seededPay && !peekMerchantOrderPayment(id)) {
      setLoading(true);
    }
    setError(null);
    try {
      const [o, p, c] = await Promise.all([
        getMerchantOrder(id),
        getMerchantOrderPayment(id).catch(() => null),
        getOnChain(id).catch(() => null),
      ]);
      primeMerchantOrder(id, o);
      setOrder(o);
      if (p) {
        primeMerchantOrderPayment(id, p);
        setPay(p);
      }
      setChain(c);

      const orderOrgId =
        o.orgId ?? primaryMerchantOrgId(sessionRef.current) ?? null;
      if (orderOrgId) {
        const siteOrMerchant = await getOrg(orderOrgId).catch(() => null);
        let seller: OrgAccount | null = siteOrMerchant;
        if (siteOrMerchant?.type === "merchant_site") {
          let walkId = siteOrMerchant.parentId;
          const seen = new Set<string>([siteOrMerchant.id]);
          while (walkId && !seen.has(walkId)) {
            seen.add(walkId);
            const row = await getOrg(walkId).catch(() => null);
            if (!row) break;
            if (row.type === "merchant") {
              seller = row;
              break;
            }
            if (row.type !== "merchant_site") break;
            walkId = row.parentId;
          }
        }
        setSellerOrg(seller);
        const sellerId = seller?.id ?? orderOrgId;
        const members = await listOrgUsers(sellerId).catch(() => []);
        const preferred =
          members.find((m) => /owner/i.test(m.role)) ??
          members.find((m) => /admin/i.test(m.role)) ??
          members[0];
        setSellerContactEmail(preferred?.email?.trim() || null);
      } else {
        setSellerOrg(null);
        setSellerContactEmail(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [id, seededPay]);

  /** Soft refresh — order/pay/on-chain only; no full-page loading flash. */
  const refreshLive = useCallback(async () => {
    if (!id) return;
    setPolling(true);
    try {
      const [o, p, c] = await Promise.all([
        getMerchantOrder(id, { force: true }),
        getMerchantOrderPayment(id, { force: true }).catch(() => null),
        getOnChain(id).catch(() => null),
      ]);
      primeMerchantOrder(id, o);
      setOrder(o);
      if (p) {
        primeMerchantOrderPayment(id, p);
        setPay(p);
      }
      setChain(c);
    } catch {
      /* keep last good snapshot while watching */
    } finally {
      setPolling(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const seeded = peekMerchantOrder(id);
    setOrder(seeded);
    if (!seededPay) {
      const cachedPay = peekMerchantOrderPayment(id);
      if (cachedPay) setPay(cachedPay);
    }
    if (!seeded && !seededPay && !peekMerchantOrderPayment(id)) setLoading(true);
  }, [id, seededPay]);

  useEffect(() => {
    void load();
  }, [load]);

  const webhooks = useOrderWebhookDeliveries(canViewWebhooks, orgId, order?.id);

  const liveStatus = order?.status ?? pay?.status;
  const watching = isOpenOrderStatus(liveStatus);

  useEffect(() => {
    if (!watching) return;
    const timer = window.setInterval(() => {
      void refreshLive();
    }, ORDER_DETAIL_POLL_MS);
    return () => window.clearInterval(timer);
  }, [watching, refreshLive]);

  useEffect(() => {
    if (!watching) return;
    const tick = window.setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => window.clearInterval(tick);
  }, [watching]);

  async function copyAddress() {
    const value = order?.receiveAddress ?? pay?.receiveAddress ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  async function copyTxHash() {
    const value = chain?.txHash?.trim() ?? "";
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedTx(true);
      window.setTimeout(() => setCopiedTx(false), 1600);
    } catch {
      setCopiedTx(false);
    }
  }

  async function onCancelOrder() {
    if (!order?.id || cancelling) return;
    const ok = window.confirm(
      `Cancel pending order #${order.orderNumber}? This frees the amount/memo slot for other cashiers.`,
    );
    if (!ok) return;
    setCancelling(true);
    setError(null);
    try {
      const updated = await cancelOrder(order.id);
      primeMerchantOrder(order.id, updated);
      setOrder(updated);
      const p = await getMerchantOrderPayment(order.id, { force: true }).catch(
        () => null,
      );
      if (p) {
        primeMerchantOrderPayment(order.id, p);
        setPay(p);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not cancel order",
      );
    } finally {
      setCancelling(false);
    }
  }

  async function onResolveAnomaly() {
    if (!order?.id || resolving) return;
    const note = resolveNote.trim();
    if (!note) {
      setError(
        "Add a short note describing what you checked (customer, amount, tx).",
      );
      return;
    }
    setResolving(true);
    setError(null);
    try {
      const updated = await resolveOrderAnomaly(order.id, note);
      primeMerchantOrder(order.id, updated);
      setOrder(updated);
      setResolveNote("");
      const p = await getMerchantOrderPayment(order.id, { force: true }).catch(
        () => null,
      );
      if (p) {
        primeMerchantOrderPayment(order.id, p);
        setPay(p);
      }
      void refreshMerchantAlerts(session);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Could not resolve — try again",
      );
    } finally {
      setResolving(false);
    }
  }

  return {
    order,
    pay,
    chain,
    sellerOrg,
    sellerContactEmail,
    loading,
    error,
    setError,
    copied,
    copiedTx,
    nowTick,
    polling,
    cancelling,
    resolving,
    resolveNote,
    setResolveNote,
    watching,
    webhooks,
    copyAddress,
    copyTxHash,
    onCancelOrder,
    onResolveAnomaly,
  };
}
