import { orderChannelLabel, type OrderChannelValue } from "./orderChannel";

type Props = {
  via: OrderChannelValue | null | undefined;
  className?: string;
};

export function OrderChannelTag({ via, className }: Props) {
  const key = via ?? "unknown";
  return (
    <span
      className={`order-channel-tag order-channel-tag--${key}${className ? ` ${className}` : ""}`}
      title={via ? `Created via ${orderChannelLabel(via)}` : "Channel not recorded"}
    >
      {orderChannelLabel(via)}
    </span>
  );
}
