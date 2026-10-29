-- M5 (review 2026-10-29): one transaction can pay several watched addresses (e.g. an exchange
-- batch withdrawal to two HD addresses). Uniqueness was (network, tx_hash), so only one of
-- those orders could ever be credited. Make it per destination address.
DROP INDEX IF EXISTS payment_orders_network_tx_hash_idx;

CREATE UNIQUE INDEX IF NOT EXISTS payment_orders_network_tx_hash_address_idx
  ON payment_orders (network, tx_hash, receive_address)
  WHERE tx_hash IS NOT NULL;
