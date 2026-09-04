/**
 * TRON Nile (testnet) HD wallet labels from Kevin UAT — real addresses, not placeholders.
 * Used by seed-kevin-uat.mjs and local payment testing.
 */
export const NILE_HD_WALLETS = {
  /** Platform service-bill remittance (Rx on invoices). */
  platform: "TQC9shK5PcXdma5UkizSrLq1L6tQqUsKL",
  /** Test payer — fund this wallet on Nile for cashier demos. */
  customer: "TKHT1GJK6PE5L2FLGQKWsXt4JYvNzTjYjE",
  customer1: "TACXiGMSoi7NM2vbii5FnyEMb8GtSxQqtY",
  /** Shared settlement / customer2 #6 — high USDT balance on Nile. */
  customer2: "TPQJjsofWLs38vU3n7T5jvGYHVirKGybuu",
  kevinMerchant2: "TRBapU5LUjFTT4fb25ZfiVKosMqNHsjGsK",
  kevinAgent: "TSrEUD6Mex9TzeRoBtvC3nfbALKrYWhxdV",
  kevinSubAgent: "TY8XcwMQfCeVB8b9rQXcaRrdwotwemWGft",
  kevinSingleMerchant: "TYd6TjtHUWebLkaHQaS9neSjLdFh1i7UKB",
  /** Kevin UAT expansion — customer HD slots #8–#14 (Nile). */
  customer8: "TY8r8dGG8uh1DJW6Jip524wFaqZKHF5mXu",
  customer9: "TEWs5k5vA6KPJinCxUJpSTTZCZ83BRX43w",
  customer10: "TW9qPPWGSeQW97tNXfpoBcsG6GEJCyraVx",
  customer11: "TGFZpqFazWWC4jy7L739mnjgxVK9buCRft",
  customer12: "TSp56noNNx3Sgf4JEk56XjCzfpvNSyjyRd",
  customer13: "TSc7eqPVvhcGrfsJ2hx8C94fUhYNoTRjPv",
  customer14: "TFFEnVZJ7jRAfZ2MvKbeWmuakGEHBKW41N",
  customer15: "TY46gkmssLS4tQ71roXhh1BazRnW5jdywh",
  customer16: "TWdWXbNEmQHA923Sy2r7tyPW84LpCvqhW5",
  customer17: "TFF1phE6HH3W9ez6vmq4bbKaLGKzQMMQR",
  customer18: "TA6owcoakgDi2RDb5HANcJuPz23SwwX7Te",
  customer19: "TEs5BnrLetZDY7wsx2CiFDmBAQZZM8UbB8",
  customer20: "TM83FpUkk78CRcX5C44MqhZKV9R4tVNPTX",
  customer21: "TT8LiQUSYPH9zyfQeafYXbnNkZfxE3q2HN",
  customer22: "TPbJwAfaWeQzWB9Lu23nqUWckdXfuhcmCU",
  customer23: "TWStmP9UX1CEhKLxAc98hBtoNJXG5xNHtR",
  customer24: "TFdPssAvqgQdJwRThBzwvVpEP2HurYYkjG",
  customer25: "TH5zfFvZzwdY9hNePEMt24MAWq7KvReVoR",
  customer26: "TMHCP2pC3tc1XjPAoggK7qxkJeEaCXPNse",
  customer27: "TW5612geK9r21dBVkQtcfiAGmVksvvN9N4",
  customer28: "TCo5MrMBRDGLhRhWE2gk92VRzSmZoBUykg",
  customer29: "TWsmJsRAv9rE7izwRqmp5LsSJoxjPxRexE",
  customer30: "TVbr2HDcmcLB8KmRFc5mLfVaNd7dum1nZv",
};

/** Wallets used as `from_address` on seeded completed orders (test payers). */
export const NILE_PAYER_WALLETS = [
  NILE_HD_WALLETS.customer,
  NILE_HD_WALLETS.customer1,
  NILE_HD_WALLETS.customer2,
  NILE_HD_WALLETS.customer13,
  NILE_HD_WALLETS.customer14,
  NILE_HD_WALLETS.customer29,
  NILE_HD_WALLETS.customer30,
];

export const UAT_SETTLEMENT = {
  asset: "USDT",
  network: "tron_nile",
};
