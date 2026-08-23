#!/usr/bin/env node
/**
 * SQL migration runner for apps/api/migrations/*.sql
 * Path locked in Sprint 0: apps/api/migrations/
 *
 * Usage (from repo root or apps/api):
 *   node apps/api/scripts/migrate.mjs
 *   pnpm --filter @cryptogate/api migrate
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "migrations");

function requireDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required (see .env.example)");
    process.exit(1);
  }
  return url;
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function listMigrationFiles() {
  const names = await readdir(migrationsDir);
  return names
    .filter((n) => /^\d+_.+\.sql$/i.test(n))
    .sort((a, b) => a.localeCompare(b, "en"));
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function main() {
  const client = new pg.Client({ connectionString: requireDatabaseUrl() });
  await client.connect();
  try {
    await ensureMigrationsTable(client);
    const files = await listMigrationFiles();
    if (files.length === 0) {
      console.log("No migration files in apps/api/migrations/");
      return;
    }

    for (const file of files) {
      const id = file;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      const sum = checksum(sql);
      const { rows } = await client.query(
        "SELECT checksum FROM schema_migrations WHERE id = $1",
        [id],
      );
      const existing = rows[0];
      if (existing) {
        if (existing.checksum !== sum) {
          throw new Error(
            `Migration ${id} already applied but file checksum changed`,
          );
        }
        console.log(`skip  ${id}`);
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)",
          [id, sum],
        );
        await client.query("COMMIT");
        console.log(`apply ${id}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("migrations: ok");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
