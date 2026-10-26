import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { installFakeFortnox, startClient, callToolJson, json, type FakeFortnox } from "./helpers.js";
import { supplierInvoiceListItem } from "./fixtures.js";
import { CHARACTER_LIMIT } from "../src/constants.js";
import { normalizeSupplierInvoice, getSupplierInvoiceStatus } from "../src/services/supplierInvoices.js";

let client: Client;
let fake: FakeFortnox;

const invoices = [
  supplierInvoiceListItem("1000", "0", "150.25"),
  supplierInvoiceListItem("1002", "0", "2000"),
  supplierInvoiceListItem("1003", "300.75", "300.75"),
  supplierInvoiceListItem("1004", "120.5", "120.5", false),
  { ...supplierInvoiceListItem("1005", "50", "50"), Cancel: true }
];

before(async () => {
  client = await startClient();
  fake = installFakeFortnox([
    (req) => {
      if (req.path !== "/3/supplierinvoices") return undefined;
      const filtered = req.params.filter === "fullypaid"
        ? invoices.filter((i) => i.Balance === "0")
        : req.params.filter === "unpaid"
          ? invoices.filter((i) => i.Balance !== "0" && !i.Cancel)
          : invoices;
      return json({ SupplierInvoices: filtered, MetaInformation: { "@TotalResources": filtered.length, "@TotalPages": 1, "@CurrentPage": 1 } });
    }
  ]);
});

describe("supplier invoice status (issue 4)", () => {
  test("normalizes string amounts, string booleans and the Cancel field", () => {
    const inv = normalizeSupplierInvoice({ ...supplierInvoiceListItem("1", "0", "150.25"), Cancel: true });
    assert.equal(inv.Balance, 0);
    assert.equal(inv.Total, 150.25);
    assert.equal(inv.Credit, false);
    assert.equal((inv as any).Cancelled, true);
  });

  test("maps fully paid, unpaid, draft and cancelled invoices", async () => {
    const out = await callToolJson(client, "fortnox_list_supplier_invoices", { supplier_number: "1001", fetch_all: true });
    const statuses = Object.fromEntries(out.invoices.map((i: any) => [i.given_number, i.status]));
    assert.deepEqual(statuses, { "1000": "paid", "1002": "paid", "1003": "unpaid", "1004": "draft", "1005": "cancelled" });
    const paid = out.invoices.find((i: any) => i.given_number === "1000");
    assert.equal(paid.balance, 0);
    assert.equal(paid.total, 150.25);
  });

  test("the filter parameter is still passed to Fortnox", async () => {
    for (const filter of ["fullypaid", "unpaid"]) {
      fake.requests.length = 0;
      const out = await callToolJson(client, "fortnox_list_supplier_invoices", { filter });
      assert.equal(fake.requests[0].params.filter, filter);
      // Unpaid includes unbooked invoices, which are reported as drafts
      const expected = filter === "fullypaid" ? ["paid"] : ["unpaid", "draft"];
      assert.ok(out.invoices.length > 0);
      assert.ok(out.invoices.every((i: any) => expected.includes(i.status)), `${filter} -> ${expected}`);
    }
  });

  test("payables report sums balances as numbers", async () => {
    const out = await callToolJson(client, "fortnox_payables_report", {});
    assert.equal(out.summary.total_payable_balance, 300.75 + 120.5);
  });

  test("status helper handles normalized values", () => {
    assert.equal(getSupplierInvoiceStatus({ Balance: 0, Booked: true }), "paid");
    assert.equal(getSupplierInvoiceStatus({ Balance: 10, Booked: true }), "unpaid");
  });
});

describe("fortnox_get_supplier_invoice_files paging (item 2)", () => {
  const fileText = Array.from({ length: 3000 }, (_, i) => `${(i + 1) * 10} ART-${i} Example item ${i} 1.00 ${i} ${i}.00`).join("\n");

  before(() => {
    installFakeFortnox([
      (req) => (req.path === "/3/supplierinvoicefileconnections"
        ? json({ SupplierInvoiceFileConnections: [
          { FileId: "file-1", Name: "invoice.txt", SupplierInvoiceNumber: "1003", SupplierName: "Example Labels Lda" }
        ] })
        : undefined),
      (req) => (req.path === "/3/archive/file-1"
        ? { data: Buffer.from(fileText, "utf8"), headers: { "content-type": "text/plain" } }
        : undefined)
    ]);
  });

  test("text_offset and next_text_offset page through the whole text", async () => {
    const parts: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const out = await callToolJson(client, "fortnox_get_supplier_invoice_files", {
        given_number: "1003", file_id: "file-1", download: false, max_text_chars: 5000, text_offset: offset
      });
      const file = out.files[0];
      assert.equal(file.text_offset, offset);
      assert.equal(file.text_length, fileText.length);
      if (file.next_text_offset !== null) assert.ok(file.text.endsWith("\n"));
      parts.push(file.text);
      offset = file.next_text_offset;
    }
    assert.ok(parts.length > 1);
    assert.equal(parts.join(""), fileText);
  });

  test("the default response stays within the character limit", async () => {
    const result = await client.callTool({
      name: "fortnox_get_supplier_invoice_files",
      arguments: { given_number: "1003", download: false, response_format: "json" }
    });
    const text = (result.content as Array<{ text: string }>)[0].text;
    assert.ok(text.length <= CHARACTER_LIMIT, `${text.length} characters`);
    const out = JSON.parse(text);
    assert.ok(out.files[0].next_text_offset > 0);
  });
});
