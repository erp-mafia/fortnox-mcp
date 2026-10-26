/**
 * Best-effort text extraction from downloaded files.
 *
 * PDF extraction uses the `unpdf` package. It is loaded on first use so it doesn't
 * slow down server startup.
 *
 * Supplier PDFs often contain the whole invoice two or three times (pages labelled
 * ORIGINAL, DUPLICATE, TRIPLICATE) and repeat the same header and footer on every
 * page, so the raw text is mostly repetition. PDFs are therefore read page by page,
 * duplicate pages are dropped and header/footer lines repeated on almost every page
 * are kept only once.
 */

export interface TextCleanupOptions {
  /** Drop pages that duplicate an earlier page (ignoring copy labels and page numbers) */
  dedupePages: boolean;
  /** Keep only the first occurrence of lines that repeat on almost every page */
  stripRepeatedLines: boolean;
}

export interface ExtractedText {
  text: string | null;
  note: string | null;
  pages_total: number | null;
  pages_kept: number | null;
  duplicate_pages_removed: number;
  repeated_lines_removed: number;
}

/** A line counts as a repeated header/footer when it is on at least this share of pages */
const REPEATED_LINE_PAGE_SHARE = 0.8;
/** Repeated-line stripping only makes sense with enough pages to tell a pattern */
const REPEATED_LINE_MIN_PAGES = 3;

const COPY_LABEL = /\b(ORIGINAL|DUPLICATE|TRIPLICATE|QUADRUPLICATE|COPY|KOPIA|DUPLIKAT)\b/gi;
const PAGE_NUMBER = /\b(page|sida|seite|pagina|página)\s*\d+(\s*(of|av|von|de|\/)\s*\d+)?/gi;

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

/** Page text with copy labels, page numbers and whitespace differences removed, for comparing pages */
function pageFingerprint(page: string): string {
  return page.replace(COPY_LABEL, "").replace(PAGE_NUMBER, "").replace(/\s+/g, " ").trim();
}

export interface CleanedPages {
  /** Kept pages as [original page number (1-based), text] */
  pages: Array<[number, string]>;
  duplicatePagesRemoved: number;
  repeatedLinesRemoved: number;
}

/**
 * Remove duplicate pages and repeated header/footer lines from per-page text.
 *
 * A line is treated as header/footer only if it appears on at least 80 % of the kept
 * pages and never more than once on a page. Item lines are unique per invoice row, and
 * per-item detail lines that repeat (e.g. "Country of origin") occur several times on a
 * page, so neither is removed. The first occurrence of every line is always kept.
 */
export function cleanPages(pageTexts: string[], options: TextCleanupOptions): CleanedPages {
  let pages: Array<[number, string]> = pageTexts.map((text, i) => [i + 1, text]);
  let duplicatePagesRemoved = 0;
  let repeatedLinesRemoved = 0;

  if (options.dedupePages) {
    const seen = new Set<string>();
    pages = pages.filter(([, text]) => {
      const fingerprint = pageFingerprint(text);
      if (seen.has(fingerprint)) {
        duplicatePagesRemoved++;
        return false;
      }
      seen.add(fingerprint);
      return true;
    });
  }

  if (options.stripRepeatedLines && pages.length >= REPEATED_LINE_MIN_PAGES) {
    const pagesWithLine = new Map<string, number>();
    const repeatedWithinPage = new Set<string>();
    for (const [, text] of pages) {
      const counts = new Map<string, number>();
      for (const line of text.split("\n").map(normalizeLine).filter(Boolean)) {
        counts.set(line, (counts.get(line) ?? 0) + 1);
      }
      for (const [line, count] of counts) {
        pagesWithLine.set(line, (pagesWithLine.get(line) ?? 0) + 1);
        if (count > 1) repeatedWithinPage.add(line);
      }
    }

    const minPages = Math.ceil(pages.length * REPEATED_LINE_PAGE_SHARE);
    const repeated = new Set(
      [...pagesWithLine]
        .filter(([line, count]) => count >= minPages && !repeatedWithinPage.has(line))
        .map(([line]) => line)
    );

    const alreadyKept = new Set<string>();
    pages = pages.map(([pageNumber, text]) => {
      const lines = text.split("\n").filter((line) => {
        const normalized = normalizeLine(line);
        if (!repeated.has(normalized)) return true;
        if (!alreadyKept.has(normalized)) {
          alreadyKept.add(normalized);
          return true;
        }
        repeatedLinesRemoved++;
        return false;
      });
      return [pageNumber, lines.join("\n")];
    });
  }

  return { pages, duplicatePagesRemoved, repeatedLinesRemoved };
}

function isPdf(data: Buffer, contentType: string | null, fileName: string | null): boolean {
  return data.subarray(0, 5).toString("latin1") === "%PDF-" ||
    (contentType ?? "").includes("pdf") ||
    (fileName ?? "").toLowerCase().endsWith(".pdf");
}

function isText(contentType: string | null, fileName: string | null): boolean {
  return (contentType ?? "").startsWith("text/") ||
    /\.(txt|csv|xml|json|html?)$/i.test(fileName ?? "");
}

function result(text: string | null, note: string | null, extra: Partial<ExtractedText> = {}): ExtractedText {
  return {
    text,
    note,
    pages_total: null,
    pages_kept: null,
    duplicate_pages_removed: 0,
    repeated_lines_removed: 0,
    ...extra
  };
}

async function extractPdfText(data: Buffer, options: TextCleanupOptions): Promise<ExtractedText> {
  try {
    const unpdf = await import("unpdf");
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(data));
    const { totalPages, text } = await unpdf.extractText(pdf, { mergePages: false });
    const cleaned = cleanPages(text, options);
    const joined = cleaned.pages
      .map(([pageNumber, pageText]) => `--- Page ${pageNumber} ---\n${pageText.trim()}`)
      .join("\n\n")
      .trim();
    const stats = {
      pages_total: totalPages,
      pages_kept: cleaned.pages.length,
      duplicate_pages_removed: cleaned.duplicatePagesRemoved,
      repeated_lines_removed: cleaned.repeatedLinesRemoved
    };
    const hasText = cleaned.pages.some(([, pageText]) => pageText.trim() !== "");
    return hasText
      ? result(joined, null, stats)
      : result(null, "The PDF contains no extractable text (it may be a scanned image).", stats);
  } catch (error) {
    return result(null, `Could not extract PDF text: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function extractFileText(
  data: Buffer,
  contentType: string | null,
  fileName: string | null,
  options: TextCleanupOptions = { dedupePages: true, stripRepeatedLines: true }
): Promise<ExtractedText> {
  if (isPdf(data, contentType, fileName)) {
    return extractPdfText(data, options);
  }
  if (isText(contentType, fileName)) {
    return result(data.toString("utf8"), null);
  }
  return result(null, `Text extraction is not supported for this file type (${contentType ?? "unknown"}).`);
}

export interface TextSlice {
  text: string;
  /** Offset to pass as text_offset to continue, or null when the text is complete */
  nextOffset: number | null;
}

/**
 * Take a slice of `text` starting at `offset` whose JSON-escaped size is at most
 * `maxChars`, ending at a line break so no row is cut in half. A single line longer
 * than the budget is cut mid-line as a last resort.
 */
export function sliceTextAtLines(text: string, offset: number, maxChars: number): TextSlice {
  const start = Math.min(Math.max(offset, 0), text.length);
  if (maxChars <= 0) {
    return { text: "", nextOffset: start < text.length ? start : null };
  }
  // Size as it will appear inside a JSON string (newlines and quotes are escaped)
  const jsonSize = (s: string) => JSON.stringify(s).length - 2;

  let end = start;
  let used = 0;
  while (end < text.length) {
    const lineBreak = text.indexOf("\n", end);
    const lineEnd = lineBreak === -1 ? text.length : lineBreak + 1;
    const size = jsonSize(text.slice(end, lineEnd));
    if (used + size > maxChars) break;
    used += size;
    end = lineEnd;
  }

  if (end === start && start < text.length) {
    // The next line alone is over budget: cut it, measuring the escaped size per character
    let cut = start;
    while (cut < text.length && used + jsonSize(text[cut]) <= maxChars) {
      used += jsonSize(text[cut]);
      cut++;
    }
    end = Math.max(cut, start + 1);
  }

  return {
    text: text.slice(start, end),
    nextOffset: end < text.length ? end : null
  };
}
