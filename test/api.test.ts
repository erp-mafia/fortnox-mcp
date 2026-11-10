import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { installFakeFortnox, startClient } from "./helpers.js";
import { RateLimiter, fortnoxRequest } from "../src/services/api.js";
import { decodeCp437, parseSie4 } from "../src/services/sie.js";
import { sie4Text, encodeCp437 } from "./fixtures.js";

describe("RateLimiter (issue 5)", () => {
  test("concurrent callers never exceed the limit within a window", async () => {
    const limiter = new RateLimiter(3, 200, 0);
    const starts: number[] = [];
    await Promise.all(Array.from({ length: 9 }, async () => {
      await limiter.acquire();
      starts.push(Date.now());
    }));
    starts.sort((a, b) => a - b);
    for (let i = 3; i < starts.length; i++) {
      // allow a few ms of timer jitter
      assert.ok(starts[i] - starts[i - 3] >= 195, `request ${i} started ${starts[i] - starts[i - 3]}ms after request ${i - 3}`);
    }
  });
});

describe("HTTP 429 handling (issue 5)", () => {
  before(async () => {
    await startClient();
  });

  test("retries until Fortnox stops rate limiting", async () => {
    let calls = 0;
    installFakeFortnox([
      (req) => {
        if (req.path !== "/3/companyinformation") return undefined;
        calls++;
        return calls <= 2 ? { status: 429, data: "Too Many Requests" } : { data: { CompanyInformation: { CompanyName: "Example AB" } } };
      }
    ]);
    const res = await fortnoxRequest<any>("/3/companyinformation");
    assert.equal(res.CompanyInformation.CompanyName, "Example AB");
    assert.equal(calls, 3);
  });

  test("gives up with a rate limit error after the retries are used", async () => {
    installFakeFortnox([(req) => (req.path === "/3/companyinformation" ? { status: 429, data: "Too Many Requests" } : undefined)]);
    await assert.rejects(fortnoxRequest("/3/companyinformation"), /Rate limit exceeded/);
  });

  test("reports a missing OAuth scope clearly", async () => {
    installFakeFortnox([
      () => ({ status: 400, data: { ErrorInformation: { error: 1, message: "Har inte behörighet för scope.", code: 2000663 } } })
    ]);
    await assert.rejects(fortnoxRequest("/3/supplierinvoicefileconnections"), /Missing OAuth scope.*re-authorize/);
  });
});

describe("SIE 4 parsing", () => {
  test("decodes PC8 (CP437) text", () => {
    assert.equal(decodeCp437(encodeCp437("Leverantörsskulder åäö ÅÄÖ")), "Leverantörsskulder åäö ÅÄÖ");
  });

  test("reads vouchers, removed rows, dimensions and escaped quotes", () => {
    const sie = parseSie4(decodeCp437(encodeCp437(sie4Text)));
    assert.equal(sie.vouchers.length, 3);
    assert.equal(sie.accountNames.get(2440), "Leverantörsskulder");

    const d42 = sie.vouchers.find((v) => v.series === "D" && v.number === 42)!;
    assert.equal(d42.date, "2025-03-05");
    assert.equal(d42.text, "Levfakt Example Labels Lda (1002)");
    // #RTRANS is skipped because SIE repeats it as a #TRANS
    assert.deepEqual(d42.rows.map((r) => [r.account, r.amount, r.removed]), [
      [2440, -1000, false], [2645, 250, false], [2616, -250, false], [4010, 1000, true], [4020, 1000, false]
    ]);

    const d41 = sie.vouchers.find((v) => v.number === 41)!;
    assert.equal(d41.rows[1].project, "5");
    assert.equal(d41.rows[1].text, 'Material "tryck"');
    const a12 = sie.vouchers.find((v) => v.series === "A")!;
    assert.equal(a12.rows[0].cost_center, "100");
  });
});
