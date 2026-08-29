import { merchantReferenceFromMetadata } from "./order-map.mjs";

function iso(value) {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Neutralize formula injection for spreadsheet clients.
 * @param {unknown} value
 */
export function csvCell(value) {
  if (value == null || value === "") return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export const ORDER_CSV_HEADERS = [
  "id",
  "order_number",
  "org_id",
  "org_name",
  "merchant_reference",
  "status",
  "matching_mode",
  "payable_amount",
  "received_amount",
  "receive_address",
  "address_source",
  "hd_index",
  "memo_or_tag",
  "asset",
  "network",
  "expires_at",
  "created_at",
  "created_by",
  "created_by_email",
];

/**
 * @param {object} row — payment_orders row
 * @returns {string[]}
 */
export function paymentOrderCsvFields(row) {
  return [
    row.id,
    row.order_number,
    row.org_id,
    row.org_name ?? "",
    merchantReferenceFromMetadata(row.merchant_metadata) ?? "",
    row.status,
    row.matching_mode,
    row.payable_amount,
    row.received_amount ?? "",
    row.receive_address,
    row.address_source,
    row.hd_index == null ? "" : String(row.hd_index),
    row.memo_or_tag ?? "",
    row.asset,
    row.network,
    iso(row.expires_at),
    iso(row.created_at),
    row.created_by ?? "",
    row.creator_email ?? "",
  ];
}

/**
 * @param {object[]} rows
 */
export function paymentOrdersToCsv(rows) {
  const lines = [ORDER_CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(paymentOrderCsvFields(row).map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
