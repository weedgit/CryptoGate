-- Phase 1 rails are Ethereum, Tron (+ Nile testnet) and Solana only.
-- Remove every row tied to retired networks (Polygon, BNB Smart Chain, Arbitrum One,
-- Base, TON, Bitcoin) and the retired BTC asset. commission_payouts stays untouched:
-- payout slips are immutable history and always settle on Tron.

CREATE TEMP TABLE retired_networks (network TEXT PRIMARY KEY) ON COMMIT DROP;
INSERT INTO retired_networks (network)
VALUES ('polygon'), ('bnb_smart_chain'), ('arbitrum_one'), ('base'), ('ton'), ('bitcoin');

DELETE FROM payment_orders
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM hd_pool_addresses
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM merchant_xpubs
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM settlement_addresses
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM agent_payout_addresses
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM watcher_heartbeats
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM network_maintenance
 WHERE network IN (SELECT network FROM retired_networks);

DELETE FROM platform_network_rail_settings
 WHERE network IN (SELECT network FROM retired_networks);

DELETE FROM merchant_network_rail_settings
 WHERE network IN (SELECT network FROM retired_networks);

DELETE FROM platform_pair_rail_settings
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM platform_merchant_network_rail_settings
 WHERE network IN (SELECT network FROM retired_networks);

DELETE FROM platform_merchant_pair_rail_settings
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';

DELETE FROM platform_site_network_rail_settings
 WHERE network IN (SELECT network FROM retired_networks);

DELETE FROM platform_site_pair_rail_settings
 WHERE network IN (SELECT network FROM retired_networks) OR asset = 'BTC';
