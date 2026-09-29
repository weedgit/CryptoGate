import { Navigate, useMatch } from "react-router-dom";
import { merchantRoute } from "../shared/portalRouting";
import type { Session } from "./api";
import { OrderDetailPage } from "./OrderDetailPage";
import { OrdersListPage } from "./OrdersListPage";

type Props = {
  session: Session;
};

/** Orders area — `/merchant/orders/new` is kept as an alias for the Charge terminal. */
export function MerchantOrdersRoutes({ session }: Props) {
  const createMatch = useMatch({ path: merchantRoute("orders/new"), end: true });
  const detailMatch = useMatch({
    path: `${merchantRoute("orders")}/:orderId`,
    end: true,
  });
  const orderId = detailMatch?.params?.orderId;

  if (createMatch) {
    return <Navigate to={merchantRoute("charge")} replace />;
  }
  if (orderId != null) {
    return <OrderDetailPage session={session} orderId={orderId} />;
  }
  return <OrdersListPage session={session} />;
}
