import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { installFakeFortnox, startClient, callToolJson, json, type FakeRequest } from "./helpers.js";
import { correctedVoucher, voucherListItem, voucherDetail, sie4Text, encodeCp437 } from "./fixtures.js";

let client: Client;
before(async () => {
  client = await startClient();
});

describe("tools/list (issue 1)", () => {
  test("every tool advertises its input properties", async () => {
    const { tools } = await client.listTools();
    const empty = tools.filter((t) => Object.keys(t.inputSchema.properties ?? {}).length === 0).map((t) => t.name);
    assert.deepEqual(empty, []);
  });

  test("fortnox_account_activity advertises typed properties", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "fortnox_account_activity");
    const props = tool?.inputSchema.properties as Record<string, { type?: string }>;
    assert.equal(props.account_number.type, "integer");
    assert.equal(props.financial_year.type, "integer");
    assert.equal(props.account_range.type, "object");
    assert.equal(props.include_removed_rows.type, "boolean");
  });
});

describe("fortnox_get_voucher (issue 2)", () => {
  before(() => {
    installFakeFortnox([
      (req) => (req.path === "/3/vouchers/D/42" && req.params.financialyear === "3" ? json(correctedVoucher) : undefined)
    ]);
  });

  test("flags the removed row and leaves it out of the totals", async () => {
    const out = await callToolJson(client, "fortnox_get_voucher", { voucher_series: "D", voucher_number: 42, financial_year: 3 });
    const removed = out.rows.filter((r: any) => r.removed);
    assert.deepEqual(removed.map((r: any) => r.account_number), [4010]);
    assert.equal(out.totals.total_debit, 1250);
    assert.equal(out.totals.total_credit, 1250);
    assert.equal(out.totals.balanced, true);
    assert.equal(out.totals.removed_row_count, 1);
    assert.equal(out.warning, undefined);
  });

  test("include_removed_rows counts the removed row", async () => {
    const out = await callToolJson(client, "fortnox_get_voucher", {
      voucher_series: "D", voucher_number: 42, financial_year: 3, include_removed_rows: true
    });
    assert.equal(out.totals.total_debit, 2250);
    assert.equal(out.totals.balanced, true, "balance is judged on active rows");
  });

  test("warns when active rows do not balance", async () => {
    const broken = structuredClone(correctedVoucher);
    broken.Voucher.VoucherRows[3].Removed = false;
    installFakeFortnox([(req) => (req.path === "/3/vouchers/D/42" ? json(broken) : undefined)]);
    const out = await callToolJson(client, "fortnox_get_voucher", { voucher_series: "D", voucher_number: 42, financial_year: 3 });
    assert.equal(out.totals.balanced, false);
    assert.match(out.warning, /do not balance/);
  });
});

describe("fortnox_account_activity (issues 1 and 2)", () => {
  before(() => {
    installFakeFortnox([
      (req) => (req.path === "/3/sie/4" && req.params.financialyear === "3" ? { data: encodeCp437(sie4Text) } : undefined),
      (req) => (req.path === "/3/financialyears"
        ? json({ FinancialYears: [{ Id: 3, FromDate: "2024-07-01", ToDate: "2025-06-30" }, { Id: 4, FromDate: "2025-07-01", ToDate: "2026-06-30" }] })
        : undefined)
    ]);
  });

  test("accepts numeric arguments and leaves removed rows out by default", async () => {
    const out = await callToolJson(client, "fortnox_account_activity", { account_number: 4010, financial_year: 3 });
    assert.equal(out.source, "sie4");
    assert.equal(out.vouchers_scanned, 3);
    assert.deepEqual(out.transactions.map((t: any) => `${t.voucher_series}${t.voucher_number}`), ["D41"]);
    assert.equal(out.transactions[0].description, 'Material "tryck"');
    assert.equal(out.transactions[0].project, "5");
    assert.deepEqual(out.summary, [{ account: 4010, total_debit: 500, total_credit: 0, net_change: -500, transaction_count: 1 }]);
    assert.deepEqual(out.warnings, []);
  });

  test("include_removed_rows returns the struck-out D 42 row flagged as removed", async () => {
    const out = await callToolJson(client, "fortnox_account_activity", { account_number: 4010, financial_year: 3, include_removed_rows: true });
    const d42 = out.transactions.find((t: any) => t.voucher_series === "D" && t.voucher_number === 42);
    assert.ok(d42, "D 42 should be included");
    assert.equal(d42.removed, true);
    assert.equal(d42.debit, 1000);
    assert.equal(out.summary[0].total_debit, 1500);
  });

  test("account_range with a date range picks the financial year from the dates", async () => {
    const out = await callToolJson(client, "fortnox_account_activity", {
      account_range: { from: 4000, to: 4999 }, from_date: "2025-03-01", to_date: "2025-03-31"
    });
    assert.deepEqual(out.financial_years_read, [3]);
    assert.deepEqual(out.transactions.map((t: any) => [t.voucher_number, t.account]), [[42, 4020]]);
    assert.equal(out.transactions[0].description, "Inköp varor", "falls back to the account name");
  });

  test("requires an account filter", async () => {
    await assert.rejects(callToolJson(client, "fortnox_account_activity", { financial_year: 3 }), /at least one of/);
  });
});

describe("fortnox_search_vouchers (issue 3)", () => {
  // 60 vouchers in FY 4; three mention "Acme". The detail endpoint answers 429 to
  // the first request for every third voucher, as Fortnox does when bursts exceed its limit.
  const list = Array.from({ length: 60 }, (_, i) => {
    const n = i + 1;
    const supplier = n % 20 === 11 ? "Acme Example Lda" : `Supplier ${n}`;
    return voucherListItem("D", n, `2026-03-${String((n % 28) + 1).padStart(2, "0")}`, `Levfakt ${supplier} (${3000 + n})`);
  });
  const rateLimitedOnce = new Set<string>();

  const routes = [
    (req: FakeRequest) => {
      if (req.path !== "/3/vouchers" && req.path !== "/3/vouchers/sublist/D") return undefined;
      assert.equal(req.params.financialyear, "4");
      const limit = Number(req.params.limit ?? 100);
      const page = Number(req.params.page ?? 1);
      const items = list.slice((page - 1) * limit, page * limit);
      return json({ Vouchers: items, MetaInformation: { "@TotalResources": list.length, "@TotalPages": Math.ceil(list.length / limit), "@CurrentPage": page } });
    },
    (req: FakeRequest) => {
      const match = req.path.match(/^\/3\/vouchers\/D\/(\d+)$/);
      if (!match) return undefined;
      const n = Number(match[1]);
      if (n % 3 === 0 && !rateLimitedOnce.has(match[1])) {
        rateLimitedOnce.add(match[1]);
        return { status: 429, data: "Too Many Requests" };
      }
      return json(voucherDetail(list[n - 1]));
    }
  ];

  before(() => {
    installFakeFortnox(routes);
  });

  async function listVoucherMatches(args: Record<string, unknown>, text: string): Promise<string[]> {
    const out = await callToolJson(client, "fortnox_list_vouchers", { ...args, limit: 100 });
    return out.vouchers
      .filter((v: any) => v.description.toLowerCase().includes(text.toLowerCase()))
      .map((v: any) => `${v.voucher_series}${v.voucher_number}`)
      .sort();
  }

  for (const filter of [
    { financial_year: 4, voucher_series: "D" },
    { financial_year: 4, from_date: "2026-01-15", to_date: "2026-04-10" }
  ]) {
    test(`include_rows matches list_vouchers for ${JSON.stringify(filter)}`, async () => {
      rateLimitedOnce.clear();
      const expected = await listVoucherMatches(filter, "Acme");
      assert.equal(expected.length, 3);

      const out = await callToolJson(client, "fortnox_search_vouchers", { ...filter, search_text: "Acme", include_rows: true });
      const found = out.vouchers.map((v: any) => `${v.voucher_series}${v.voucher_number}`).sort();
      assert.deepEqual(found, expected);
      assert.equal(out.vouchers_scanned, 60);
      assert.deepEqual(out.voucher_fetch_failures, []);
      assert.ok(rateLimitedOnce.size > 0, "the fixture should have sent 429s");
      for (const v of out.vouchers) {
        assert.ok(v.rows.length > 0);
        assert.ok(v.rows.every((r: any) => r.removed === false));
      }
    });
  }

  test("a voucher whose details cannot be fetched is reported, and still matched on its list description", async () => {
    installFakeFortnox([
      routes[0],
      (req) => (req.path === "/3/vouchers/D/11" ? { status: 500, data: { ErrorInformation: { message: "boom" } } } : undefined),
      routes[1]
    ]);
    const out = await callToolJson(client, "fortnox_search_vouchers", {
      financial_year: 4, voucher_series: "D", search_text: "Acme", include_rows: true
    });
    assert.deepEqual(out.voucher_fetch_failures.map((f: any) => f.voucher_number), [11]);
    assert.match(out.warnings[0], /could not be fetched/);
    const d11 = out.vouchers.find((v: any) => v.voucher_number === 11);
    assert.equal(d11.rows, null);
    assert.equal(out.matching_count, 3);
    installFakeFortnox(routes);
  });
});
