import { useMatch, useNavigate } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import type { Session } from "./api";
import { CreateOrderModal } from "./CreateOrderModal";
import { OrderDetailPage } from "./OrderDetailPage";
import { OrdersListPage } from "./OrdersListPage";

type Props = {
  session: Session;
};

/**
 * Orders area — keep the list mounted when opening the create modal so the
 * background does not flash a loading state (`/merchant/orders/new`).
 */
export function MerchantOrdersRoutes({ session }: Props) {
  const navigate = useNavigate();
  const createMatch = useMatch({ path: merchantRoute("orders/new"), end: true });
  const detailMatch = useMatch({
    path: `${merchantRoute("orders")}/:orderId`,
    end: true,
  });
  const orderId = detailMatch?.params?.orderId;
  const isDetail = orderId != null && orderId !== "new";

  if (isDetail) {
    return <OrderDetailPage session={session} />;
  }

  return (
    <>
      <OrdersListPage session={session} />
      {createMatch ? (
        <CreateOrderModal onClose={() => navigate(merchantRoute("orders"))} />
      ) : null}
    </>
  );
}
