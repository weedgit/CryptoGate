import { mkdir, unlink, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { getPool } from "../db/pool.mjs";
import {
  ORDER_CSV_HEADERS,
  csvCell,
  paymentOrderCsvFields,
} from "./order-csv.mjs";
import { listPaymentOrders } from "./order-store.mjs";

export const INVOICE_EXPORT_MAX_ROWS = 100_000;
export const INVOICE_EXPORT_PAGE = 500;
export const INVOICE_EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @returns {string}
 */
export function invoiceExportDir() {
  return (
    process.env.PAYMENTGATE_EXPORT_DIR?.trim() ||
    path.join(process.cwd(), ".data", "exports")
  );
}

/**
 * @param {string} jobId
 */
export function invoiceExportFilePath(jobId) {
  return path.join(invoiceExportDir(), `${jobId}.csv`);
}

/**
 * @param {string} userId
 * @param {Record<string, unknown>} filters
 * @param {Record<string, unknown>} listQuery
 */
export async function createInvoiceExportJob(userId, filters, listQuery) {
  const expiresAt = new Date(Date.now() + INVOICE_EXPORT_TTL_MS);
  const { rows } = await getPool().query(
    `INSERT INTO invoice_export_jobs (
       requested_by, filters, list_query, status, expires_at
     ) VALUES ($1, $2::jsonb, $3::jsonb, 'queued', $4)
     RETURNING id, status, created_at, expires_at`,
    [userId, JSON.stringify(filters), JSON.stringify(listQuery), expiresAt],
  );
  return rows[0];
}

/**
 * @param {string} id
 */
export async function findInvoiceExportJob(id) {
  const { rows } = await getPool().query(
    `SELECT * FROM invoice_export_jobs WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/**
 * Claim next queued job.
 */
export async function claimNextInvoiceExportJob() {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT id FROM invoice_export_jobs
       WHERE status = 'queued'
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
    );
    if (rows.length === 0) {
      await client.query("COMMIT");
      return null;
    }
    const id = rows[0].id;
    const upd = await client.query(
      `UPDATE invoice_export_jobs
       SET status = 'running'
       WHERE id = $1
       RETURNING *`,
      [id],
    );
    await client.query("COMMIT");
    return upd.rows[0] ?? null;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {string} id
 * @param {{ status: string, totalRows?: number | null, fileName?: string | null, error?: string | null }} patch
 */
export async function updateInvoiceExportJob(id, patch) {
  const { rows } = await getPool().query(
    `UPDATE invoice_export_jobs
     SET status = $2,
         total_rows = COALESCE($3, total_rows),
         file_name = COALESCE($4, file_name),
         error = $5,
         ready_at = CASE WHEN $2 = 'ready' THEN now() ELSE ready_at END
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.status,
      patch.totalRows ?? null,
      patch.fileName ?? null,
      patch.error ?? null,
    ],
  );
  return rows[0] ?? null;
}

/**
 * Expire old ready/failed jobs and delete files.
 */
export async function expireInvoiceExportJobs() {
  const { rows } = await getPool().query(
    `UPDATE invoice_export_jobs
     SET status = 'expired'
     WHERE status IN ('ready', 'failed')
       AND expires_at < now()
       AND status <> 'expired'
     RETURNING id, file_name`,
  );
  for (const row of rows) {
    if (!row.file_name) continue;
    try {
      await unlink(path.join(invoiceExportDir(), row.file_name));
    } catch {
      // ignore missing
    }
  }
  return rows.length;
}

/**
 * Run one claimed job: page listPaymentOrders into a CSV file.
 * @param {object} job
 */
export async function processInvoiceExportJob(job) {
  const listQuery = job.list_query ?? {};
  await mkdir(invoiceExportDir(), { recursive: true });
  const fileName = `${job.id}.csv`;
  const filePath = path.join(invoiceExportDir(), fileName);

  try {
    const first = await listPaymentOrders({
      ...listQuery,
      limit: INVOICE_EXPORT_PAGE,
      offset: 0,
    });
    if (first.total > INVOICE_EXPORT_MAX_ROWS) {
      await updateInvoiceExportJob(job.id, {
        status: "failed",
        totalRows: first.total,
        error: `Too many rows for export (max ${INVOICE_EXPORT_MAX_ROWS}). Narrow filters.`,
      });
      return;
    }

    const lines = [ORDER_CSV_HEADERS.map(csvCell).join(",")];
    let offset = 0;
    let written = 0;
    let page = first;
    for (;;) {
      for (const row of page.rows) {
        lines.push(paymentOrderCsvFields(row).map(csvCell).join(","));
        written += 1;
      }
      offset += page.rows.length;
      if (page.rows.length === 0 || offset >= page.total) break;
      page = await listPaymentOrders({
        ...listQuery,
        limit: INVOICE_EXPORT_PAGE,
        offset,
      });
    }

    await writeFile(filePath, `${lines.join("\r\n")}\r\n`, "utf8");
    await updateInvoiceExportJob(job.id, {
      status: "ready",
      totalRows: written,
      fileName,
      error: null,
    });
  } catch (err) {
    await updateInvoiceExportJob(job.id, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await unlink(filePath);
    } catch {
      // ignore
    }
  }
}

/**
 * @param {string} jobId
 * @param {string} fileName
 */
export async function invoiceExportFileExists(jobId, fileName) {
  const p = path.join(invoiceExportDir(), fileName || `${jobId}.csv`);
  try {
    await access(p);
    return p;
  } catch {
    return null;
  }
}

/**
 * Public job JSON.
 * @param {object} row
 */
export function toInvoiceExportJob(row) {
  return {
    id: row.id,
    status: row.status,
    totalRows: row.total_rows ?? null,
    error: row.error ?? null,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    readyAt:
      row.ready_at instanceof Date
        ? row.ready_at.toISOString()
        : row.ready_at ?? null,
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : row.expires_at,
  };
}
