/**
 * Synthetic fixtures. Field names, types and quirks follow what the Fortnox API
 * actually returns (string amounts on supplier invoices, Removed flags on voucher
 * rows, the SIE record layout); all names, numbers and amounts are made up.
 */

/** GET /3/vouchers/D/42?financialyear=3: a supplier invoice voucher whose 4010 row was corrected to 4020 */
export const correctedVoucher = {
  Voucher: {
    "@url": "https://api.fortnox.se/3/vouchers/D/42?financialyear=3",
    Comments: null,
    CostCenter: "",
    Description: "Levfakt Example Labels Lda (1002)",
    Project: "",
    ReferenceNumber: "1002",
    ReferenceType: "SUPPLIERINVOICE",
    TransactionDate: "2025-03-05",
    VoucherNumber: 42,
    VoucherSeries: "D",
    Year: 3,
    ApprovalState: 0,
    VoucherRows: [
      { Account: 2440, CostCenter: "", Credit: 1000, Description: "Leverantörsskulder", Debit: 0, Project: "", Removed: false, TransactionInformation: "", Quantity: 0 },
      { Account: 2645, CostCenter: "", Credit: 0, Description: "Beräknad ingående moms på förvärv från utlandet", Debit: 250, Project: "", Removed: false, TransactionInformation: "", Quantity: 0 },
      { Account: 2616, CostCenter: "", Credit: 250, Description: "Utgående moms inköp varor inom EU, 25 %", Debit: 0, Project: "", Removed: false, TransactionInformation: "", Quantity: 0 },
      { Account: 4010, CostCenter: "", Credit: 0, Description: "Inköp material och varor", Debit: 1000, Project: "", Removed: true, TransactionInformation: "", Quantity: 0 },
      { Account: 4020, CostCenter: "", Credit: 0, Description: "Inköp varor", Debit: 1000, Project: "", Removed: false, TransactionInformation: "", Quantity: 0 }
    ]
  }
};

/** A voucher list item as returned by /3/vouchers and /3/vouchers/sublist/{series} */
export function voucherListItem(series: string, number: number, date: string, description: string, year = 4) {
  return {
    "@url": `https://api.fortnox.se/3/vouchers/${series}/${number}?financialyear=${year}`,
    Comments: null,
    Description: description,
    ReferenceNumber: "",
    ReferenceType: "SUPPLIERINVOICE",
    TransactionDate: date,
    VoucherNumber: number,
    VoucherSeries: series,
    Year: year,
    ApprovalState: 0
  };
}

/** Full voucher (detail endpoint) for a list item, with a simple balanced pair of rows */
export function voucherDetail(item: ReturnType<typeof voucherListItem>, amount = 100) {
  return {
    Voucher: {
      ...item,
      VoucherRows: [
        { Account: 2440, Credit: amount, Debit: 0, Description: "Leverantörsskulder", Removed: false },
        { Account: 4010, Credit: 0, Debit: amount, Description: "Inköp material och varor", Removed: false }
      ]
    }
  };
}

/** Supplier invoice list item: note the string amounts, string Credit and "Cancel" (not "Cancelled") */
export function supplierInvoiceListItem(givenNumber: string, balance: string, total: string, booked = true) {
  return {
    "@url": `https://api.fortnox.se/3/supplierinvoices/${givenNumber}`,
    Balance: balance,
    Booked: booked,
    Cancel: false,
    CostCenter: "",
    Credit: "false",
    Currency: "EUR",
    CurrencyRate: "11.1",
    CurrencyUnit: 1,
    DueDate: "2026-04-30",
    ExternalInvoiceNumber: "",
    ExternalInvoiceSeries: "",
    GivenNumber: givenNumber,
    InvoiceDate: "2026-04-01",
    InvoiceNumber: `PINV${givenNumber}`,
    Project: "",
    SupplierNumber: "1001",
    SupplierName: "Example Labels Lda",
    Total: total,
    AuthorizerName: null,
    FinalPayDate: "2026-04-30"
  };
}

/**
 * SIE 4 export for one financial year (GET /3/sie/4), encoded as Fortnox sends it (PC8 / CP437).
 * D 42 has a #BTRANS (removed) row and an #RTRANS (added) row repeated as #TRANS.
 */
export const sie4Text = [
  "#FLAGGA 0",
  "#FORMAT PC8",
  "#SIETYP 4",
  '#PROGRAM "Fortnox" 3.62.17',
  '#FNAMN "Example AB"',
  "#RAR 0 20240701 20250630",
  '#KONTO 2440 "Leverantörsskulder"',
  '#KONTO 2616 "Utgående moms inköp varor inom EU, 25 %"',
  '#KONTO 2645 "Beräknad ingående moms på förvärv från utlandet"',
  '#KONTO 4020 "Inköp varor"',
  '#KONTO 4010 "Inköp material och varor"',
  '#VER D 41 20250210 "Levfakt Example Labels Lda (1001)" 20250215',
  "{",
  '#TRANS 2440 {} -500 "" "" 0',
  '#TRANS 4010 {6 "5"} 500 "" "Material \\"tryck\\"" 0',
  "}",
  '#VER D 42 20250305 "Levfakt Example Labels Lda (1002)" 20250320',
  "{",
  '#TRANS 2440 {} -1000 "" "" 0',
  '#TRANS 2645 {} 250 "" "" 0',
  '#TRANS 2616 {} -250 "" "" 0',
  '#BTRANS 4010 {} 1000 "" "" 0 "Bokförare"',
  '#RTRANS 4020 {} 1000 "" "" 0 "Bokförare"',
  '#TRANS 4020 {} 1000 "" "" 0',
  "}",
  '#VER A 12 20250401 "Hyra april" 20250401',
  "{",
  '#TRANS 5010 {1 "100"} 2000 "" "" 0',
  '#TRANS 1930 {} -2000 "" "" 0',
  "}",
  ""
].join("\r\n");

const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀" +
  "αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

export function encodeCp437(text: string): Buffer {
  return Buffer.from(Array.from(text, (ch) => {
    const code = ch.charCodeAt(0);
    if (code < 0x80) return code;
    const index = CP437_HIGH.indexOf(ch);
    if (index === -1) throw new Error(`Cannot encode ${ch} as CP437`);
    return 0x80 + index;
  }));
}
