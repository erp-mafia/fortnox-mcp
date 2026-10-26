import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { cleanPages, sliceTextAtLines } from "../src/services/fileText.js";

/**
 * A made-up 4-page invoice printed three times (ORIGINAL, DUPLICATE, TRIPLICATE),
 * shaped like real supplier PDFs: every page repeats a header and footer block,
 * each line item is followed by detail lines that repeat for every item.
 */
const PAGES_PER_COPY = 4;
const ITEMS_PER_PAGE = 5;

function itemLine(page: number, item: number): string {
  const row = (page * ITEMS_PER_PAGE + item + 1) * 10000;
  return `${row} ART-${page}${item} Woven label ${item + 1}x${page + 2}cm 0.1${item}00 ${100 * (item + 1)} ${(item + 1) * 10}.00`;
}

function invoicePage(copy: string, page: number): string {
  const lines = [
    "Acme Labels Ltd",
    "Invoice",
    copy,
    "Invoice No INV-0001",
    "VAT Reg No. XX123456789",
    "Bill To Example Buyer AB, Example Street 1, 100 00 Exampletown"
  ];
  if (page === 0) lines.push("Payment Terms 30 days net", "Due Date 01/01/2030");
  for (let item = 0; item < ITEMS_PER_PAGE; item++) {
    lines.push(itemLine(page, item), "Statement No 0000000000", "Country Of Origin XX");
  }
  lines.push(
    "Bank Example Bank IBAN XX00 0000 0000 0000 0000 0000",
    "Registered office Exampletown, registration no 000000",
    "Shipped to: Country A, Country B, Country C, Country D",
    `Page ${page + 1}`
  );
  return lines.join("\n");
}

const copies = ["ORIGINAL", "DUPLICATE", "TRIPLICATE"];
const pdfPages = copies.flatMap((copy) => Array.from({ length: PAGES_PER_COPY }, (_, page) => invoicePage(copy, page)));
const allItems = Array.from({ length: PAGES_PER_COPY }, (_, page) =>
  Array.from({ length: ITEMS_PER_PAGE }, (_, item) => itemLine(page, item))).flat();

function countLines(text: string, line: string): number {
  return text.split("\n").filter((l) => l === line).length;
}

describe("PDF text cleanup (item 1)", () => {
  test("drops the duplicate and triplicate copies and repeated header/footer lines, keeping every line item", () => {
    const cleaned = cleanPages(pdfPages, { dedupePages: true, stripRepeatedLines: true });
    const text = cleaned.pages.map(([, t]) => t).join("\n");

    assert.equal(cleaned.duplicatePagesRemoved, PAGES_PER_COPY * 2);
    assert.deepEqual(cleaned.pages.map(([n]) => n), [1, 2, 3, 4], "keeps the ORIGINAL pages with their page numbers");

    for (const item of allItems) {
      assert.equal(countLines(text, item), 1, `line item kept exactly once: ${item}`);
    }
    // Detail lines repeat under every item on a page, so they are content, not a footer
    assert.equal(countLines(text, "Country Of Origin XX"), allItems.length);
    assert.equal(countLines(text, "Statement No 0000000000"), allItems.length);

    // Header and footer lines are kept once
    for (const line of ["Acme Labels Ltd", "VAT Reg No. XX123456789", "Bank Example Bank IBAN XX00 0000 0000 0000 0000 0000"]) {
      assert.equal(countLines(text, line), 1, line);
    }
    // 6 header and 3 footer lines on each of 4 pages, first occurrences kept
    assert.equal(cleaned.repeatedLinesRemoved, 9 * (PAGES_PER_COPY - 1));
    // Lines on fewer than 80 % of pages are untouched
    assert.equal(countLines(text, "Payment Terms 30 days net"), 1);
    assert.ok(text.includes("Page 4"));
  });

  test("options turn each step off", () => {
    const none = cleanPages(pdfPages, { dedupePages: false, stripRepeatedLines: false });
    assert.equal(none.pages.length, pdfPages.length);
    assert.equal(none.duplicatePagesRemoved, 0);
    assert.equal(none.repeatedLinesRemoved, 0);

    const dedupeOnly = cleanPages(pdfPages, { dedupePages: true, stripRepeatedLines: false });
    assert.equal(dedupeOnly.pages.length, PAGES_PER_COPY);
    assert.equal(dedupeOnly.repeatedLinesRemoved, 0);
  });

  test("does not strip lines when fewer than 3 pages remain", () => {
    const cleaned = cleanPages(copies.map((copy) => invoicePage(copy, 0)), { dedupePages: true, stripRepeatedLines: true });
    assert.equal(cleaned.pages.length, 1);
    assert.equal(cleaned.repeatedLinesRemoved, 0);
  });

  test("pages that differ in content are not treated as duplicates", () => {
    const cleaned = cleanPages([invoicePage("ORIGINAL", 0), invoicePage("ORIGINAL", 1)], { dedupePages: true, stripRepeatedLines: false });
    assert.equal(cleaned.duplicatePagesRemoved, 0);
  });
});

describe("text paging (item 2)", () => {
  // Made-up text with line breaks, quotes and non-ASCII characters (escaped size differs)
  const text = Array.from({ length: 400 }, (_, i) =>
    `${String(i + 1).padStart(5, "0")} "Label" Åäö row ${i + 1} ${"x".repeat(i % 37)}`).join("\n");

  test("reading with text_offset/next_text_offset returns the full text, cut only at line breaks", () => {
    const parts: string[] = [];
    let offset: number | null = 0;
    let calls = 0;
    while (offset !== null) {
      const slice = sliceTextAtLines(text, offset, 1000);
      assert.ok(JSON.stringify(slice.text).length - 2 <= 1000, "slice fits the escaped budget");
      if (slice.nextOffset !== null) {
        assert.ok(slice.text.endsWith("\n"), "cut at a line break");
      }
      parts.push(slice.text);
      offset = slice.nextOffset;
      calls++;
    }
    assert.ok(calls > 5);
    assert.equal(parts.join(""), text);
  });

  test("a line longer than the budget is still returned in parts", () => {
    const long = "a".repeat(2500);
    const first = sliceTextAtLines(long, 0, 1000);
    assert.equal(first.text.length, 1000);
    const second = sliceTextAtLines(long, first.nextOffset!, 1000);
    const third = sliceTextAtLines(long, second.nextOffset!, 1000);
    assert.equal(first.text + second.text + third.text, long);
    assert.equal(third.nextOffset, null);
  });

  test("an exhausted budget returns no text and keeps the offset", () => {
    assert.deepEqual(sliceTextAtLines(text, 42, 0), { text: "", nextOffset: 42 });
    assert.deepEqual(sliceTextAtLines(text, text.length, 1000), { text: "", nextOffset: null });
  });
});
