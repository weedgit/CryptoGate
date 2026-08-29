import { useNavigate } from "react-router-dom";
import type { Session } from "./api";
import { CreateOrderModal } from "./CreateOrderModal";
import { OrdersListPage } from "./OrdersListPage";

type Props = {
  session: Session;
  showCreateModal?: boolean;
};

/** Orders list with optional create-order modal overlay (`/merchant/orders/new`). */
export function MerchantOrdersRoutes({
  session,
  showCreateModal = false,
}: Props) {
  const navigate = useNavigate();

  return (
    <>
      <OrdersListPage session={session} />
      {showCreateModal ? (
        <CreateOrderModal onClose={() => navigate("/merchant/orders")} />
      ) : null}
    </>
  );
}
