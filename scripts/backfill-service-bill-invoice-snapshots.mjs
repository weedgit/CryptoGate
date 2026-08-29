#!/usr/bin/env node
/**
 * Fill missing service-bill invoice snapshots (tier / volume_fee_percent / billed_volume_usd).
 * Does **not** rewrite subscription_amount, volume_fee_amount, or total_amount.
 *
 * Usage:
 *   node scripts/backfill-service-bill-invoice-snapshots.mjs --dry-run
 *   node scripts/backfill-service-bill-invoice-snapshots.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../apps/api/src/db/pool.mjs";
import { findMerchantCommercial } from "../apps/api/src/commercial/merchant-commercial-store.mjs";
import { listOrgsInSubtree } from "../apps/api/src/orgs/org-scope.mjs";
import { roundUsd } from "../apps/api/src/service-bills/generate-rules.mjs";
import { sumCompletedPayableVolume } from "../apps/api/src/service-bills/service-bill-store.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

function ymd(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Inclusive period dates → volume window used at generate/issue. */
function periodVolumeBounds(periodStart, periodEnd) {
  const start = ymd(periodStart);
  const end = ymd(periodEnd);
  const exclusive = new Date(`${end}T00:00:00.000Z`);
  exclusive.setUTCDate(exclusive.getUTCDate() + 1);
  return {
    inclusiveStartIso: `${start}T00:00:00.000Z`,
    exclusiveEndIso: exclusive.toISOString(),
  };
}

async function main() {
  loadEnv();
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgres://cryptogate:cryptogate@localhost:5432/cryptogate";
  }
  const dryRun = process.argv.includes("--dry-run");
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, org_id, period_start, period_end, tier, volume_fee_percent, billed_volume_usd, status
     FROM service_bills
     WHERE status <> 'voided'
       AND (
         tier IS NULL
         OR volume_fee_percent IS NULL
         OR billed_volume_usd IS NULL
       )
     ORDER BY period_start ASC, id ASC`,
  );

  let updated = 0;
  let skipped = 0;
  /** @type {{ id: string, reason: string }[]} */
  const skipReasons = [];

  for (const row of rows) {
    const needTier = row.tier == null;
    const needPercent = row.volume_fee_percent == null;
    const needVolume = row.billed_volume_usd == null;

    let tier = row.tier;
    let volumeFeePercent =
      row.volume_fee_percent != null ? String(row.volume_fee_percent) : null;
    let billedVolumeUsd =
      row.billed_volume_usd != null ? String(row.billed_volume_usd) : null;

    if (needTier || needPercent) {
      const commercial = await findMerchantCommercial(row.org_id);
      if (!commercial) {
        skipped += 1;
        skipReasons.push({ id: row.id, reason: "no_commercial" });
        continue;
      }
      if (needTier) tier = commercial.tier;
      if (needPercent) volumeFeePercent = String(commercial.volume_fee_percent);
    }

    if (needVolume) {
      const { inclusiveStartIso, exclusiveEndIso } = periodVolumeBounds(
        row.period_start,
        row.period_end,
      );
      const subtree = await listOrgsInSubtree([row.org_id]);
      const volumeOrgIds = subtree
        .filter((r) => r.type === "merchant" || r.type === "merchant_site")
        .map((r) => r.id);
      const volumeRaw = await sumCompletedPayableVolume(
        volumeOrgIds,
        inclusiveStartIso,
        exclusiveEndIso,
      );
      billedVolumeUsd = roundUsd(volumeRaw);
    }

    if (!needTier && !needPercent && !needVolume) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      updated += 1;
      console.log(
        JSON.stringify({
          dryRun: true,
          id: row.id,
          orgId: row.org_id,
          tier,
          volumeFeePercent,
          billedVolumeUsd,
        }),
      );
      continue;
    }

    await pool.query(
      `UPDATE service_bills
       SET tier = COALESCE(tier, $2),
           volume_fee_percent = COALESCE(volume_fee_percent, $3),
           billed_volume_usd = COALESCE(billed_volume_usd, $4),
           updated_at = now()
       WHERE id = $1`,
      [row.id, tier, volumeFeePercent, billedVolumeUsd],
    );
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        candidates: rows.length,
        updated,
        skipped,
        skipReasons: skipReasons.slice(0, 20),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => closePool());
