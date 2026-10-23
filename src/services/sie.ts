import { fortnoxDownload, fortnoxRequest } from "./api.js";

/**
 * SIE 4 export support.
 *
 * GET /3/sie/4 returns every voucher and row of a financial year in one request,
 * which makes account-level queries complete and fast; fetching each voucher
 * separately is limited to ~5 vouchers/second by Fortnox's rate limit.
 *
 * Row records in a #VER block:
 *   #TRANS  - an active row
 *   #BTRANS - a removed row (struck out when the voucher was corrected)
 *   #RTRANS - an added row; SIE requires it to be repeated as a #TRANS, so it is skipped
 */

// IBM code page 437 ("PC8" in SIE) characters for bytes 0x80-0xFF
const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

export function decodeCp437(data: Buffer): string {
  let out = "";
  for (const byte of data) {
    out += byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80];
  }
  return out;
}

export interface SieRow {
  account: number;
  amount: number;
  cost_center: string | null;
  project: string | null;
  text: string | null;
  removed: boolean;
}

export interface SieVoucher {
  series: string;
  number: number;
  /** YYYY-MM-DD */
  date: string;
  text: string;
  rows: SieRow[];
}

export interface SieFile {
  accountNames: Map<number, string>;
  vouchers: SieVoucher[];
}

/** Split a SIE line into tokens: bare words, "quoted strings" (with \" escapes) and {...} groups */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === " " || ch === "\t") {
      i++;
    } else if (ch === '"') {
      let value = "";
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < line.length) i++;
        value += line[i++];
      }
      i++;
      tokens.push(value);
    } else if (ch === "{") {
      const end = line.indexOf("}", i);
      const stop = end === -1 ? line.length : end + 1;
      tokens.push(line.slice(i, stop));
      i = stop;
    } else {
      let value = "";
      while (i < line.length && line[i] !== " " && line[i] !== "\t") value += line[i++];
      tokens.push(value);
    }
  }
  return tokens;
}

/** Parse an object list like {1 "100" 6 "5"} into dimension -> object id */
function parseDimensions(group: string): Map<string, string> {
  const dims = new Map<string, string>();
  const inner = tokenize(group.replace(/^\{|\}$/g, ""));
  for (let i = 0; i + 1 < inner.length; i += 2) {
    dims.set(inner[i], inner[i + 1]);
  }
  return dims;
}

function sieDate(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function parseSie4(text: string): SieFile {
  const accountNames = new Map<number, string>();
  const vouchers: SieVoucher[] = [];
  let current: SieVoucher | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith("#")) continue;
    const tokens = tokenize(line);
    const label = tokens[0];

    if (label === "#KONTO") {
      accountNames.set(Number(tokens[1]), tokens[2] ?? "");
    } else if (label === "#VER") {
      current = {
        series: tokens[1],
        number: Number(tokens[2]),
        date: sieDate(tokens[3]),
        text: tokens[4] ?? "",
        rows: []
      };
      vouchers.push(current);
    } else if ((label === "#TRANS" || label === "#BTRANS") && current) {
      // #TRANS account {objects} amount [transdate] [transtext] [quantity] [sign]
      const dims = parseDimensions(tokens[2] ?? "{}");
      const rowText = tokens[5] ?? "";
      current.rows.push({
        account: Number(tokens[1]),
        amount: Number(tokens[3]),
        cost_center: dims.get("1") ?? null,
        project: dims.get("6") ?? null,
        text: rowText || null,
        removed: label === "#BTRANS"
      });
    }
  }

  return { accountNames, vouchers };
}

interface FinancialYear {
  Id: number;
  FromDate: string;
  ToDate: string;
}

interface FinancialYearsResponse {
  FinancialYears: FinancialYear[];
}

/**
 * Financial year IDs to read for a query: the given ID, the years overlapping the
 * date range, or (with neither) the current year, which Fortnox picks when no ID is sent.
 */
export async function resolveFinancialYears(
  financialYear: number | undefined,
  fromDate: string | undefined,
  toDate: string | undefined
): Promise<Array<number | undefined>> {
  if (financialYear !== undefined) return [financialYear];
  if (!fromDate && !toDate) return [undefined];

  const response = await fortnoxRequest<FinancialYearsResponse>("/3/financialyears");
  const from = fromDate ?? "0000-00-00";
  const to = toDate ?? "9999-99-99";
  const years = (response.FinancialYears || [])
    .filter((y) => y.FromDate <= to && y.ToDate >= from)
    .map((y) => y.Id)
    .sort((a, b) => a - b);
  return years.length > 0 ? years : [undefined];
}

export async function fetchSie4(financialYear: number | undefined): Promise<SieFile> {
  const file = await fortnoxDownload("/3/sie/4", { financialyear: financialYear });
  return parseSie4(decodeCp437(file.data));
}
