-- Live market price history (median USD per asset) sampled by the rate refresh job,
-- so dashboard rate cards have a line before any order is quoted.

CREATE TABLE IF NOT EXISTS fx_rate_samples (
  asset TEXT NOT NULL,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rate NUMERIC NOT NULL CHECK (rate > 0),
  source TEXT NOT NULL,
  PRIMARY KEY (asset, sampled_at)
);
