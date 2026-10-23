/**
 * Best-effort text extraction from downloaded files.
 *
 * PDF extraction uses the `unpdf` package. It is loaded on first use so it doesn't
 * slow down server startup.
 */

export interface ExtractedText {
  text: string | null;
  note: string | null;
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

async function extractPdfText(data: Buffer): Promise<ExtractedText> {
  try {
    const unpdf = await import("unpdf");
    const pdf = await unpdf.getDocumentProxy(new Uint8Array(data));
    const { text } = await unpdf.extractText(pdf, { mergePages: true });
    const trimmed = String(text ?? "").trim();
    return trimmed
      ? { text: trimmed, note: null }
      : { text: null, note: "The PDF contains no extractable text (it may be a scanned image)." };
  } catch (error) {
    return { text: null, note: `Could not extract PDF text: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export async function extractFileText(
  data: Buffer,
  contentType: string | null,
  fileName: string | null
): Promise<ExtractedText> {
  if (isPdf(data, contentType, fileName)) {
    return extractPdfText(data);
  }
  if (isText(contentType, fileName)) {
    return { text: data.toString("utf8"), note: null };
  }
  return { text: null, note: `Text extraction is not supported for this file type (${contentType ?? "unknown"}).` };
}
