import { fortnoxRequest } from "./api.js";

/**
 * Voucher row as returned by the Fortnox API.
 * Removed rows are corrections that Fortnox keeps on the voucher but strikes out;
 * they do not count towards the booked amounts.
 */
export interface FortnoxVoucherRow {
  Account: number;
  Debit?: number;
  Credit?: number;
  Description?: string;
  CostCenter?: string;
  Project?: string;
  Removed?: boolean;
}

export interface FortnoxVoucher {
  VoucherSeries: string;
  VoucherNumber: number;
  Year: number;
  Description: string;
  TransactionDate: string;
  VoucherRows?: FortnoxVoucherRow[];
  "@url"?: string;
}

export interface FortnoxVoucherListItem {
  VoucherSeries: string;
  VoucherNumber: number;
  Year?: number;
  Description: string;
  TransactionDate: string;
  "@url"?: string;
}

interface VoucherResponse {
  Voucher: FortnoxVoucher;
}

export interface VoucherRowOutput {
  account_number: number;
  debit: number;
  credit: number;
  description: string | null;
  cost_center: string | null;
  project: string | null;
  removed: boolean;
}

export function mapVoucherRow(row: FortnoxVoucherRow): VoucherRowOutput {
  return {
    account_number: row.Account,
    debit: row.Debit || 0,
    credit: row.Credit || 0,
    description: row.Description || null,
    cost_center: row.CostCenter || null,
    project: row.Project || null,
    removed: row.Removed === true
  };
}

/** Rows that count towards totals: active rows, plus removed rows when asked for */
export function countedRows<T extends { Removed?: boolean }>(rows: T[], includeRemoved: boolean): T[] {
  return includeRemoved ? rows : rows.filter((row) => row.Removed !== true);
}

export interface VoucherTotals {
  total_debit: number;
  total_credit: number;
  balanced: boolean;
  removed_row_count: number;
  includes_removed_rows: boolean;
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Sum a voucher's rows. Removed rows are left out unless includeRemoved is set.
 * `balanced` always describes the active rows, since only those must balance.
 */
export function summarizeVoucherRows(rows: FortnoxVoucherRow[], includeRemoved = false): VoucherTotals {
  const sum = (items: FortnoxVoucherRow[], key: "Debit" | "Credit") =>
    roundCents(items.reduce((total, row) => total + (row[key] || 0), 0));

  const active = countedRows(rows, false);
  const counted = countedRows(rows, includeRemoved);
  return {
    total_debit: sum(counted, "Debit"),
    total_credit: sum(counted, "Credit"),
    balanced: sum(active, "Debit") === sum(active, "Credit"),
    removed_row_count: rows.length - active.length,
    includes_removed_rows: includeRemoved
  };
}

export function unbalancedWarning(voucher: Pick<FortnoxVoucher, "VoucherSeries" | "VoucherNumber">, totals: VoucherTotals): string | null {
  if (totals.balanced) return null;
  return `Voucher ${voucher.VoucherSeries}${voucher.VoucherNumber}: active rows do not balance. ` +
    `Check the voucher in Fortnox; the API may have returned incomplete rows.`;
}

export interface VoucherFetchFailure {
  voucher_series: string;
  voucher_number: number;
  error: string;
}

export interface VoucherDetailsResult {
  vouchers: FortnoxVoucher[];
  failures: VoucherFetchFailure[];
}

/**
 * Fetch full details (with rows) for each voucher in a list.
 *
 * Requests go through the shared rate limiter in api.ts, which also retries 429s, so
 * running a few in parallel is safe. A voucher that still fails is reported in
 * `failures` rather than silently dropped, so callers can tell the scan is incomplete.
 */
export async function fetchVoucherDetails(
  list: FortnoxVoucherListItem[],
  financialYear: number | undefined,
  concurrency = 5
): Promise<VoucherDetailsResult> {
  const vouchers: Array<FortnoxVoucher | undefined> = new Array(list.length);
  const failures: VoucherFetchFailure[] = [];
  let next = 0;

  const worker = async () => {
    while (next < list.length) {
      const index = next++;
      const item = list[index];
      try {
        const detail = await fortnoxRequest<VoucherResponse>(
          `/3/vouchers/${encodeURIComponent(item.VoucherSeries)}/${item.VoucherNumber}`,
          "GET",
          undefined,
          { financialyear: item.Year ?? financialYear }
        );
        vouchers[index] = detail.Voucher;
      } catch (error) {
        failures.push({
          voucher_series: item.VoucherSeries,
          voucher_number: item.VoucherNumber,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
  return {
    vouchers: vouchers.filter((v): v is FortnoxVoucher => v !== undefined),
    failures
  };
}

export function failureWarning(failures: VoucherFetchFailure[]): string | null {
  if (failures.length === 0) return null;
  const sample = failures.slice(0, 5).map((f) => `${f.voucher_series}${f.voucher_number}`).join(", ");
  return `${failures.length} voucher(s) could not be fetched (${sample}${failures.length > 5 ? ", ..." : ""}); ` +
    `results may be incomplete. First error: ${failures[0].error}`;
}
