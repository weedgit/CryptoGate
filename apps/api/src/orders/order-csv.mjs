import { merchantReferenceFromMetadata } from "./order-map.mjs";

function iso(value) {
  if (value == null) return "";
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * Wall-clock `YYYY-MM-DD HH:mm:ss` in an IANA zone (spreadsheet-friendly).
 * @param {unknown} value
 * @param {string} timeZone
 */
export function localDateTime(value, timeZone) {
  if (value == null || value === "") return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
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
  "created_via",
];

/**
 * Headers plus a created-at column in the exporter's time zone (UTC columns stay ISO).
 * @param {string} [timeZone]
 */
export function orderCsvHeaders(timeZone = "UTC") {
  return [...ORDER_CSV_HEADERS, `created_at_local (${timeZone})`];
}

/**
 * @param {object} row — payment_orders row
 * @param {string} [timeZone] zone for the trailing local-time column
 * @returns {string[]}
 */
export function paymentOrderCsvFields(row, timeZone = "UTC") {
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
    row.created_via ?? "",
    localDateTime(row.created_at, timeZone),
  ];
}

/**
 * @param {object[]} rows
 * @param {string} [timeZone]
 */
export function paymentOrdersToCsv(rows, timeZone = "UTC") {
  const lines = [orderCsvHeaders(timeZone).map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(paymentOrderCsvFields(row, timeZone).map(csvCell).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
