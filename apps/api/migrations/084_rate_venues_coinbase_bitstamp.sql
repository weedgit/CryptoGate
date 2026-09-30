-- Two more free USD venues so one outage cannot stop USDT market quotes.

ALTER TABLE platform_pricing_settings
  ALTER COLUMN rate_venues SET DEFAULT ARRAY['binance','coingecko','kraken','coinbase','bitstamp'];

-- Only rows still on the previous default; a hand-picked venue list is left alone.
UPDATE platform_pricing_settings
SET rate_venues = ARRAY['binance','coingecko','kraken','coinbase','bitstamp'],
    updated_at = now()
WHERE rate_venues @> ARRAY['binance','coingecko','kraken']
  AND cardinality(rate_venues) = 3;
