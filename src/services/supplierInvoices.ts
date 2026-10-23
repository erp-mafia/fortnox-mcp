/**
 * The supplier invoice endpoints return several numeric and boolean fields as strings
 * ("Balance": "0", "Total": "411.31", "Credit": "false"), and the list endpoint names
 * the cancelled flag "Cancel" instead of "Cancelled". Comparing or summing the raw
 * values silently gives wrong results ("0" !== 0, "0" + "411.31" === "0411.31"), so
 * every supplier invoice is normalized right after it is fetched.
 */

const NUMERIC_FIELDS = ["Total", "Balance", "VAT", "RoundOffValue", "CurrencyRate", "Freight", "AdministrationFee"] as const;
const BOOLEAN_FIELDS = ["Booked", "Cancelled", "Credit", "PaymentPending", "DisablePaymentFile"] as const;

function toNumber(value: unknown): unknown {
  if (typeof value !== "string" || value.trim() === "") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value;
}

function toBoolean(value: unknown): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
}

export function normalizeSupplierInvoice<T extends object>(invoice: T): T {
  const raw = invoice as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...raw };

  if (normalized.Cancelled === undefined && raw.Cancel !== undefined) {
    normalized.Cancelled = raw.Cancel;
  }
  for (const field of NUMERIC_FIELDS) {
    if (field in normalized) normalized[field] = toNumber(normalized[field]);
  }
  for (const field of BOOLEAN_FIELDS) {
    if (field in normalized) normalized[field] = toBoolean(normalized[field]);
  }
  if (Array.isArray(raw.SupplierInvoiceRows)) {
    normalized.SupplierInvoiceRows = raw.SupplierInvoiceRows.map((row: Record<string, unknown>) => ({
      ...row,
      Debit: toNumber(row.Debit),
      Credit: toNumber(row.Credit),
      Total: toNumber(row.Total),
      Price: toNumber(row.Price),
      Quantity: toNumber(row.Quantity)
    }));
  }
  return normalized as T;
}

export interface SupplierInvoiceStatusFields {
  Balance?: number;
  Booked?: boolean;
  Cancelled?: boolean;
}

/**
 * Status of a normalized supplier invoice: cancelled, paid, draft (not booked) or unpaid
 */
export function getSupplierInvoiceStatus(inv: SupplierInvoiceStatusFields): "cancelled" | "paid" | "draft" | "unpaid" {
  if (inv.Cancelled) return "cancelled";
  if ((inv.Balance || 0) === 0) return "paid";
  if (!inv.Booked) return "draft";
  return "unpaid";
}
